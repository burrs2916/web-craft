import React, { useEffect, useRef, useMemo, useCallback } from "react";
import type { ComponentRendererProps } from "../../../types/editor";
import {
  getSvgLineEffectProps,
  injectAnimationKeyframes,
  type AnimationConfig,
  type LineEffectType,
} from "../decorationAnimation";
import {
  OrnamentalFrame as ScalableBorderBox11,
} from "../ornamentalFrame";
import {
  DiamondScrollFrame as ScalableDeco11,
} from "../ornamentalDiamondFrame";
import {
  DATAV_WITH_REVERSE,
  DATAV_WITH_DUR,
  DATAV_WITH_CHILDREN,
  datavDefaultColors,
  datavDefaultDur,
  datavMountedCss,
} from "../../../editor/data/datavDecor";
import { DatavRenderSizeContext, type DatavRenderSize } from "../datavRenderSize";
import {
  ScanBorder12,
  PolylineBorder13,
  DotMatrixDeco1,
  ScanLineDeco2,
  FlickerDotsDeco3,
  GradientBorderDeco4,
  PolylineDeco5,
  BarJumpingDeco6,
  DecorationArrow7,
  CurlingBranchBand,
  FlowingLightBand,
  CarvedFrameDeco10,
  RadarDeco12,
} from "../datavScalable";

import {
  ScalableBorderBox1,
  ScalableBorderBox2,
  ScalableBorderBox3,
  ScalableBorderBox4,
  ScalableBorderBox5,
  ScalableBorderBox6,
  ScalableBorderBox7,
  ScalableBorderBox8,
  ScalableBorderBox9,
  ScalableBorderBox10,
} from "./borderBoxes";
import {
  DATAV_SVG_OVERLAY_EFFECTS,
  buildDataVAnimationStyle,
  applyDataVLineEffectOverlays,
  clearDataVLineEffectOverlays,
} from "./overlayEffects";

type DataVComp = React.ComponentType<any>;

const BORDER_MAP: Record<string, DataVComp> = {
  "1": (() => null) as DataVComp, "2": (() => null) as DataVComp,
  "3": (() => null) as DataVComp, "4": (() => null) as DataVComp,
  "5": (() => null) as DataVComp, "6": (() => null) as DataVComp,
  "7": (() => null) as DataVComp, "8": (() => null) as DataVComp,
  "9": (() => null) as DataVComp, "10": (() => null) as DataVComp,
  "12": (() => null) as DataVComp,
  "13": (() => null) as DataVComp,
  "11": (() => null) as DataVComp,
};

const DECO_MAP: Record<string, DataVComp> = {
  "1": (() => null) as DataVComp, "2": (() => null) as DataVComp,
  "3": (() => null) as DataVComp, "4": (() => null) as DataVComp,
  "5": (() => null) as DataVComp, "6": (() => null) as DataVComp,
  "7": (() => null) as DataVComp, "8": (() => null) as DataVComp,
  "9": (() => null) as DataVComp, "11": (() => null) as DataVComp, "12": (() => null) as DataVComp,
};

/**
 * datav 装饰族的元数据（默认配色 / 尺寸 / 开关集合 / 线条规则）**只有一份**，
 * 放在 `editor/data/datavDecor.ts`：面板注册、本渲染器、发布端 codegen 三方共用。
 * 此前这里另抄了一套 BORDER_DEFAULTS / DECO_DEFAULTS / *_WITH_REVERSE —— 已与面板漂移，现删除。
 */

let uidCounter = 0;

function DataVRendererInner({ config, sizeOverride, uidOverride }: ComponentRendererProps & {
  /** 发布端静态渲染：容器尺寸由组件 transform 给出，不再依赖 ResizeObserver */
  sizeOverride?: DatavRenderSize | null;
  /** 发布端静态渲染：容器 id 必须可确定（编辑区用自增计数器即可） */
  uidOverride?: string;
}) {
  const kind = (config.datavKind as string) || "border";
  const idx = String((config.datavIndex as number) ?? 1);

  const isBorder = kind === "border";
  const datavKind = isBorder ? "border" : "decoration";
  const typeKey = `datav-${datavKind}-${idx}`;
  const compMap = isBorder ? BORDER_MAP : DECO_MAP;
  const Component = compMap[idx];
  const uidRef = useRef(uidOverride || `datv-${++uidCounter}`);
  const uid = uidRef.current;
  const containerRef = useRef<HTMLDivElement>(null);
  const datavRef = useRef<any>(null);
  const overlayRafRef = useRef<number | null>(null);
  const overlayApplyingRef = useRef(false);

  useEffect(() => {
    injectAnimationKeyframes();
  }, []);

  const defaultColors = datavDefaultColors(datavKind, idx);
  const color1 = (config.color1 as string) || defaultColors[0];
  const color2 = (config.color2 as string) || defaultColors[1];
  const backgroundColor = (config.backgroundColor as string) || "transparent";
  const opacity = (config.opacity as number) ?? 1;
  const padding = (config.padding as number) ?? 0;
  const reverse = (config.reverse as boolean) ?? false;
  const dur = (config.dur as number) ?? datavDefaultDur(datavKind, idx);
  const scanDur = (config.scanDur as number) ?? 3;
  const haloDur = (config.haloDur as number) ?? 2;
  const borderRadius = (config.borderRadius as number) ?? 0;
  const strokeWidth = (config.strokeWidth as number) ?? 1;
  const multiplier = strokeWidth;
  const animConfig: Partial<AnimationConfig> = {
    animation: config.animation as any,
    animationDuration: config.animationDuration as number,
    lineEffect: config.lineEffect as any,
    lineEffectColor: config.lineEffectColor as string,
    lineEffectIntensity: config.lineEffectIntensity as number,
    lineEffectSpeed: config.lineEffectSpeed as number,
    lineEffectWidth: config.lineEffectWidth as number,
  };
  const lineEffect = (animConfig.lineEffect as LineEffectType) || "none";
  const containerEffectsStyle = useMemo(() => buildDataVAnimationStyle(animConfig), [
    animConfig.animation,
    animConfig.animationDuration,
    animConfig.lineEffect,
    animConfig.lineEffectColor,
    animConfig.lineEffectIntensity,
    animConfig.lineEffectSpeed,
    animConfig.lineEffectWidth,
  ]);
  const svgEffectProps = useMemo(() => getSvgLineEffectProps(animConfig), [
    animConfig.lineEffect,
    animConfig.lineEffectColor,
    animConfig.lineEffectIntensity,
    animConfig.lineEffectSpeed,
    animConfig.lineEffectWidth,
  ]);
  const isBorder1 = isBorder && idx === "1";
  const isBorder2 = isBorder && idx === "2";
  const isBorder3 = isBorder && idx === "3";
  const isBorder4 = isBorder && idx === "4";
  const isBorder5 = isBorder && idx === "5";
  const isBorder6 = isBorder && idx === "6";
  const isBorder7 = isBorder && idx === "7";
  const isBorder8 = isBorder && idx === "8";
  const isBorder9 = isBorder && idx === "9";
  const isBorder10 = isBorder && idx === "10";
  const isBorder11 = isBorder && idx === "11";
  const usesScalableBorder1 = isBorder1;
  const usesScalableBorder2 = isBorder2;
  const usesScalableBorder3 = isBorder3;
  const usesScalableBorder4 = isBorder4;
  const usesScalableBorder5 = isBorder5;
  const usesScalableBorder6 = isBorder6;
  const usesScalableBorder7 = isBorder7;
  const usesScalableBorder8 = isBorder8;
  const usesScalableBorder9 = isBorder9;
  const usesScalableBorder10 = isBorder10;
  const usesScalableBorder11 = isBorder11;
  const usesScalableBorder12 = isBorder && idx === "12";
  const usesScalableBorder13 = isBorder && idx === "13";
  const isDeco1 = !isBorder && idx === "1";
  const isDeco2 = !isBorder && idx === "2";
  const isDeco3 = !isBorder && idx === "3";
  const isDeco4 = !isBorder && idx === "4";
  const isDeco5 = !isBorder && idx === "5";
  const isDeco6 = !isBorder && idx === "6";
  const isDeco7 = !isBorder && idx === "7";
  const isBand8 = !isBorder && idx === "8";
  const isFlow9 = !isBorder && idx === "9";
  const isDeco10 = !isBorder && idx === "10";
  const isDeco11 = !isBorder && idx === "11";
  const isDeco12 = !isBorder && idx === "12";
  const usesScalableBand8 = isBand8;
  const usesScalableFlow9 = isFlow9;
  const usesScalableDeco1 = isDeco1;
  const usesScalableDeco2 = isDeco2;
  const usesScalableDeco3 = isDeco3;
  const usesScalableDeco4 = isDeco4;
  const usesScalableDeco5 = isDeco5;
  const usesScalableDeco6 = isDeco6;
  const usesScalableDeco7 = isDeco7;
  const usesScalableDeco10 = isDeco10;
  const usesScalableDeco11 = isDeco11;
  const usesScalableDeco12 = isDeco12;
  const shouldUseSvgLineEffect = !isBorder1 && !isBorder2 && !isBorder3 && !isBorder4 && !isBorder5 && !isBorder6 && !isBorder7 && !isBorder8 && !isBorder9 && !isBorder10 && !isBorder11 && !usesScalableBorder12 && !usesScalableBorder13 && !usesScalableDeco1 && !usesScalableDeco2 && !usesScalableDeco3 && !usesScalableDeco4 && !usesScalableDeco5 && !usesScalableDeco6 && !usesScalableDeco7 && !usesScalableBand8 && !usesScalableFlow9 && !usesScalableDeco10 && !usesScalableDeco11 && !usesScalableDeco12 && DATAV_SVG_OVERLAY_EFFECTS.has(lineEffect) && !!svgEffectProps;

  const props: Record<string, any> = {
    color: [color1, color2],
    backgroundColor,
    style: { width: "100%", height: "100%" },
  };

  /* 开关集合来自元数据（唯一一份）：面板显示什么，这里就传什么 */
  if (DATAV_WITH_REVERSE.has(typeKey)) props.reverse = reverse;
  if (DATAV_WITH_DUR.has(typeKey)) props.dur = dur;
  if (!isBorder && idx === "12") {
    props.scanDur = scanDur;
    props.haloDur = haloDur;
  }

  const needsChildren = isBorder || DATAV_WITH_CHILDREN.has(typeKey);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "visible",
    opacity,
    borderRadius: borderRadius > 0 ? borderRadius : undefined,
    pointerEvents: "none",
    ...containerEffectsStyle,
  };

  if (isBorder && padding > 0) {
    containerStyle.padding = padding;
    containerStyle.boxSizing = "border-box";
  }

  const injectCss = useMemo(
    () => datavMountedCss(uid, datavKind, idx, multiplier),
    [uid, datavKind, idx, multiplier],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let styleEl = el.querySelector(":scope > style[data-datav-inject]") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-datav-inject", "true");
      el.prepend(styleEl);
    }
    styleEl.textContent = injectCss;
  }, [injectCss]);

  const refreshDataVLineEffect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (overlayRafRef.current != null) {
      cancelAnimationFrame(overlayRafRef.current);
    }

    overlayRafRef.current = requestAnimationFrame(() => {
      overlayApplyingRef.current = true;
      applyDataVLineEffectOverlays(el, shouldUseSvgLineEffect ? svgEffectProps : null);
      requestAnimationFrame(() => {
        overlayApplyingRef.current = false;
      });
    });
  }, [shouldUseSvgLineEffect, svgEffectProps]);

  useEffect(() => {
    refreshDataVLineEffect();
    return () => {
      if (overlayRafRef.current != null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
      const el = containerRef.current;
      if (el) clearDataVLineEffectOverlays(el);
    };
  }, [refreshDataVLineEffect]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldUseSvgLineEffect) return;

    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (overlayApplyingRef.current) return;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        refreshDataVLineEffect();
      });
    });

    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [refreshDataVLineEffect, shouldUseSvgLineEffect]);

  return (
    <DatavRenderSizeContext.Provider value={sizeOverride ?? null}>
    <div id={uid} ref={containerRef} style={containerStyle}>
      {usesScalableBorder1 ? (
        <ScalableBorderBox1
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder2 ? (
        <ScalableBorderBox2
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder3 ? (
        <ScalableBorderBox3
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder4 ? (
        <ScalableBorderBox4
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder5 ? (
        <ScalableBorderBox5
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder6 ? (
        <ScalableBorderBox6
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder7 ? (
        <ScalableBorderBox7
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder8 ? (
        <ScalableBorderBox8
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          dur={dur}
          reverse={reverse}
        />
      ) : usesScalableBorder9 ? (
        <ScalableBorderBox9
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder10 ? (
        <ScalableBorderBox10
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder11 ? (
        <ScalableBorderBox11
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder12 ? (
        <ScanBorder12
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableBorder13 ? (
        <PolylineBorder13
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco1 ? (
        <DotMatrixDeco1
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco2 ? (
        <ScanLineDeco2
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          reverse={reverse}
          dur={dur}
        />
      ) : usesScalableDeco3 ? (
        <FlickerDotsDeco3
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco4 ? (
        <GradientBorderDeco4
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          reverse={reverse}
          dur={dur}
        />
      ) : usesScalableDeco5 ? (
        <PolylineDeco5
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          dur={dur}
        />
      ) : usesScalableDeco6 ? (
        <BarJumpingDeco6
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco7 ? (
        <DecorationArrow7
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableBand8 ? (
        <CurlingBranchBand
          color1={color1}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableFlow9 ? (
        <FlowingLightBand
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
          /* dur 从 config 读（面板「动画时长」），与 1261 行通用 props 路径同源；此前硬编码 3 → 面板假开关 */
          dur={dur}
        />
      ) : usesScalableDeco10 ? (
        <CarvedFrameDeco10
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableDeco11 ? (
        <ScalableDeco11
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableDeco12 ? (
        <RadarDeco12
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
          scanDur={scanDur}
          haloDur={haloDur}
        />
      ) : needsChildren ? (
        <Component {...props} ref={datavRef}>
          <div />
        </Component>
      ) : (
        <Component {...props} ref={datavRef} />
      )}
    </div>
    </DatavRenderSizeContext.Provider>
  );
}

export const DataVRenderer = React.memo(DataVRendererInner, (prevProps, nextProps) => {
  if (prevProps.mode !== nextProps.mode) return false;
  if (prevProps.editorSelected !== nextProps.editorSelected) return false;
  /* 发布端静态渲染会带 sizeOverride；尺寸变了必须重渲染 */
  const ps = prevProps.sizeOverride;
  const ns = nextProps.sizeOverride;
  if (((ps?.width ?? null) !== (ns?.width ?? null)) || ((ps?.height ?? null) !== (ns?.height ?? null))) return false;
  const prev = prevProps.config;
  const next = nextProps.config;
  return prev.datavKind === next.datavKind &&
    prev.datavIndex === next.datavIndex &&
    prev.color1 === next.color1 &&
    prev.color2 === next.color2 &&
    prev.backgroundColor === next.backgroundColor &&
    prev.opacity === next.opacity &&
    prev.padding === next.padding &&
    prev.reverse === next.reverse &&
    prev.dur === next.dur &&
    prev.titleWidth === next.titleWidth &&
    prev.titleOffsetX === next.titleOffsetX &&
    prev.titleAlign === next.titleAlign &&
    prev.title === next.title &&
    prev.titleColor === next.titleColor &&
    prev.titleFontSize === next.titleFontSize &&
    prev.scanDur === next.scanDur &&
    prev.haloDur === next.haloDur &&
    prev.borderRadius === next.borderRadius &&
    prev.strokeWidth === next.strokeWidth &&
    prev.animation === next.animation &&
    prev.animationDuration === next.animationDuration &&
    prev.lineEffect === next.lineEffect &&
    prev.lineEffectColor === next.lineEffectColor &&
    prev.lineEffectIntensity === next.lineEffectIntensity &&
    prev.lineEffectSpeed === next.lineEffectSpeed &&
    prev.lineEffectWidth === next.lineEffectWidth
});
