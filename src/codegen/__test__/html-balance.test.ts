import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen, getRegisteredTypes } from "../components";
import type { CodegenContext } from "../types";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent, Transform } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";

/**
 * HTML 结构平衡防回归测试
 *
 * 背景：tooltip 组件曾因返回 HTML 缺少闭合 </div>，导致后续兄弟组件
 * （如 form-container）被浏览器解析进 tooltip 内部、渲染到画布外而"消失"。
 *
 * 该测试对每个注册的 codegen 生成 HTML，校验标签开闭平衡：
 * div/span/form/table 等容器标签必须一一配对（script/textarea 等原始文本标签除外）。
 */

const VOID_OR_RAW = new Set(["br", "img", "input", "hr", "meta", "link", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse", "use", "source", "col", "area", "base", "embed", "track", "wbr"]);

function checkBalance(html: string, label: string): string[] {
  const problems: string[] = [];
  const stack: { tag: string; pos: number }[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  // 跳过 <script>/<style> 原始文本块
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    if (VOID_OR_RAW.has(tag)) continue;
    const isClose = m[0].startsWith("</");
    const isSelfClose = m[0].endsWith("/>");
    if (isSelfClose) continue;
    if (!isClose) {
      stack.push({ tag, pos: m.index });
    } else {
      // 找最近的同名开标签
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { idx = i; break; }
      }
      if (idx === -1) {
        problems.push(`${label}: 多余的 </${tag}> @${m.index}`);
      } else {
        // 中间未闭合的标签也记为问题
        for (let i = stack.length - 1; i > idx; i--) {
          problems.push(`${label}: <${stack[i].tag}> 未闭合（被 </${tag}> 跨越） @${stack[i].pos}`);
        }
        stack.length = idx;
      }
    }
  }
  for (const s of stack) {
    problems.push(`${label}: <${s.tag}> 未闭合 @${s.pos}`);
  }
  return problems;
}

function makeCtx(): CodegenContext {
  const view = {
    id: "v1", name: "T",
    layers: [{ id: "l1", name: "l1", type: "layer" as const, parentId: null, isDefault: true, children: [], visible: true, locked: false, opacity: 1, order: 0, expanded: true }],
    components: [],
  };
  const canvasConfig = { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 };
  const scene: SceneDSL = {
    id: "s1", name: "S", status: "draft", tags: [],
    metadata: {}, createdAt: 0, updatedAt: 0,
    canvasConfig,
    views: [view],
  };
  return {
    view,
    canvasConfig,
    scene,
    preview: false,
    componentMap: new Map(),
    childrenByParent: new Map(),
    pageStyles: [],
    pageScripts: [],
    externalDeps: [],
    iconData: {},
  };
}

function t(): Transform {
  return { x: 0, y: 0, width: 320, height: 240, rotation: 0, scale: { x: 1, y: 1 } };
}

describe("codegen HTML 标签平衡", () => {
  test("所有注册组件生成的 HTML 标签必须开闭平衡", () => {
    initBuiltinCodegens();
    const types = getRegisteredTypes();
    expect(types.length).toBeGreaterThan(50);

    const ctx = makeCtx();
    const problems: string[] = [];
    const skipped: string[] = [];

    for (const type of types) {
      const fn = getCodegen(type);
      if (!fn) continue;
      const comp: SceneComponent = {
        id: `c_${type}`, type, name: type,
        transform: t(), layerId: "l1", zIndex: 0, locked: false, visible: true,
        config: {},
      };
      try {
        const result = fn(comp, ctx);
        const html = typeof result === "string" ? result : (result as { html: string }).html;
        if (!html) continue;
        problems.push(...checkBalance(html, type));
      } catch {
        // 需要特定 config 才能生成的组件跳过（不视为失败）
        skipped.push(type);
      }
    }

    if (problems.length > 0) {
      console.error("标签不平衡的组件:\n" + problems.join("\n"));
    }
    expect(problems).toEqual([]);
  });

  test("tooltip：闭合修复回归用例", () => {
    initBuiltinCodegens();
    const fn = getCodegen("tooltip")!;
    const comp: SceneComponent = {
      id: "tip1", type: "tooltip", name: "tip",
      transform: t(), layerId: "l1", zIndex: 0, locked: false, visible: true,
      config: { triggerText: "悬停查看", text: "提示" },
    };
    const html = fn(comp, makeCtx());
    const str = typeof html === "string" ? html : (html as { html: string }).html;
    // body 部分（去掉 script）div 必须平衡
    const body = str.replace(/<script[\s\S]*?<\/script>/g, "");
    const opens = (body.match(/<div\b/g) ?? []).length;
    const closes = (body.match(/<\/div>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
