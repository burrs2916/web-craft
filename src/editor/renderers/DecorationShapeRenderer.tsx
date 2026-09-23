import { createElement, useEffect, useId, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { decorationShape, type DecorShapeSpec } from "../data/decorationShape";

/**
 * 「一份图元声明 → 一个 SVG」的编辑区渲染器（装饰组与形状组共用）。
 *
 * 几何/配色字面量的唯一来源是 `editor/data/decorationShape.ts`：
 *   - 本组件把图元映射为 React 元素（编辑区）；
 *   - `codegen/components/decoration.ts` 把同一批图元拼成字符串（发布端）。
 * 20 个 `*DecorationRenderer` 曾各自实现一遍几何 —— 那是"发布端补 codegen 必然漂移"的根因，
 * 现全部改为薄绑定（只保留「形状种类 → 渲染器」的绑定）。
 */
export function DecorationSvg({ spec, wrapperSx }: { spec: DecorShapeSpec; wrapperSx?: Record<string, unknown> }) {
  const svgStyle: Record<string, string> = {
    ...(spec.overflowVisible ? { overflow: "visible" } : {}),
    ...(spec.svgCss ?? {}),
  };

  return (
    <Box sx={{ width: "100%", height: "100%", ...(spec.boxCss ?? {}), ...(wrapperSx ?? {}) }}>
      <svg
        width="100%"
        height="100%"
        viewBox={spec.viewBox}
        preserveAspectRatio={spec.preserveAspectRatio}
        style={Object.keys(svgStyle).length > 0 ? svgStyle : undefined}
      >
        {spec.defs && spec.defs.length > 0 ? (
          <defs>
            {spec.defs.map((d, i) =>
              d.kind === "clip" ? (
                <clipPath key={`${d.id}-${i}`} id={d.id}>
                  <rect {...(d.rect ?? {})} />
                </clipPath>
              ) : createElement(
                d.kind === "radial" ? "radialGradient" : "linearGradient",
                { key: `${d.id}-${i}`, id: d.id, ...d.attrs },
                (d.stops ?? []).map((s, si) => (
                  <stop
                    key={si}
                    offset={s.offset}
                    stopColor={s.color}
                    stopOpacity={s.opacity === undefined ? undefined : s.opacity}
                  />
                )),
              ),
            )}
          </defs>
        ) : null}
        {spec.primitives.map((p, i) =>
          createElement(p.tag, {
            key: i,
            ...p.attrs,
            ...(p.css && Object.keys(p.css).length > 0 ? { style: p.css } : {}),
          }),
        )}
      </svg>
    </Box>
  );
}

/**
 * 装饰形状的编辑区渲染器工厂。
 *
 * 保留旧实现的全部行为：
 *   - 仍包在 `DecorationWrapper` 里（animation / lineEffect 仍生效）；
 *   - 仍按形状把「自动贴合尺寸」写回面板（`_autoFitSize`），线/箭头/分隔线/波浪依赖它。
 */
export function createDecorationShapeRenderer(kind: string) {
  return function DecorationShapeRenderer({ config, width, height, onConfigChange }: ComponentRendererProps) {
    const rawUid = useId();
    const uid = rawUid.replace(/:/g, "");
    const spec = decorationShape(kind, config, { width, height, uid });

    const fitH = spec.autoFit?.height;
    const fitW = spec.autoFit?.width;
    const lastReported = useRef({ w: 0, h: 0 });
    useEffect(() => {
      if (!onConfigChange) return;
      const size: { width?: number; height?: number } = {};
      if (fitH != null && fitH !== lastReported.current.h) {
        lastReported.current.h = fitH;
        size.height = fitH;
      }
      if (fitW != null && fitW !== lastReported.current.w) {
        lastReported.current.w = fitW;
        size.width = fitW;
      }
      if (size.width != null || size.height != null) onConfigChange("_autoFitSize", size);
    }, [fitH, fitW, onConfigChange]);

    return (
      <DecorationWrapper config={config}>
        <DecorationSvg spec={spec} />
      </DecorationWrapper>
    );
  };
}
