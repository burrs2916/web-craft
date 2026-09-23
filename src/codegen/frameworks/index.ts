/**
 * 框架模板生成器 — barrel export
 *
 * 每个框架生成器接收相同的 AssembleParams，输出框架特定的完整 HTML 文档。
 * 组件 HTML 片段在所有框架中保持一致（绝对定位），差异在于：
 * - CDN 运行时脚本
 * - 挂载点 DOM 结构
 * - 引导（bootstrap）脚本
 */

export type { FrameworkAssembleFn } from "../types";
export { assembleVueHTML } from "./vue";
export { assembleReactHTML } from "./react";
export { assembleAngularHTML } from "./angular";

import type { CodegenFramework, FrameworkAssembleFn } from "../types";
import { assembleVueHTML } from "./vue";
import { assembleReactHTML } from "./react";
import { assembleAngularHTML } from "./angular";

/**
 * 根据框架类型获取对应的模板组装函数
 */
export function getFrameworkAssembler(framework: CodegenFramework): FrameworkAssembleFn {
  switch (framework) {
    case "vue":
      return assembleVueHTML;
    case "react":
      return assembleReactHTML;
    case "angular":
      return assembleAngularHTML;
    case "static-html":
    default:
      // static-html 使用 engine.ts 内置的 assembleHTML
      return null as never; // 由 engine.ts 处理
  }
}
