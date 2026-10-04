import { componentRegistry } from "../registryCore";
import type { ConfigField } from "../../types/editor";
import {
  decorSupportsGradient,
  decorStrokeDetailDefaults,
} from "../data/decorationShape";
import {
  decorGradientFields,
  decorGradientDefaults,
  decorShadowField,
  decorShadowDefaults,
  decorStrokeDetailFields,
} from "../data/decorFields";

/* ─── 原生装饰形状：按形状能力补「渐变填充 / 轮廓阴影 / 描边细节」面板片段 ───
 *
 * 20 个原生形状此前只有纯色填充 + 透明度，而形状组（`shape`）早就有渐变与阴影，
 * 同一族几何两套面板能力。这里按能力判据决定给不给某个开关
 * ——只给"真的会改变画面"的形状，避免出现"开关拨过去画面毫无变化"的假控件。
 * 字面量只此一份（`editor/data/decorFields.ts`），能力判据只此一份
 * （`editor/data/decorationShape.ts`），渲染端消费点也在同一文件。 */
export function augmentDecorationPanels(): void {
  for (const def of componentRegistry.getByCategory("ccat_decoration")) {
    // datav 族走自己的 color1/color2 配色模型，不参与本片段
    if (def.type.startsWith("datav-")) continue;
    const existing = new Set((def.configSchema ?? []).map((f) => f.key));
    const extra: ConfigField[] = [];
    if (decorSupportsGradient(def.type)) {
      extra.push(...decorGradientFields);
      def.defaultConfig = { ...decorGradientDefaults, ...def.defaultConfig };
      // 渐变开启后纯色填充不再被渲染端消费 → 隐藏它，避免属性栏出现"改了没反应"的控件
      for (const f of def.configSchema ?? []) {
        if (f.key !== "fill") continue;
        const prev = f.hidden;
        f.hidden = (c) => (c.gradientEnabled === true ? true : prev ? prev(c) : false);
      }
    }
    if (!existing.has("shadow")) {
      extra.push(decorShadowField);
      def.defaultConfig = { ...decorShadowDefaults, ...def.defaultConfig };
    }
    /* 描边细节（端点/转折）：能力判据在 decorationShape，默认值 = 该形状改动前的硬编码值
       → 未配置时产物逐字不变（零回归），面板显示的档位就是几何的历史值。 */
    for (const f of decorStrokeDetailFields(def.type)) {
      if (existing.has(f.key)) continue;
      extra.push(f);
      def.defaultConfig = { ...decorStrokeDetailDefaults(def.type), ...def.defaultConfig };
    }
    const fresh = extra.filter((f) => !existing.has(f.key));
    if (fresh.length > 0) def.configSchema = [...(def.configSchema ?? []), ...fresh];
  }
}