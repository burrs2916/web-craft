/**
 * 组件代码生成 — 桥接引擎组件 codegen 与脚手架生成器
 *
 * 提取引擎中的组件 HTML 生成逻辑为可复用接口，
 * 让 scaffold 生成器可以把真实组件代码嵌入页面骨架。
 */

import type { SceneComponent, EventBinding, DataBinding } from "../../types/editor";
import type { SceneDSL, SceneView } from "../../types/scene";
import type { CodegenContext } from "../types";
import { normalizeCanvasConfig } from "../../types/canvasConfig";
import { componentWrapperStyle, escapeHTML } from "../layout";
import { initBuiltinCodegens, getCodegen } from "../components";

let initialized = false;

function ensureInit(): void {
  if (!initialized) {
    initBuiltinCodegens();
    initialized = true;
  }
}

/**
 * 构建 parentId → 子组件列表映射（与 engine.generateViewPage 一致）：
 * 按 parent.children 顺序排序，隐藏的子组件不纳入。
 * 容器类组件（form-container/navbar/auth-guard 等）通过 ctx.childrenByParent
 * 在自身 codegen 内递归渲染子字段，因此脚手架不应把子组件当作独立顶级组件输出。
 */
function buildChildrenByParent(
  components: SceneComponent[],
  componentMap: Map<string, SceneComponent>,
): Map<string, SceneComponent[]> {
  const childrenByParent = new Map<string, SceneComponent[]>();
  for (const comp of components) {
    if (comp.parentId && comp.visible !== false) {
      const siblings = childrenByParent.get(comp.parentId) ?? [];
      if (!siblings.find((s) => s.id === comp.id)) {
        siblings.push(comp);
      }
      childrenByParent.set(comp.parentId, siblings);
    }
  }
  for (const [pid, siblings] of childrenByParent) {
    const parent = componentMap.get(pid);
    const childIds = parent?.children ?? [];
    siblings.sort((a, b) => {
      const ia = childIds.indexOf(a.id);
      const ib = childIds.indexOf(b.id);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
  }
  return childrenByParent;
}

/**
 * 组件代码生成结果
 */
export interface ViewBodyResult {
  /** 所有组件的 HTML 片段（含绝对定位包装），已按 zIndex 排序 */
  html: string;
  /** 组件声明收集的页面级 CSS 规则 */
  styles: string[];
  /** 组件声明收集的页面级 JS 脚本 */
  scripts: string[];
  /** 组件声明收集的外部依赖 URL */
  externalDeps: string[];
  /** 该视图所有组件上的事件绑定（含组件级 + 视图级） */
  events: EventBinding[];
  /** 该视图所有组件上的数据绑定 */
  dataBindings: DataBinding[];
}

/**
 * 为视图中的所有组件生成 HTML
 *
 * 逻辑与引擎 engine.ts 中的 generateBody + generateComponentHTML 一致，
 * 但只返回组件 HTML 片段（不含画布容器包装），供脚手架生成器嵌入页面文件。
 *
 * 组件按 zIndex 升序排列，不可见组件跳过。
 * 每个组件包装 div 带有 data-component-id 属性，供事件绑定定位 DOM 元素。
 */
export function generateViewBody(
  view: SceneView,
  scene: SceneDSL,
  iconData?: Record<string, string>,
): ViewBodyResult {
  ensureInit();

  const canvasConfig = normalizeCanvasConfig(view.canvasConfig ?? scene.canvasConfig);
  const components = view.components ?? [];
  const componentMap = new Map<string, SceneComponent>(
    components.map((c) => [c.id, c]),
  );

  const childrenByParent = buildChildrenByParent(components, componentMap);

  const ctx: CodegenContext = {
    view,
    canvasConfig,
    scene,
    preview: false,
    componentMap,
    childrenByParent,
    pageStyles: [],
    pageScripts: [],
    externalDeps: [],
    iconData,
  };

  // 仅渲染顶级组件（无 parentId），子组件由父容器 codegen 通过 ctx.childrenByParent 递归渲染
  const visible = components.filter((c) => c.visible !== false && !c.parentId);
  visible.sort((a, b) => a.zIndex - b.zIndex);

  const html = visible
    .map((comp) => generateComponentHTML(comp, ctx))
    .join("\n      ");

  // 收集所有事件绑定：组件级 + 视图级
  const componentEvents: EventBinding[] = [];
  for (const comp of visible) {
    if (comp.events) {
      componentEvents.push(...comp.events.filter((e) => e.enabled !== false));
    }
  }
  const viewEvents = (view.eventBindings ?? []).filter((e) => e.enabled !== false);
  const allEvents = [...componentEvents, ...viewEvents];

  // 收集所有数据绑定：组件级
  const dataBindings: DataBinding[] = [];
  for (const comp of visible) {
    if (comp.bindings) {
      dataBindings.push(...comp.bindings);
    }
  }

  return {
    html,
    styles: ctx.pageStyles,
    scripts: ctx.pageScripts,
    externalDeps: ctx.externalDeps,
    events: allEvents,
    dataBindings,
  };
}

/**
 * 生成单个组件的 HTML（含绝对定位包装 + data-component-id）
 */
function generateComponentHTML(
  component: SceneComponent,
  ctx: CodegenContext,
): string {
  const codegenFn = getCodegen(component.type);

  if (!codegenFn) {
    return generateUnsupportedPlaceholder(component);
  }

  const innerHTML = codegenFn(component, ctx);
  const wrapperStyle = componentWrapperStyle(component);

  return `<div data-component-id="${component.id}" data-component-type="${escapeHTML(component.type)}" style="${wrapperStyle}">${innerHTML}</div>`;
}

/**
 * 生成指定图层下所有组件的 HTML
 *
 * 与 generateViewBody 类似，但只处理属于特定 layerId 的组件。
 * 事件和数据绑定仍在 generateViewBody 中按视图级别收集，
 * 此函数仅返回 HTML 片段，供脚手架按图层拆分组件文件使用。
 *
 * 组件按 zIndex 升序排列，不可见组件跳过。
 */
export function generateLayerHTML(
  layerId: string,
  view: SceneView,
  scene: SceneDSL,
  iconData?: Record<string, string>,
): string {
  ensureInit();

  const canvasConfig = normalizeCanvasConfig(view.canvasConfig ?? scene.canvasConfig);
  const components = view.components ?? [];
  const componentMap = new Map<string, SceneComponent>(
    components.map((c) => [c.id, c]),
  );

  const childrenByParent = buildChildrenByParent(components, componentMap);

  const ctx: CodegenContext = {
    view,
    canvasConfig,
    scene,
    preview: false,
    componentMap,
    childrenByParent,
    pageStyles: [],
    pageScripts: [],
    externalDeps: [],
    iconData,
  };

  // 仅取该图层下的顶级组件（无 parentId）；子组件由父容器 codegen 递归渲染
  const layerComponents = components
    .filter((c) => c.visible !== false && c.layerId === layerId && !c.parentId)
    .sort((a, b) => a.zIndex - b.zIndex);

  return layerComponents
    .map((comp) => generateComponentHTML(comp, ctx))
    .join("\n      ");
}

/**
 * 不支持的组件占位符
 */
function generateUnsupportedPlaceholder(component: SceneComponent): string {
  const wrapperStyle = componentWrapperStyle(component);
  const placeholderStyle =
    "width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,152,0,0.1);border:1px dashed rgba(255,152,0,0.4);border-radius:4px;color:rgba(255,152,0,0.8);font-size:12px";

  return `<div data-component-id="${component.id}" data-component-type="${escapeHTML(component.type)}" style="${wrapperStyle}"><div style="${placeholderStyle}">${escapeHTML(component.type)} (codegen 待实现)</div></div>`;
}
