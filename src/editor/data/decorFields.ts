/**
 * 装饰组件组「填充 / 效果」面板片段的**唯一来源**。
 *
 * 背景：形状组（`shape`）自 2.0.0 起就有"渐变填充 + 轮廓阴影"，装饰组的 20 个原生形状
 * 却只有一个纯色填充色 —— 同一族几何、两套面板能力。此文件把这两段面板声明收成一份，
 * 由 `registerDecorationComponents` 按形状能力追加，避免在 20 个注册里各抄一遍
 * （抄 20 遍必然漂移：漏一个组件、写错一个 label、隐藏条件写成 !== true 还是 !== false…）。
 *
 * 与渲染端的对应关系：
 *   - 渐变 → `editor/data/decorationShape.ts` 的 `decorFillOf()`（编辑区与发布端共用）
 *   - 阴影 → 同文件的 `decorShadowFilter()` → `spec.boxCss.filter`
 * 面板出现这两个控件的前提是渲染端真的消费它们，否则就是"假能力"。
 */

import type { ConfigField } from "../../types/editor";
import {
  DECOR_GRADIENT_DIRECTIONS,
  DECOR_LINECAP_OPTIONS,
  DECOR_LINEJOIN_OPTIONS,
  DECOR_SHADOW_OPTIONS,
  decorSupportsLineCap,
  decorSupportsLineJoin,
} from "./decorationShape";

/** 渐变填充（仅对"默认就有可见填充"的形状追加，见 `decorSupportsGradient`） */
export const decorGradientFields: ConfigField[] = [
  {
    key: "gradientEnabled",
    label: "渐变填充",
    type: "toggle",
    group: "填充",
    help: "开：用渐变替代纯色填充（起始色→终止色）；关：使用「填充色」",
  },
  {
    key: "gradientFrom",
    label: "渐变起始色",
    type: "color",
    group: "填充",
    hidden: (c) => c.gradientEnabled !== true,
  },
  {
    key: "gradientTo",
    label: "渐变终止色",
    type: "color",
    group: "填充",
    hidden: (c) => c.gradientEnabled !== true,
  },
  {
    key: "gradientDirection",
    label: "渐变方向",
    type: "select",
    group: "填充",
    options: DECOR_GRADIENT_DIRECTIONS,
    hidden: (c) => c.gradientEnabled !== true,
  },
];

/** 渐变字段的默认值（`gradientEnabled=false` → 产物与历史逐字一致） */
export const decorGradientDefaults: Record<string, unknown> = {
  gradientEnabled: false,
  gradientFrom: "#2196F3",
  gradientTo: "#FF9800",
  gradientDirection: "to-right",
};

/** 轮廓阴影（所有原生装饰都适用：作用在最外层容器上的 drop-shadow） */
export const decorShadowField: ConfigField = {
  key: "shadow",
  label: "阴影",
  type: "select",
  group: "效果",
  options: DECOR_SHADOW_OPTIONS,
  help: "按形状轮廓投射（drop-shadow，镂空形状不会变成方块阴影）",
};

/** 阴影字段的默认值（none → 产物不变） */
export const decorShadowDefaults: Record<string, unknown> = { shadow: "none" };

/**
 * 描边细节（端点样式 / 转折样式）面板片段。
 *
 * 与形状能力绑定的前提是**渲染端真的消费它** —— `decorationShape.ts` 的
 * `decorLineCapOf` / `decorLineJoinOf` 会把这两个值写进 SVG 的
 * `stroke-linecap` / `stroke-linejoin`，且默认值就是改动前硬编码的那个值
 * （未配置时产物逐字不变）。能力判据同样在 `decorationShape.ts`，面板不自己判断，
 * 因此"给哪个形状显示"与"哪个形状真的消费"只有一个来源。
 *
 * 为什么必须按形状给：闭合且实线的矩形/圆/椭圆改 `linecap` 画面纹丝不动，
 * 线条/虚线框又没有拐角 —— 无条件显示就是造一批假控件（本仓库已有专门的契约锁抓这类问题）。
 */
export function decorStrokeDetailFields(kind: string): ConfigField[] {
  const out: ConfigField[] = [];
  if (decorSupportsLineCap(kind)) {
    out.push({
      key: "lineCap",
      label: "端点样式",
      type: "select",
      group: "描边",
      options: DECOR_LINECAP_OPTIONS,
      help: "线条两端的收口方式；虚线/点线下最明显（平头=短横、圆头=圆点）",
    });
  }
  if (decorSupportsLineJoin(kind)) {
    out.push({
      key: "lineJoin",
      label: "转折样式",
      type: "select",
      group: "描边",
      options: DECOR_LINEJOIN_OPTIONS,
      help: "多边形/星形等拐角处的连接方式",
    });
  }
  return out;
}
