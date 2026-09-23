import type { SceneComponent } from "../types/editor";
import type { SceneDSL, SceneView, SceneDataSource } from "../types/scene";
import type { CanvasConfig } from "../types/canvasConfig";

export type { SceneDSL, SceneView };

/**
 * Codegen 生成结果 — 单个 HTML 页面
 */
export interface GeneratedPage {
  /** 文件名（不含路径，如 index.html / about.html） */
  filename: string;
  /** 页面标题 */
  title: string;
  /** 完整 HTML 文档字符串 */
  html: string;
  /** 该页面对应的视图 ID */
  viewId: string;
}

/**
 * Codegen 引擎选项
 */
export interface CodegenOptions {
  /** 模板框架 */
  framework: CodegenFramework;
  /** 是否为预览模式（预览模式不压缩、加注释） */
  preview: boolean;
  /** 输出目录（发布模式写入 dist，预览模式写临时目录） */
  outputDir?: string;
  /** 自定义图标数据表（custom-{id} → data URL），由 codegenService 预取注入 */
  iconData?: Record<string, string>;
}

/**
 * 支持的代码生成框架
 * - static-html: 纯 HTML/CSS，零依赖
 * - vue: Vue 3 CDN 运行时
 * - react: React 18 CDN 运行时
 * - angular: Angular CDN 运行时
 */
export type CodegenFramework = "static-html" | "vue" | "react" | "angular";

/**
 * 组件 codegen 上下文 — 传递给每个组件生成函数
 */
export interface CodegenContext {
  /** 当前视图 */
  view: SceneView;
  /** 画布配置 */
  canvasConfig: CanvasConfig;
  /** 整个场景 DSL（用于跨视图引用） */
  scene: SceneDSL;
  /** 是否预览模式 */
  preview: boolean;
  /** 视图内所有组件的 Map（by id），用于查找父子关系 */
  componentMap: Map<string, SceneComponent>;
  /** 父组件 ID → 子组件列表（仅含直接子组件，已按 children 顺序排序） */
  childrenByParent?: Map<string, SceneComponent[]>;
  /** 页面级 CSS 收集器（组件可往里加全局 CSS） */
  pageStyles: string[];
  /** 页面级 JS 收集器（组件可往里加 <script> 内容） */
  pageScripts: string[];
  /** 外部依赖（CDN 链接等） */
  externalDeps: string[];
  /** 自定义图标数据表（custom-{id} → data URL） */
  iconData?: Record<string, string>;
  /** 全局数据源（id → source），组件配置 dataSourceId 时据此读取发布端数据 */
  globalDataSources?: Record<string, SceneDataSource>;
}

/**
 * 组件 codegen 函数签名
 * @param component 场景组件
 * @param ctx codegen 上下文
 * @returns 生成的 HTML 片段（不含外层定位包装）
 */
export type ComponentCodegenFn = (
  component: SceneComponent,
  ctx: CodegenContext,
) => string;

/**
 * 组件 codegen 注册项
 */
export interface ComponentCodegenEntry {
  type: string;
  fn: ComponentCodegenFn;
}

/**
 * 背景样式生成结果
 */
export interface BackgroundStyle {
  css: string;
  /** 需要的 HTML 子元素（如视频背景的 <video> 标签） */
  html?: string;
}

/**
 * HTML 组装参数 — 所有框架模板共享
 */
export interface AssembleParams {
  title: string;
  description: string;
  keywords: string[];
  favicon: string;
  fontFamily: string;
  canvasWidth: number;
  canvasHeight: number;
  maxWidth: number | null;
  padding: { top: number; right: number; bottom: number; left: number };
  bgStyle: { css: string; html?: string };
  bodyContent: string;
  pageStyles: string[];
  pageScripts: string[];
  externalDeps: string[];
  preview: boolean;
  /** 注入到 <head> 的额外脚本（全局配置等），在页面脚本之前执行 */
  headScripts?: string;
}

/**
 * 框架模板组装函数签名
 */
export type FrameworkAssembleFn = (params: AssembleParams) => string;
