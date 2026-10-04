import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../../types/editor";
import { LOOP_ANIM_KEYFRAMES, getGradientDirection } from "./keyframes";
import { useInstanceSuffix } from "./useInstanceSuffix";
import { useTypewriter } from "./useTypewriter";
import { useEnterAnimation } from "./useEnterAnimation";
import { useLoopAnimation } from "./useLoopAnimation";
import { useMarquee } from "./useMarquee";
import { useFadeCarousel } from "./useFadeCarousel";
import { useAutoFit } from "./useAutoFit";
import type { EnterAnimation, LoopAnimation, OverflowMode, HoverEffect } from "./types";

export function TextRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const instanceSuffix = useInstanceSuffix();
  const content = (config.content as string) || "文本内容";
  const autoFit = (config.autoFit as boolean) ?? true;

  const fontFamily = (config.fontFamily as string) || "inherit";
  const fontSize = (config.fontSize as number) || 16;
  const fontWeight = (config.fontWeight as string) || "normal";
  const fontStyle = (config.fontStyle as string) || "normal";
  const lineHeight = (config.lineHeight as number) || 1.5;
  const letterSpacing = (config.letterSpacing as number) || 0;
  const textAlign = (config.textAlign as string) || "center";
  const verticalAlign = (config.verticalAlign as string) || "middle";
  const color = (config.color as string) || "#ffffff";

  const gradientEnabled = (config.gradientEnabled as boolean) || false;
  const gradientFrom = (config.gradientFrom as string) || "#2196F3";
  const gradientTo = (config.gradientTo as string) || "#FF9800";
  const gradientDirection = getGradientDirection((config.gradientDirection as string) || "to-right");

  const textDecoration = (config.textDecoration as string) || "none";
  const textShadowEnabled = (config.textShadowEnabled as boolean) || false;
  const textShadowColor = (config.textShadowColor as string) || "rgba(0,0,0,0.5)";
  const textShadowBlur = (config.textShadowBlur as number) || 4;
  const textShadowOffsetX = (config.textShadowOffsetX as number) || 1;
  const textShadowOffsetY = (config.textShadowOffsetY as number) || 1;

  const backgroundEnabled = (config.backgroundEnabled as boolean) || false;
  const backgroundColor = (config.backgroundColor as string) || "#1a1a2e";
  const backgroundOpacity = (config.backgroundOpacity as number) ?? 80;
  const borderEnabled = (config.borderEnabled as boolean) || false;
  const borderColor = (config.borderColor as string) || "#ffffff";
  const borderWidth = (config.borderWidth as number) || 1;
  const borderRadius = (config.borderRadius as number) || 4;
  const padding = (config.padding as number) ?? 8;

  const cursor = (config.cursor as string) || "default";
  const hoverEffect = (config.hoverEffect as HoverEffect) || "none";

  const enterAnimation = (config.animation as EnterAnimation) || "none";
  const animationDuration = (config.animationDuration as number) || 500;
  const loopAnimation = (config.loopAnimation as LoopAnimation) || "none";
  const loopAnimationDuration = (config.loopAnimationDuration as number) || 2000;
  const overflow = (config.overflow as OverflowMode) || "hidden";
  const marqueeDirection = (config.marqueeDirection as "left" | "right" | "up" | "down") || "left";
  const marqueeSpeed = (config.marqueeSpeed as number) || 5000;

  const { displayed: typewriterText, complete: typewriterComplete } = useTypewriter(
    content,
    enterAnimation === "typewriter",
    animationDuration,
  );

  const [enterComplete, setEnterComplete] = useState(enterAnimation === "none");

  useEffect(() => {
    if (enterAnimation === "none") {
      setEnterComplete(true);
      return;
    }
    setEnterComplete(false);
    if (enterAnimation === "typewriter") return;
    const timer = setTimeout(() => setEnterComplete(true), animationDuration);
    return () => clearTimeout(timer);
  }, [enterAnimation, animationDuration]);

  useEffect(() => {
    if (enterAnimation === "typewriter" && typewriterComplete) {
      setEnterComplete(true);
    }
  }, [enterAnimation, typewriterComplete]);

  const { style: enterAnimStyle, keyframeStyle: enterKfStyle } = useEnterAnimation(
    enterAnimation === "typewriter" ? "none" : enterAnimation,
    animationDuration,
  );
  const { style: loopAnimStyle, keyframeStyle: loopKfStyle } = useLoopAnimation(
    loopAnimation,
    loopAnimationDuration,
    color,
    gradientFrom,
    gradientTo,
    gradientEnabled,
    gradientDirection,
    enterComplete,
  );
  const isMarquee = loopAnimation === "marquee";
  const isHorizontalMarquee = isMarquee && (marqueeDirection === "left" || marqueeDirection === "right");
  const { style: marqueeStyle, keyframeStyle: marqueeKfStyle, contentRef: marqueeContentRef, containerRef: marqueeContainerRef } = useMarquee(
    isMarquee && enterComplete,
    marqueeSpeed,
    marqueeDirection,
    instanceSuffix,
  );
  const carouselResult = useFadeCarousel(
    content,
    loopAnimation === "fadeCarousel" && enterComplete,
    loopAnimationDuration,
  );

  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const mergedContainerRef = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (marqueeContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, [marqueeContainerRef]);

  const mergedContentRef = useCallback((el: HTMLDivElement | null) => {
    (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (marqueeContentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, [marqueeContentRef]);

  useAutoFit(contentRef, containerRef, autoFit, onConfigChange, padding, borderEnabled ? borderWidth : 0, [content, fontSize, fontFamily, fontWeight, fontStyle, lineHeight, letterSpacing]);

  const handleMouseEnter = useCallback(() => setHovered(true), []);
  const handleMouseLeave = useCallback(() => setHovered(false), []);

  const handleClick = useCallback(() => {
    if (onConfigChange) onConfigChange("_lastClick", Date.now());
  }, [onConfigChange]);

  const handleDblClick = useCallback(() => {
    if (onConfigChange) onConfigChange("_lastDblClick", Date.now());
  }, [onConfigChange]);

  const alignMap: Record<string, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };
  const justifyMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end", justify: "flex-start" };

  const colorStyle = useMemo(() => {
    if (gradientEnabled) {
      return {
        background: `linear-gradient(${gradientDirection}, ${gradientFrom}, ${gradientTo})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        textDecorationColor: gradientFrom,
      };
    }
    return { color };
  }, [gradientEnabled, gradientFrom, gradientTo, gradientDirection, color]);

  const textShadowValue = useMemo(() => {
    if (!textShadowEnabled) return "none";
    return `${textShadowOffsetX}px ${textShadowOffsetY}px ${textShadowBlur}px ${textShadowColor}`;
  }, [textShadowEnabled, textShadowOffsetX, textShadowOffsetY, textShadowBlur, textShadowColor]);

  const bgColorResolved = useMemo(() => {
    if (!backgroundEnabled) return "transparent";
    if (backgroundColor === "transparent") return "transparent";
    if (backgroundOpacity <= 0) return "transparent";
    if (backgroundOpacity >= 100) return backgroundColor;
    const alpha = backgroundOpacity / 100;
    if (backgroundColor.startsWith("#")) {
      const hex = backgroundColor.slice(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    if (backgroundColor.startsWith("rgba")) {
      return backgroundColor.replace(/[\d.]+\)$/, `${alpha})`);
    }
    return backgroundColor;
  }, [backgroundEnabled, backgroundColor, backgroundOpacity]);

  const borderStyleValue = useMemo(() => {
    if (!borderEnabled || borderWidth <= 0) return "none";
    return `${borderWidth}px solid ${borderColor}`;
  }, [borderEnabled, borderWidth, borderColor]);

  const hoverTransform = useMemo(() => {
    if (!hovered || hoverEffect === "none") return undefined;
    if (hoverEffect === "scale") return "scale(1.05)";
    return undefined;
  }, [hovered, hoverEffect]);

  const hoverFilter = useMemo(() => {
    if (!hovered || hoverEffect === "none") return undefined;
    if (enterAnimation === "blurIn" && !enterComplete) return undefined;
    if (hoverEffect === "glow") {
      if (gradientEnabled) return undefined;
      return `drop-shadow(0 0 8px ${color})`;
    }
    if (hoverEffect === "highlight") return "brightness(1.3)";
    return undefined;
  }, [hovered, hoverEffect, color, enterAnimation, enterComplete, gradientEnabled]);

  const overflowStyle = useMemo((): React.CSSProperties => {
    if (!enterComplete) {
      return { overflow: "visible" };
    }
    if (isMarquee || loopAnimation === "fadeCarousel") {
      return { overflow: "hidden" };
    }
    if ((loopAnimation === "pulse" && enterComplete) || (hovered && hoverEffect === "scale")) {
      return { overflow: "visible" };
    }
    switch (overflow) {
      case "ellipsis": return { overflow: "hidden" };
      case "scroll": return { overflow: "auto" };
      case "auto": return { overflow: "auto" };
      case "hidden": return { overflow: "hidden" };
      default: return {};
    }
  }, [overflow, isMarquee, loopAnimation, enterComplete, hovered, hoverEffect]);

  const isCharAnim = enterAnimation === "charFadeIn";
  const isLineAnim = enterAnimation === "lineSlideUp";

  const renderedText = useMemo(() => {
    let text = enterAnimation === "typewriter" ? typewriterText : content;
    if (loopAnimation === "fadeCarousel") text = carouselResult.text;

    if (isCharAnim && text) {
      const totalChars = text.length;
      const maxStagger = Math.min(40, animationDuration / Math.max(totalChars, 1));
      return text.split("").map((char, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: 0,
            animation: `textCharFadeIn ${animationDuration}ms ease-out ${i * maxStagger}ms forwards`,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ));
    }

    if (isLineAnim && text) {
      const lines = text.split("\n");
      const maxStagger = Math.min(120, animationDuration / Math.max(lines.length, 1));
      return lines.map((line, i) => (
        <div
          key={i}
          style={{
            opacity: 0,
            animation: `textLineSlideUp ${animationDuration}ms ease-out ${i * maxStagger}ms forwards`,
          }}
        >
          {line || "\u00A0"}
        </div>
      ));
    }

    return text;
  }, [enterAnimation, typewriterText, content, carouselResult.text, loopAnimation, isCharAnim, isLineAnim, animationDuration]);

  const allKeyframes = useMemo(() => {
    const parts = [enterKfStyle, loopKfStyle, marqueeKfStyle];
    if (loopAnimation === "fadeCarousel") {
      parts.push(LOOP_ANIM_KEYFRAMES.textFadeCarouselIn);
      parts.push(LOOP_ANIM_KEYFRAMES.textFadeCarouselOut);
    }
    return parts.filter(Boolean).join("\n");
  }, [enterKfStyle, loopKfStyle, marqueeKfStyle, loopAnimation]);

  const contentSx = useMemo(() => {
    const sx: Record<string, unknown> = {
      width: isHorizontalMarquee ? undefined : "100%",
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      lineHeight,
      letterSpacing: `${letterSpacing}px`,
      textAlign: textAlign === "justify" ? "justify" : (textAlign as "left" | "center" | "right"),
      textDecoration,
    };

    if (overflow === "ellipsis" && !isHorizontalMarquee) {
      sx.whiteSpace = "nowrap";
      sx.overflow = "hidden";
      sx.textOverflow = "ellipsis";
    } else if (isHorizontalMarquee) {
      sx.wordBreak = undefined;
    } else {
      sx.wordBreak = "break-word";
    }

    const hasLoopGradient = enterComplete
      && (loopAnimation === "flowingGradient" || loopAnimation === "shineSweep")
      && (loopAnimStyle.background);

    const usesBackgroundClipText = hasLoopGradient
      || (gradientEnabled && !hasLoopGradient)
      || (enterComplete && (loopAnimation === "breathing" || loopAnimation === "blink" || loopAnimation === "pulse") && gradientEnabled);

    if (usesBackgroundClipText) {
      sx.textShadow = "none";
    } else {
      sx.textShadow = textShadowValue;
    }

    if (hasLoopGradient) {
      if (loopAnimStyle.background) sx.background = loopAnimStyle.background;
      if (loopAnimStyle.backgroundSize) sx.backgroundSize = loopAnimStyle.backgroundSize;
      if (loopAnimStyle.WebkitBackgroundClip) sx.WebkitBackgroundClip = loopAnimStyle.WebkitBackgroundClip;
      if (loopAnimStyle.WebkitTextFillColor) sx.WebkitTextFillColor = loopAnimStyle.WebkitTextFillColor;
      if (loopAnimStyle.backgroundClip) sx.backgroundClip = loopAnimStyle.backgroundClip;
      sx.textDecorationColor = gradientEnabled ? gradientFrom : color;
    } else {
      Object.assign(sx, colorStyle);
    }

    const animations: string[] = [];
    if (loopAnimStyle.animation) animations.push(loopAnimStyle.animation as string);
    if (marqueeStyle.animation) animations.push(marqueeStyle.animation as string);
    if (loopAnimation === "fadeCarousel" && carouselResult.animStyle.animation) {
      animations.push(carouselResult.animStyle.animation as string);
    }
    if (animations.length > 0) {
      sx.animation = animations.join(", ");
    }

    if (marqueeStyle.display) sx.display = marqueeStyle.display;

    if (isHorizontalMarquee) {
      sx.whiteSpace = "nowrap";
    }

    if (loopAnimation === "pulse" && enterComplete) {
      sx.transformOrigin = "center center";
    }

    if (hovered && hoverEffect === "glow" && gradientEnabled && enterComplete) {
      sx.filter = `drop-shadow(0 0 8px ${gradientFrom})`;
    }

    return sx;
  }, [isHorizontalMarquee, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, textDecoration, textShadowValue, colorStyle, loopAnimStyle, marqueeStyle, loopAnimation, carouselResult.animStyle, enterComplete, hovered, hoverEffect, gradientEnabled, gradientFrom, overflow]);

  const containerAnimStyle = useMemo(() => {
    if (!enterComplete) {
      return { ...enterAnimStyle };
    }
    return {};
  }, [enterComplete, enterAnimStyle]);

  return (
    <>
      {allKeyframes && <style>{allKeyframes}</style>}
      <Box
        ref={mergedContainerRef}
        onClick={handleClick}
        onDoubleClick={handleDblClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: alignMap[verticalAlign] || "flex-start",
          justifyContent: justifyMap[textAlign] || "flex-start",
          p: `${padding}px`,
          backgroundColor: bgColorResolved,
          border: borderStyleValue,
          borderRadius: `${borderRadius}px`,
          cursor,
          transition: enterComplete ? "transform 0.2s ease, filter 0.2s ease" : "none",
          transform: hoverTransform,
          filter: hoverFilter,
          boxSizing: "border-box",
          ...overflowStyle,
          ...containerAnimStyle,
          "&::-webkit-scrollbar": { width: 4, height: 4 },
          "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2 },
          "&::-webkit-scrollbar-track": { backgroundColor: "transparent" },
        }}
      >
        <Box ref={mergedContentRef} sx={contentSx}>
          {renderedText}
        </Box>
      </Box>
    </>
  );
}