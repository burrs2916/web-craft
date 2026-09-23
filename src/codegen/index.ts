export { generateHTML } from "./engine";
export { initBuiltinCodegens, registerCodegen, getCodegen, isSupported, getRegisteredTypes } from "./components";
export type {
  GeneratedPage,
  CodegenOptions,
  CodegenFramework,
  CodegenContext,
  AssembleParams,
  FrameworkAssembleFn,
  ComponentCodegenFn,
  ComponentCodegenEntry,
} from "./types";
export { assembleVueHTML, assembleReactHTML, assembleAngularHTML } from "./frameworks";

// 工程脚手架生成器
export { generateProjectScaffold } from "./scaffold";
export type { ProjectFile, ScaffoldContext, ViewScaffold } from "./scaffold";
