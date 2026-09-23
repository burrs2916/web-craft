/**
 * 工程脚手架生成器 — 类型定义
 *
 * 将 SceneDSL 转换为完整的前端工程结构（package.json, vite.config, 路由, 页面骨架等）。
 * 与现有的 CDN 独立 HTML 生成器（../engine.ts）互补：
 *   - 预览：CDN HTML（快速、无需安装依赖）
 *   - 发布：完整工程（专业、可维护、可部署）
 */

import type { CodegenFramework } from "../types";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

/**
 * 生成的工程文件
 */
export interface ProjectFile {
  /** 相对于工程根目录的路径，如 "src/pages/Home.tsx" */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件描述（用于日志和提示） */
  description?: string;
}

/**
 * 脚手架生成上下文
 */
export interface ScaffoldContext {
  /** 场景数据 */
  scene: SceneDSL;
  /** 目标框架 */
  framework: CodegenFramework;
  /** 项目名称（从 scene.name 派生） */
  projectName: string;
  /** 项目描述（从 scene.description 派生） */
  projectDescription: string;
  /** 自定义图标数据表（custom-{id} → data URL） */
  iconData?: Record<string, string>;
}

/**
 * 单个视图的派生信息
 */
export interface ViewScaffold {
  /** 视图 ID */
  id: string;
  /** 视图原始名称 */
  name: string;
  /** PascalCase 组件名，如 "Home"、"About" */
  componentName: string;
  /** kebab-case 文件名，如 "home"、"about" */
  fileName: string;
  /** 路由路径，如 "/"、"/about" */
  routePath: string;
  /** 视图在 scene.views 中的索引 */
  index: number;
  /** 画布宽度 */
  canvasWidth: number;
  /** 画布高度 */
  canvasHeight: number;
  /** 画布背景色 */
  canvasBackground: string;
  /** 画布字体 */
  canvasFontFamily: string;
}

/**
 * 单个图层的派生信息
 *
 * 当视图包含多个图层时，每个图层对应一个 LayerScaffold，
 * 用于在脚手架生成器中按图层拆分组件文件和目录。
 */
export interface LayerScaffold {
  /** 图层 ID */
  id: string;
  /** 图层原始名称 */
  name: string;
  /** PascalCase 组件名，如 "Header"、"ContentLayer" */
  componentName: string;
  /** kebab-case 文件名，如 "header"、"content-layer" */
  fileName: string;
  /** 图层顺序（渲染顺序） */
  order: number;
  /** 是否可见 */
  visible: boolean;
  /** 透明度（0-1） */
  opacity: number;
  /** 该图层下的组件列表 */
  components: SceneComponent[];
  /** 是否为默认图层 */
  isDefault: boolean;
  /** 是否为背景图层 */
  isBackground: boolean;
}

/**
 * 脚手架生成函数签名
 */
export type ScaffoldGenerator = (ctx: ScaffoldContext) => ProjectFile[];
