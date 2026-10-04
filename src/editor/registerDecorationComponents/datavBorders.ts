import { componentRegistry, lazy } from "../registryCore";
import { DATAV_BORDER_META, datavTypeOf, datavStrokeWidthSupported } from "../data/datavDecor";

/** 注册 datav 边框组件（元数据唯一来源：editor/data/datavDecor.ts）。 */
export function registerDatavBorders(): void {
  /* 元数据表的唯一来源：editor/data/datavDecor.ts
     （此前这里还有渲染器里的一份副本，两者已经漂移 → 现收口为一份） */
  const datavBorderMeta = DATAV_BORDER_META;

  for (const meta of datavBorderMeta) {
    const color1Label = meta.idx === 7 ? "主色(光晕+边框+外角)" : meta.idx === 8 ? "主色(静态底边)" : meta.idx === 9 ? "主色(渐变深底)" : "主色";
    const color2Label = meta.idx === 7 ? "副色(内角)" : meta.idx === 8 ? "副色(流光高亮)" : meta.idx === 9 ? "副色(渐变高光)" : "副色";
    const schema: any[] = [
      { key: "color1", label: color1Label, type: "color", group: "样式" },
      { key: "color2", label: color2Label, type: "color", group: "样式" },
      { key: "backgroundColor", label: "背景色", type: "color", group: "样式" },
      { key: "opacity", label: "透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      /* 「线条粗细」只在真的会改变画面的组件上出现 —— 边框 1 是纯填充多边形，
         一根描边都没有；其余边框靠静态线宽表，12/13 与装饰族则由几何直接驱动。
         判据集中在 datavStrokeWidthSupported()，并有契约测试锁死。 */
      ...(datavStrokeWidthSupported("border", meta.idx)
        ? [{ key: "strokeWidth", label: "线条粗细", type: "slider", min: 0.5, max: 100, step: 2, group: "样式" }]
        : []),
      { key: "padding", label: "内边距", type: "slider", min: 0, max: 60, step: 2, group: "布局" },
    ];
    if (meta.hasReverse) schema.push({ key: "reverse", label: meta.idx === 8 ? "反转追光方向" : "反转方向", type: "toggle", group: "布局" });
    if (meta.hasDur) schema.push({ key: "dur", label: meta.idx === 8 ? "流光周期(秒)" : "动画时长(秒)", type: "number", min: 0.5, step: 0.5, group: "动画" });
    schema.push({ key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, step: 1, group: "布局" });

    componentRegistry.register({
      type: datavTypeOf("border", meta.idx),
      name: meta.name,
      icon: meta.icon,
      description: meta.desc,
      category: "ccat_decoration",
      version: "1.0.0",
      builtIn: true,
      enabled: true,
      defaultSize: meta.defaultSize,
      minSize: meta.minSize,
      defaultConfig: {
        datavKind: "border",
        datavIndex: meta.idx,
        color1: meta.defaultColors[0],
        color2: meta.defaultColors[1],
        backgroundColor: "transparent",
        opacity: 1,
        strokeWidth: 1,
        padding: 0,
        borderRadius: 0,
        reverse: false,
        dur: meta.durDefault ?? 3,
      },
      capabilities: { resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false },
      renderer: lazy(() => import("../renderers/DataVRenderer").then(m => ({ default: m.DataVRenderer }))),
      configSchema: schema,
    });
  }
}