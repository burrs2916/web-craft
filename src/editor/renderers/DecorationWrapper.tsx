import React, { useEffect, Children, cloneElement, isValidElement } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import {
  injectAnimationKeyframes,
  getAnimationSx,
  getLineEffectFilter,
  getLineEffectSx,
  getLineEffectAnimations,
  getSvgLineEffectProps,
  type AnimationConfig,
  type LineEffectType,
} from "./decorationAnimation";

interface DecorationWrapperProps {
  config: ComponentRendererProps["config"];
  children: React.ReactNode;
}

const SVG_OVERLAY_EFFECTS: Set<LineEffectType> = new Set([
  "flow", "dashFlow", "draw", "lightWave", "pulseWave", "sparkle", "gradientFlow",
]);

const STROKE_ELEMENTS = new Set(["line", "rect", "circle", "ellipse", "polygon", "polyline", "path"]);

function collectStrokeElements(children: React.ReactNode): { el: React.ReactElement<any>; idx: number }[] {
  const result: { el: React.ReactElement<any>; idx: number }[] = [];

  function walk(node: React.ReactNode, depth: number) {
    if (!isValidElement(node)) return;

    const elType = node.type;
    if (typeof elType === "string" && STROKE_ELEMENTS.has(elType)) {
      const p: Record<string, any> = node.props || {};
      if (p.stroke && p.stroke !== "none" && p.stroke !== "transparent") {
        result.push({ el: node, idx: result.length });
      }
    }

    const childProps = (node as React.ReactElement<any>).props;
    if (childProps && childProps.children) {
      const kids = Array.isArray(childProps.children) ? childProps.children : [childProps.children];
      for (const kid of kids) {
        walk(kid, depth + 1);
      }
    }
  }

  walk(children, 0);
  return result;
}

function buildOverlayElement(
  el: React.ReactElement<any>,
  idx: number,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>
): React.ReactElement<any> | null {
  const elType = el.type;
  if (typeof elType !== "string") return null;
  const p: Record<string, any> = el.props || {};

  const overlayStyle: Record<string, any> = {
    animationName: effectProps.animationName,
    animationDuration: effectProps.animationDuration,
    animationTimingFunction: effectProps.animationTimingFunction,
    animationIterationCount: effectProps.animationIterationCount,
    ...effectProps.style,
  };

  const baseOverlayProps = {
    stroke: effectProps.stroke,
    strokeWidth: effectProps.strokeWidth,
    strokeDasharray: effectProps.strokeDasharray,
    fill: effectProps.fill || "none",
    strokeLinecap: effectProps.strokeLinecap as any,
    strokeLinejoin: effectProps.strokeLinejoin as any,
    vectorEffect: effectProps.vectorEffect as any,
    style: overlayStyle,
  };

  if (elType === "line") {
    return <line key={`ov-${idx}`} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} {...baseOverlayProps} />;
  }
  if (elType === "rect") {
    return <rect key={`ov-${idx}`} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} ry={p.ry} {...baseOverlayProps} />;
  }
  if (elType === "circle") {
    return <circle key={`ov-${idx}`} cx={p.cx} cy={p.cy} r={p.r} {...baseOverlayProps} />;
  }
  if (elType === "ellipse") {
    return <ellipse key={`ov-${idx}`} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} {...baseOverlayProps} />;
  }
  if (elType === "polygon") {
    return <polygon key={`ov-${idx}`} points={p.points} {...baseOverlayProps} />;
  }
  if (elType === "polyline") {
    return <polyline key={`ov-${idx}`} points={p.points} {...baseOverlayProps} />;
  }
  if (elType === "path") {
    return <path key={`ov-${idx}`} d={p.d} {...baseOverlayProps} />;
  }
  return null;
}

export function DecorationWrapper({ config, children }: DecorationWrapperProps) {
  useEffect(() => {
    injectAnimationKeyframes();
  }, []);

  const animConfig: Partial<AnimationConfig> = {
    animation: config.animation as any,
    animationDuration: config.animationDuration as number,
    lineEffect: config.lineEffect as any,
    lineEffectColor: config.lineEffectColor as string,
    lineEffectIntensity: config.lineEffectIntensity as number,
    lineEffectSpeed: config.lineEffectSpeed as number,
    lineEffectWidth: config.lineEffectWidth as number,
  };

  const effect = (animConfig.lineEffect as LineEffectType) || "none";
  const animSx = getAnimationSx(animConfig);
  const filterStr = getLineEffectFilter(animConfig);
  const lineEffectSx = getLineEffectSx(animConfig);
  const lineEffectAnimations = getLineEffectAnimations(animConfig);
  const svgEffectProps = getSvgLineEffectProps(animConfig);

  const needsSvgOverlay = SVG_OVERLAY_EFFECTS.has(effect);

  const sxProps: Record<string, any> = {
    width: "100%",
    height: "100%",
    ...animSx,
  };

  if (filterStr) {
    sxProps.filter = filterStr;
  }

  Object.assign(sxProps, lineEffectSx);

  if (lineEffectAnimations.length > 0) {
    const baseAnim = sxProps.animation || "";
    const combined = [baseAnim, ...lineEffectAnimations].filter(Boolean).join(", ");
    sxProps.animation = combined;
  }

  const needsOverflowVisible = true;

  if (needsOverflowVisible) {
    sxProps.overflow = "visible";
  }

  const child = Children.only(children);
  if (!isValidElement(child)) {
    return <Box sx={sxProps}>{children}</Box>;
  }

  let finalChildren = child;
  if (needsOverflowVisible) {
    finalChildren = ensureOverflowVisible(child);
  }

  if (needsSvgOverlay && svgEffectProps) {
    const enhancedChildren = cloneElement(finalChildren as React.ReactElement<any>, {
      children: addSvgOverlay(finalChildren.props.children, svgEffectProps),
    });
    return <Box sx={sxProps}>{enhancedChildren}</Box>;
  }

  return <Box sx={sxProps}>{finalChildren}</Box>;
}

function ensureOverflowVisible(node: React.ReactElement<any>): React.ReactElement<any> {
  if (typeof node.type === "string" && node.type === "svg") {
    const existingStyle = node.props.style || {};
    return cloneElement(node, {
      style: { ...existingStyle, overflow: "visible" },
    });
  }
  const childProps = node.props;
  if (childProps && childProps.children && isValidElement(childProps.children)) {
    const updatedChild = ensureOverflowVisible(childProps.children as React.ReactElement<any>);
    if (updatedChild !== childProps.children) {
      return cloneElement(node, { children: updatedChild });
    }
  }
  return node;
}

function addSvgOverlay(
  children: React.ReactNode,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>
): React.ReactNode {
  if (!isValidElement(children)) return children;

  const strokeEls = collectStrokeElements(children);
  if (strokeEls.length === 0) return children;

  const overlays = strokeEls
    .map(({ el, idx }) => buildOverlayElement(el, idx, effectProps))
    .filter(Boolean);

  if (overlays.length === 0) return children;

  const svgChildren = (children as React.ReactElement<any>).props?.children;
  const existingElements = Array.isArray(svgChildren) ? svgChildren : svgChildren ? [svgChildren] : [];

  return cloneElement(children as React.ReactElement<any>, {
    children: [...existingElements, ...overlays],
  });
}
