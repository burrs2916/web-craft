import { componentRegistry, lazy } from "../registryCore";
import { DATAV_DECO_META, datavTypeOf, datavStrokeWidthSupported } from "../data/datavDecor";

/** 注册 datav 装饰组件（元数据唯一来源：editor/data/datavDecor.ts）。 */
export function registerDatavDecorations(): void {
  for (const meta of DATAV_DECO_META) {
      const colorSchema: any[] = [
        { key: "color1", label: "主色", type: "color", group: "样式" },
        /* 装饰 8（缠枝纹饰带 CurlingBranchBand）与 10（雕花边框 CarvedFrameDeco10）
           渲染端只消费 color1 —— 不再暴露改不动画面的「副色」假字段（诚实性扫描实证） */
        ...(meta.idx === 8 || meta.idx === 10
          ? []
          : [{ key: "color2", label: "副色", type: "color", group: "样式" }]),
      ];
    const schema: any[] = [
      ...colorSchema,
      { key: "opacity", label: "透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
    ];
    if (datavStrokeWidthSupported("decoration", meta.idx)) {
      schema.push({ key: "strokeWidth", label: "线条粗细", type: "slider", min: 0.5, max: 100, step: 2, group: "样式" });
    }
    if (meta.hasReverse) schema.push({ key: "reverse", label: "反转方向", type: "toggle", group: "布局" });
    if (meta.hasDur) schema.push({ key: "dur", label: "动画时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    if (meta.hasScanDur) {
      schema.push({ key: "scanDur", label: "扫描时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
      schema.push({ key: "haloDur", label: "光晕时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    }
    schema.push({ key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, step: 1, group: "布局" });

    const defaultConfig: Record<string, any> = {
      datavKind: "decoration",
      datavIndex: meta.idx,
      opacity: 1,
      strokeWidth: 1,
      borderRadius: 0,
      reverse: false,
      dur: meta.durDefault ?? 3,
    };
    /* 写入 color1/color2 */
    defaultConfig.color1 = meta.defaultColors[0];
    defaultConfig.color2 = meta.defaultColors[1];
    if (meta.hasScanDur) {
      defaultConfig.scanDur = 3;
      defaultConfig.haloDur = 2;
    }

    componentRegistry.register({
      type: datavTypeOf("decoration", meta.idx),
      name: meta.name,
      icon: meta.icon,
      description: meta.desc,
      category: "ccat_decoration",
      version: "1.0.0",
      builtIn: true,
      enabled: true,
      defaultSize: meta.defaultSize,
      minSize: meta.minSize,
      defaultConfig,
      capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
      renderer: lazy(() => import("../renderers/DataVRenderer").then(m => ({ default: m.DataVRenderer }))),
      configSchema: schema,
    });
  }
}