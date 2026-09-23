/**
 * 工程脚手架生成器入口
 *
 * 根据 framework 将 SceneDSL 转换为完整的前端工程文件集。
 * 每个框架有独立的生成模块，共享 types.ts 和 utils.ts。
 *
 * 用法：
 *   import { generateProjectScaffold } from './scaffold';
 *   const files = generateProjectScaffold(scene, 'react');
 *   // files: ProjectFile[] → 写入 {localWorkDir}/react/
 */

import type { SceneDSL } from "../../types/scene";
import type { CodegenFramework } from "../types";
import type { ProjectFile, ScaffoldContext } from "./types";
import { buildContext } from "./utils";
import { generateReactProject } from "./react";
import { generateVueProject } from "./vue";
import { generateAngularProject } from "./angular";
import { generateStaticHtmlProject } from "./static-html";

/**
 * 生成完整工程脚手架
 *
 * @param scene 场景数据
 * @param framework 目标框架
 * @param iconData 自定义图标数据表（custom-{id} → data URL）
 * @returns 工程文件列表（ProjectFile[]），每个文件含相对路径和内容
 */
export function generateProjectScaffold(
  scene: SceneDSL,
  framework: CodegenFramework,
  iconData?: Record<string, string>,
): ProjectFile[] {
  const ctx: ScaffoldContext = buildContext(scene, framework, iconData);

  switch (framework) {
    case "react":
      return generateReactProject(ctx);
    case "vue":
      return generateVueProject(ctx);
    case "angular":
      return generateAngularProject(ctx);
    case "static-html":
      return generateStaticHtmlProject(ctx);
    default:
      return generateStaticHtmlProject(ctx);
  }
}

// 类型重导出
export type { ProjectFile, ScaffoldContext, ViewScaffold, ScaffoldGenerator } from "./types";
export { generateViewBody } from "./components";
export { generateEventsScript } from "./events";
export { generateDataScript } from "./data";
export type { ViewBodyResult } from "./components";
export type { EventScriptResult } from "./events";
export type { DataScriptResult } from "./data";
