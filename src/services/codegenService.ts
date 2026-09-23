import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { generateHTML, generateProjectScaffold } from "../codegen";
import { collectCustomIconIds } from "../codegen/iconPipeline";
import type { GeneratedPage, CodegenFramework } from "../codegen/types";
import type { ProjectFile } from "../codegen/scaffold/types";
import type { SceneDSL } from "../types/scene";
import { iconsApi } from "./tauri";
import logger from "../utils/logger";

/**
 * 代码生成服务 — 预览、发布、构建和部署的业务编排层
 *
 * 预览：生成完整多文件工程 + CDN HTML（index.html 可即时预览，工程文件供查看编辑）
 * 发布：完整工程脚手架 → 写入 {localWorkDir}/{framework}/（专业、可维护、可部署）
 * 构建：在 scaffold 目录运行 npm install + build → 产出 dist/（static-html 直接复制）
 * 部署：将 dist/ 上传到远端服务器（蓝绿部署 + Nginx 代理）
 *
 * 全链路：codegen → scaffold → build → dist/ → deploy
 */

const PREVIEW_FALLBACK_DIR = "web-craft-preview";

/**
 * 生成发布自检诊断文件（不进入页面）。
 * 排查"表单容器/监听组件的子组件在发布产物中缺失/不可见"时，
 * 该文件如实记录：每个 form-container 的真实 children 引用、每个表单字段的 parentId/visible/layerId。
 * 文件写入 {localWorkDir}/{framework}/_wc_debug_form.json。
 */
function buildFormDebugJson(scene: SceneDSL): string {
  const comps = (scene.views ?? []).flatMap((v) => v.components ?? []);
  const typeSet = new Set<string>();
  comps.forEach((c) => typeSet.add(c.type));
  const formContainers = comps
    .filter((c) => c.type === "form-container")
    .map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId ?? null,
      layerId: c.layerId,
      visible: c.visible !== false,
      childRefs: c.children ?? [],
      config: c.config ?? {},
    }));
  const fields = comps
    .filter((c) => /^(form-input|form-textarea|form-select|form-checkbox|form-radio|form-date|form-number|form-switch)$/.test(c.type))
    .map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      parentId: c.parentId ?? null,
      layerId: c.layerId,
      visible: c.visible !== false,
    }));
  return JSON.stringify(
    {
      totalComponents: comps.length,
      componentTypes: Array.from(typeSet).sort(),
      formContainerCount: formContainers.length,
      formFieldsCount: fields.length,
      formContainers,
      fields,
      hint:
        formContainers.length === 0
          ? "场景中没有 form-container 组件 —— 检查拖动的组件 type 是否为 form-container"
          : fields.length === 0
            ? "存在 form-container 但没有任何表单字段组件 —— 字段是否作为子级加入了容器？"
            : "存在表单容器与字段，请检查下方各自 parentId/childRefs 是否互相对应",
    },
    null,
    2,
  );
}

/**
 * 预取场景引用的自定义图标（custom-{id} → data URL）
 * 批量接口只返回小图标，大图标按需单独取；非 Tauri 环境返回空表
 */
async function resolveSceneIcons(scene: SceneDSL): Promise<Record<string, string>> {
  const ids = collectCustomIconIds(scene);
  if (ids.length === 0) return {};
  const out: Record<string, string> = {};
  try {
    const batch = await iconsApi.getCustomIconUrls();
    for (const id of ids) {
      const rawId = id.replace(/^custom-/, "");
      if (batch[rawId]) out[id] = batch[rawId];
    }
    await Promise.all(
      ids
        .filter((id) => !out[id])
        .map(async (id) => {
          try {
            const rawId = id.replace(/^custom-/, "");
            const url = await iconsApi.getCustomIconUrl(rawId);
            if (url) out[id] = url;
          } catch {
            // 单个图标缺失不影响整体生成
          }
        }),
    );
  } catch (error) {
    logger.warn("CodegenService", "resolveSceneIcons failed", { error });
  }
  return out;
}

/**
 * 获取场景绑定的本地工作目录（绝对路径），未设置则返回 null
 */
function getLocalWorkDir(scene: SceneDSL): string | null {
  const dir = scene.metadata?.localWorkDir;
  return typeof dir === "string" && dir.length > 0 ? dir : null;
}

/**
 * 所有支持的框架列表（用于跨框架清理）
 */
const ALL_FRAMEWORKS: CodegenFramework[] = ["static-html", "vue", "react", "angular"];

/**
 * 清理其他框架的输出目录（仅在 localWorkDir 模式下执行）
 * 切换框架预览/发布时，旧框架目录不再残留
 */
async function cleanOtherFrameworkDirs(
  scene: SceneDSL,
  currentFramework: CodegenFramework,
): Promise<void> {
  const workDir = getLocalWorkDir(scene);
  if (!workDir) return; // fallback 模式不清理（各场景独立目录）

  const others = ALL_FRAMEWORKS.filter((fw) => fw !== currentFramework);
  await Promise.all(
    others.map(async (fw) => {
      const dir = `${workDir}/${fw}`;
      try {
        await invoke("clean_output_dir", { dir });
      } catch {
        // 目录不存在或清理失败均忽略（非致命）
      }
    }),
  );
}

/**
 * 计算预览输出目录
 * - 有 localWorkDir：{localWorkDir}/{framework}/  （绝对路径，Rust 端直接使用）
 * - 无 localWorkDir：web-craft-preview/{sceneId}/{framework}  （相对路径，Rust 端拼接到 app_data_dir）
 */
function resolvePreviewDir(scene: SceneDSL, framework: CodegenFramework): string {
  const workDir = getLocalWorkDir(scene);
  if (workDir) {
    return `${workDir}/${framework}`;
  }
  return `${PREVIEW_FALLBACK_DIR}/${scene.id}/${framework}`;
}

/**
 * 计算发布输出目录
 * - 有 localWorkDir：{localWorkDir}/{framework}/  （绝对路径）
 * - 无 localWorkDir：web-craft-preview/{sceneId}/{framework}  （相对路径，Rust 端拼接到 app_data_dir）
 */
function resolvePublishDir(scene: SceneDSL, framework: CodegenFramework): string {
  const workDir = getLocalWorkDir(scene);
  if (workDir) {
    return `${workDir}/${framework}`;
  }
  return `${PREVIEW_FALLBACK_DIR}/${scene.id}/${framework}`;
}

/**
 * 预览场景 — 生成 CDN 独立 HTML 并在本地打开
 *
 * 预览目录包含两部分：
 * 1. 完整多文件工程结构（package.json、src/、构建配置等）— 供查看和编辑
 * 2. CDN 独立 HTML（index.html）— 自包含、可即时通过 HTTP 服务器打开预览
 *
 * CDN HTML 作为 index.html 覆盖 scaffold 的 Vite 入口 index.html，
 * 这样用户既能即时预览效果，又能在目录中看到/编辑完整工程文件。
 *
 * @param framework 模板框架（vue/react/angular/static-html）
 * @param includeDebug 可选：附带 _wc_debug_form.json 自检诊断文件（默认不带）
 */
export async function previewScene(
  scene: SceneDSL,
  options?: { viewId?: string; framework?: CodegenFramework; includeDebug?: boolean },
): Promise<{ pages: GeneratedPage[]; previewUrl: string }> {
  const framework = options?.framework ?? "static-html";
  const outputDir = resolvePreviewDir(scene, framework);
  logger.info("CodegenService", "previewScene start", {
    sceneId: scene.id,
    framework,
    outputDir,
    viewCount: scene.views?.length ?? 0,
  });

  // 1. 清空输出目录，确保不残留旧文件
  await invoke("clean_output_dir", { dir: outputDir });

  // 1b. 清理其他框架的残留目录（切框架时自动清理旧框架）
  await cleanOtherFrameworkDirs(scene, framework);

  // 2. 预取自定义图标（custom-{id} → data URL）
  const iconData = await resolveSceneIcons(scene);

  // 3. 生成完整多文件工程结构（scaffold，包含 Vite 入口 index.html）
  const scaffoldFiles = generateProjectScaffold(scene, framework, iconData);
  // 自检诊断文件：仅在显式开启时附带，预览产物保持干净
  if (options?.includeDebug) {
    scaffoldFiles.push({ path: "_wc_debug_form.json", content: buildFormDebugJson(scene) });
  }

  // 4. 写入工程文件到框架根目录（与 publish 路径一致，确保 buildProject 可直接使用）
  for (const file of scaffoldFiles) {
    await invoke("write_preview_file", {
      dir: outputDir,
      filename: file.path,
      content: file.content,
    });
  }
  logger.info("CodegenService", "previewScene scaffold files written", {
    fileCount: scaffoldFiles.length,
    outputDir,
  });

  // 5. 生成 CDN 预览 HTML（自包含，可即时打开），合并为单个 preview.html
  const pages = generateHTML(scene, {
    framework,
    preview: true,
    iconData,
  });

  // 预览模式：将所有视图合并到单个 preview.html，支持 SPA 式内容切换
  const combinedPage = combinePreviewPages(pages);

  // viewId 模式：跳转到指定视图（合并后通过 URL hash 实现）
  if (options?.viewId) {
    const previewUrl = await writePreviewFiles([combinedPage], outputDir);
    try { await invoke("open_in_finder", { dir: outputDir }); } catch {}
    return { pages: [combinedPage], previewUrl };
  }

  const previewUrl = await writePreviewFiles([combinedPage], outputDir);

  // 预览目录也包含完整工程结构，打开 Finder 让用户可见
  try {
    await invoke("open_in_finder", { dir: outputDir });
  } catch (err) {
    logger.warn("CodegenService", "open_in_finder failed (non-fatal)", { error: err, dir: outputDir });
  }

  logger.info("CodegenService", "previewScene done", { pageCount: 1, previewUrl, outputDir });
  return { pages: [combinedPage], previewUrl };
}

/**
 * 发布场景 — 生成完整工程脚手架并写入输出目录
 *
 * 生成包含 package.json、构建配置、路由、页面骨架的完整前端工程，
 * 用户可进入目录执行 npm install && npm run dev 启动项目。
 *
 * 输出目录默认为场景绑定的 localWorkDir/{framework}/。
 *
 * @param framework 模板框架（vue/react/angular/static-html）
 * @param outputDir 可选的自定义输出目录，覆盖默认计算逻辑
 * @param includeDebug 可选：附带 _wc_debug_form.json 自检诊断文件（默认不带，排查组件缺失时手动开启）
 */
export async function publishScene(
  scene: SceneDSL,
  options?: { framework?: CodegenFramework; outputDir?: string; includeDebug?: boolean },
): Promise<{ files: ProjectFile[]; outputDir: string }> {
  const framework = options?.framework ?? "static-html";
  const dir = options?.outputDir ?? resolvePublishDir(scene, framework);
  logger.info("CodegenService", "publishScene start", {
    sceneId: scene.id,
    framework,
    outputDir: dir,
  });

  // 清空输出目录，确保不残留旧文件
  await invoke("clean_output_dir", { dir });

  // 清理其他框架的残留目录（切框架发布时自动清理旧框架）
  await cleanOtherFrameworkDirs(scene, framework);

  // 预取自定义图标并注入生成管线
  const iconData = await resolveSceneIcons(scene);
  const files = generateProjectScaffold(scene, framework, iconData);
  // 自检诊断文件：仅在显式开启时附带（排查组件缺失用），正常发布产物保持干净
  if (options?.includeDebug) {
    files.push({
      path: "_wc_debug_form.json",
      content: buildFormDebugJson(scene),
    });
  }
  await writeProjectFiles(files, dir);

  // 生成完成后自动在文件管理器中打开目录，让用户立即可见
  try {
    await invoke("open_in_finder", { dir });
  } catch (err) {
    logger.warn("CodegenService", "open_in_finder failed (non-fatal)", { error: err, dir });
  }

  logger.info("CodegenService", "publishScene done", { fileCount: files.length, outputDir: dir, framework });
  return { files, outputDir: dir };
}

/**
 * 仅生成 HTML（不写入文件）— 供 UI 层直接使用（CDN 模式）
 */
export function generateSceneHTML(
  scene: SceneDSL,
  preview: boolean = false,
): GeneratedPage[] {
  return generateHTML(scene, {
    framework: "static-html",
    preview,
  });
}

// ── 文件写入 ──────────────────────────────────────────────

/**
 * 将多视图页面合并为单个 preview.html，支持 SPA 式内容切换。
 * 每个视图的 body 内容包裹在 <div data-view-id="xxx"> 中，
 * 菜单链接用 data-view-link="viewId" 触发 JS 切换。
 */
function combinePreviewPages(pages: GeneratedPage[]): GeneratedPage {
  if (pages.length <= 1) {
    return { ...pages[0], filename: "preview.html" };
  }

  const firstPage = pages[0];

  // 提取每个页面的 body 内容（用 lastIndexOf 精确定位 </body>，避免被脚本中的字符串误导）
  const viewDivs = pages.map((page, i) => {
    const html = page.html;
    const bodyOpen = html.match(/<body[^>]*>/i);
    const bodyCloseIdx = html.lastIndexOf("</body>");
    let bodyContent = "";
    if (bodyOpen && bodyCloseIdx > bodyOpen.index!) {
      bodyContent = html.slice(bodyOpen.index! + bodyOpen[0].length, bodyCloseIdx).trim();
    }
    const viewId = page.viewId ?? `view-${i}`;
    const display = i === 0 ? "" : "display:none";
    return `  <div data-view-id="${viewId}" style="${display}">\n    ${bodyContent}\n  </div>`;
  });

  // 视图切换脚本（rejection guard 已在各框架模板 <head> 最早注入，这里不需要再重复）
  const switcherScript = `<script>(function(){function init(){var views=document.querySelectorAll('[data-view-id]');function switchTo(targetId){views.forEach(function(v){v.style.display=v.getAttribute('data-view-id')===targetId?'':'none'})}document.addEventListener('click',function(e){var link=e.target.closest('[data-view-link]');if(!link)return;e.preventDefault();var targetId=link.getAttribute('data-view-link');switchTo(targetId);history.replaceState(null,'','#'+targetId)});window.addEventListener('hashchange',function(){var h=location.hash.slice(1);if(h)switchTo(h)});var initialHash=location.hash.slice(1);if(initialHash)switchTo(initialHash)}if(document.readyState!=='loading')init();else document.addEventListener('DOMContentLoaded',init)})()</script>`;

  // 用 lastIndexOf 精确替换 body 内容，避免正则非贪婪匹配被脚本字符串误导
  const bodyOpenMatch = firstPage.html.match(/<body[^>]*>/i);
  const bodyCloseIdx = firstPage.html.lastIndexOf("</body>");
  let combinedHtml: string;
  if (bodyOpenMatch && bodyCloseIdx > bodyOpenMatch.index!) {
    const before = firstPage.html.slice(0, bodyOpenMatch.index! + bodyOpenMatch[0].length);
    const after = firstPage.html.slice(bodyCloseIdx);
    combinedHtml = before + "\n" + viewDivs.join("\n") + "\n" + switcherScript + "\n" + after;
  } else {
    // fallback: 直接拼接
    combinedHtml = firstPage.html + "\n" + viewDivs.join("\n") + "\n" + switcherScript;
  }

  return {
    ...firstPage,
    filename: "preview.html",
    html: combinedHtml,
  };
}

/**
 * 写入预览文件到指定目录（CDN HTML 模式）
 */
async function writePreviewFiles(
  pages: GeneratedPage[],
  dir: string,
): Promise<string> {
  try {
    for (const page of pages) {
      await invoke("write_preview_file", {
        dir,
        filename: page.filename,
        content: page.html,
      });
    }

    const firstPage = pages[0];
    const previewUrl = await invoke<string>("get_preview_url", {
      dir,
      filename: firstPage.filename,
    });

    return previewUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("CodegenService", "writePreviewFiles failed", { error: msg, dir });

    return `preview://${pages[0]?.filename ?? "index.html"}`;
  }
}

/**
 * 写入工程文件到输出目录（脚手架模式，支持嵌套路径）
 *
 * 每个文件的 path 是相对路径（如 "src/pages/Home.tsx"），
 * Rust 端 write_publish_file 会自动创建所需的父目录。
 */
async function writeProjectFiles(
  files: ProjectFile[],
  dir: string,
): Promise<void> {
  try {
    for (const file of files) {
      await invoke("write_publish_file", {
        dir,
        filename: file.path,
        content: file.content,
      });
    }
    logger.info("CodegenService", "writeProjectFiles done", { fileCount: files.length, dir });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("CodegenService", "writeProjectFiles failed", { error: msg, dir });
    throw new Error(`Failed to write project files: ${msg}`);
  }
}

// ── Node.js 环境检查 ────────────────────────────────────────

export interface NodeCheckResult {
  nodeAvailable: boolean;
  npmAvailable: boolean;
  nodeVersion?: string;
  npmVersion?: string;
}

/**
 * 检查 Node.js 和 npm 是否可用
 */
export async function checkNodeAvailable(): Promise<NodeCheckResult> {
  return invoke<NodeCheckResult>("check_node_available");
}

// ── 构建管线 ────────────────────────────────────────────────

export interface BuildResult {
  success: boolean;
  framework: string;
  projectDir: string;
  distDir: string;
  fileCount: number;
  durationMs: number;
  error?: string;
  logs: string[];
}

export interface BuildProgress {
  step: string;
  message: string;
  percent: number;
}

/**
 * 构建项目 — 在 scaffold 目录运行 npm install + build，产出 dist/
 *
 * @param scene 场景
 * @param framework 框架
 * @param onProgress 构建进度回调
 * @returns 构建结果
 */
export async function buildProject(
  scene: SceneDSL,
  framework: CodegenFramework,
  onProgress?: (progress: BuildProgress) => void,
): Promise<BuildResult> {
  const workDir = getLocalWorkDir(scene);
  if (!workDir) {
    throw new Error("场景未绑定 localWorkDir，无法构建");
  }

  const projectDir = `${workDir}/${framework}`;
  const distDir = `${workDir}/${framework}/dist`;

  logger.info("CodegenService", "buildProject start", { projectDir, framework, distDir });

  // 监听构建进度
  let unlisten: (() => void) | null = null;
  if (onProgress) {
    unlisten = await listen<BuildProgress>("build-progress", (event) => {
      onProgress(event.payload);
    });
  }

  try {
    const result = await invoke<BuildResult>("build_project", {
      dir: projectDir,
      framework,
      outputDist: distDir,
    });

    logger.info("CodegenService", "buildProject done", {
      success: result.success,
      fileCount: result.fileCount,
      durationMs: result.durationMs,
      distDir: result.distDir,
    });

    return result;
  } finally {
    if (unlisten) unlisten();
  }
}

// ── 全链路：发布 → 构建 → 部署 ──────────────────────────────

export interface FullPipelineResult {
  publish: { files: ProjectFile[]; outputDir: string };
  build: BuildResult;
  deployOutcome?: unknown;
}

/**
 * 全链路：生成脚手架 → 构建 → 部署
 *
 * 1. publishScene: 生成完整工程到 {localWorkDir}/{framework}/
 * 2. buildProject: npm install + build → {localWorkDir}/dist/
 * 3. site_deploy: 上传 dist/ 到远端服务器（蓝绿部署 + Nginx）
 *
 * @param scene 场景
 * @param framework 框架
 * @param onProgress 进度回调（含 build 和 deploy 阶段）
 * @returns 全链路结果
 */
export async function publishBuildAndDeploy(
  scene: SceneDSL,
  framework: CodegenFramework,
  onProgress?: (phase: "publish" | "build" | "deploy", progress: { step: string; message: string; percent: number }) => void,
): Promise<FullPipelineResult> {
  // Phase 1: 发布（生成脚手架）
  onProgress?.("publish", { step: "publish", message: "生成工程脚手架", percent: 5 });
  const publishResult = await publishScene(scene, { framework });
  onProgress?.("publish", { step: "publish-done", message: "脚手架生成完成", percent: 10 });

  // Phase 2: 构建
  onProgress?.("build", { step: "build-start", message: "开始构建", percent: 15 });
  const buildResult = await buildProject(scene, framework, (p) => {
    // 构建进度映射到 15%-80%
    const adjusted = {
      step: p.step,
      message: p.message,
      percent: 15 + Math.round(p.percent * 0.65),
    };
    onProgress?.("build", adjusted);
  });

  if (!buildResult.success) {
    throw new Error(`构建失败: ${buildResult.error ?? "未知错误"}`);
  }

  // Phase 3: 部署（调用 site_deploy 命令）
  // 获取绑定的 siteId
  const siteId = scene.metadata?.boundSiteId as string | undefined;
  if (siteId) {
    onProgress?.("deploy", { step: "deploy-start", message: "开始部署", percent: 85 });
    try {
      const deployOutcome = await invoke("site_deploy", { siteId });
      onProgress?.("deploy", { step: "deploy-done", message: "部署完成", percent: 100 });
      return { publish: publishResult, build: buildResult, deployOutcome };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("CodegenService", "deploy failed", { error: msg });
      throw new Error(`部署失败: ${msg}`);
    }
  }

  // 无绑定站点 → 只返回构建结果
  onProgress?.("deploy", { step: "skip", message: "未绑定站点，跳过部署", percent: 100 });
  return { publish: publishResult, build: buildResult };
}
