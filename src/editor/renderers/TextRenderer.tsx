import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";

let _instanceCounter = 0;
function useInstanceSuffix(): string {
  const idRef = useRef("");
  if (!idRef.current) {
    _instanceCounter++;
    idRef.current = String(_instanceCounter);
  }
  return idRef.current;
}

type EnterAnimation = "none" | "fadeIn" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "typewriter" | "charFadeIn" | "lineSlideUp" | "bounceIn" | "zoomIn" | "blurIn" | "flipIn";
type LoopAnimation = "none" | "breathing" | "blink" | "pulse" | "flowingGradient" | "shineSweep" | "marquee" | "fadeCarousel";
type OverflowMode = "hidden" | "ellipsis" | "scroll" | "auto";
type HoverEffect = "none" | "scale" | "glow" | "highlight";
type GradientDirection = "to right" | "to left" | "to bottom" | "to top" | "to bottom right" | "to bottom left";

const ENTER_ANIM_KEYFRAMES: Record<string, string> = {
  textFadeIn: `@keyframes textFadeIn { from { opacity:0 } to { opacity:1 } }`,
  textSlideUp: `@keyframes textSlideUp { from { opacity:0; transform:translateY(30px) } to { opacity:1; transform:translateY(0) } }`,
  textSlideDown: `@keyframes textSlideDown { from { opacity:0; transform:translateY(-30px) } to { opacity:1; transform:translateY(0) } }`,
  textSlideLeft: `@keyframes textSlideLeft { from { opacity:0; transform:translateX(30px) } to { opacity:1; transform:translateX(0) } }`,
  textSlideRight: `@keyframes textSlideRight { from { opacity:0; transform:translateX(-30px) } to { opacity:1; transform:translateX(0) } }`,
  textBounceIn: `@keyframes textBounceIn { 0% { opacity:0; transform:scale(0.3) } 50% { opacity:1; transform:scale(1.1) } 70% { transform:scale(0.92) } 100% { opacity:1; transform:scale(1) } }`,
  textZoomIn: `@keyframes textZoomIn { from { opacity:0; transform:scale(0.3) } to { opacity:1; transform:scale(1) } }`,
  textBlurIn: `@keyframes textBlurIn { from { opacity:0; filter:blur(16px) } to { opacity:1; filter:blur(0) } }`,
  textFlipIn: `@keyframes textFlipIn { from { opacity:0; transform:perspective(400px) rotateX(90deg) } to { opacity:1; transform:perspective(400px) rotateX(0) } }`,
  textCharFadeIn: `@keyframes textCharFadeIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }`,
  textLineSlideUp: `@keyframes textLineSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }`,
};

const LOOP_ANIM_KEYFRAMES: Record<string, string> = {
  textBreathing: `@keyframes textBreathing { 0%,100% { opacity:1 } 50% { opacity:0.25 } }`,
  textBlink: `@keyframes textBlink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }`,
  textPulse: `@keyframes textPulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.15) } }`,
  textFlowingGradient: `@keyframes textFlowingGradient { 0% { background-position:0% 50% } 50% { background-position:100% 50% } 100% { background-position:0% 50% } }`,
  textShineSweep: `@keyframes textShineSweep { 0% { background-position:-200% center } 100% { background-position:200% center } }`,
  textFadeCarouselIn: `@keyframes textFadeCarouselIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`,
  textFadeCarouselOut: `@keyframes textFadeCarouselOut { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(-8px) } }`,
};

function getGradientDirection(dir: string): GradientDirection {
  switch (dir) {
    case "to-right": return "to right";
    case "to-left": return "to left";
    case "to-bottom": return "to bottom";
    case "to-top": return "to top";
    case "to-right-bottom": return "to bottom right";
    case "to-left-bottom": return "to bottom left";
    default: return "to right";
  }
}

function useTypewriter(text: string, enabled: boolean, duration: number): { displayed: string; complete: boolean } {
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(!enabled);

  useEffect(() => {
    if (!enabled || !text) {
      setIndex(text.length);
      setComplete(true);
      return;
    }
    setIndex(0);
    setComplete(false);
    const charInterval = duration / text.length;
    const timer = setInterval(() => {
      setIndex((prev) => {
        if (prev >= text.length) {
          clearInterval(timer);
          setComplete(true);
          return text.length;
        }
        return prev + 1;
      });
    }, charInterval);
    return () => clearInterval(timer);
  }, [text, enabled, duration]);

  return { displayed: enabled ? text.slice(0, index) : text, complete };
}

function useEnterAnimation(animation: EnterAnimation, duration: number) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [keyframeStyle, setKeyframeStyle] = useState<string>("");

  useEffect(() => {
    if (animation === "none") {
      setStyle({});
      setKeyframeStyle("");
      return;
    }

    const isCharAnim = animation === "charFadeIn";
    const isLineAnim = animation === "lineSlideUp";
    if (isCharAnim || isLineAnim) {
      setStyle({ overflow: "hidden" });
      const kfName = isCharAnim ? "textCharFadeIn" : "textLineSlideUp";
      setKeyframeStyle(ENTER_ANIM_KEYFRAMES[kfName] || "");
      return;
    }

    const mapping: Record<string, { initial: React.CSSProperties; kf: string }> = {
      fadeIn: { initial: { opacity: 0 }, kf: "textFadeIn" },
      slideUp: { initial: { opacity: 0, transform: "translateY(30px)" }, kf: "textSlideUp" },
      slideDown: { initial: { opacity: 0, transform: "translateY(-30px)" }, kf: "textSlideDown" },
      slideLeft: { initial: { opacity: 0, transform: "translateX(30px)" }, kf: "textSlideLeft" },
      slideRight: { initial: { opacity: 0, transform: "translateX(-30px)" }, kf: "textSlideRight" },
      bounceIn: { initial: { opacity: 0, transform: "scale(0.3)" }, kf: "textBounceIn" },
      zoomIn: { initial: { opacity: 0, transform: "scale(0.3)" }, kf: "textZoomIn" },
      blurIn: { initial: { opacity: 0, filter: "blur(16px)" }, kf: "textBlurIn" },
      flipIn: { initial: { opacity: 0, transform: "perspective(400px) rotateX(90deg)" }, kf: "textFlipIn" },
    };

    const cfg = mapping[animation];
    if (!cfg) {
      setStyle({});
      setKeyframeStyle("");
      return;
    }

    const easing = animation === "bounceIn" ? "cubic-bezier(0.215,0.61,0.355,1)" : "ease-out";
    setStyle({
      ...cfg.initial,
      animation: `${cfg.kf} ${duration}ms ${easing} forwards`,
    });
    setKeyframeStyle(ENTER_ANIM_KEYFRAMES[cfg.kf] || "");
  }, [animation, duration]);

  return { style, keyframeStyle };
}

function useLoopAnimation(
  animation: LoopAnimation,
  duration: number,
  color: string,
  gradientFrom: string,
  gradientTo: string,
  gradientEnabled: boolean,
  gradientDirection: GradientDirection,
  active: boolean,
) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [keyframeStyle, setKeyframeStyle] = useState<string>("");

  useEffect(() => {
    if (animation === "none" || !active) {
      setStyle({});
      setKeyframeStyle("");
      return;
    }

    switch (animation) {
      case "breathing":
        if (gradientEnabled) {
          setStyle({
            background: `linear-gradient(${gradientDirection}, ${gradientFrom}, ${gradientTo})`,
            backgroundSize: "100% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: `textBreathing ${duration}ms ease-in-out infinite`,
          });
        } else {
          setStyle({ animation: `textBreathing ${duration}ms ease-in-out infinite` });
        }
        setKeyframeStyle(LOOP_ANIM_KEYFRAMES.textBreathing);
        break;
      case "blink":
        if (gradientEnabled) {
          setStyle({
            background: `linear-gradient(${gradientDirection}, ${gradientFrom}, ${gradientTo})`,
            backgroundSize: "100% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: `textBlink ${duration}ms step-end infinite`,
          });
        } else {
          setStyle({ animation: `textBlink ${duration}ms step-end infinite` });
        }
        setKeyframeStyle(LOOP_ANIM_KEYFRAMES.textBlink);
        break;
      case "pulse":
        if (gradientEnabled) {
          setStyle({
            background: `linear-gradient(${gradientDirection}, ${gradientFrom}, ${gradientTo})`,
            backgroundSize: "100% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            animation: `textPulse ${duration}ms ease-in-out infinite`,
          });
        } else {
          setStyle({ animation: `textPulse ${duration}ms ease-in-out infinite` });
        }
        setKeyframeStyle(LOOP_ANIM_KEYFRAMES.textPulse);
        break;
      case "flowingGradient": {
        const from = gradientEnabled ? gradientFrom : color;
        const mid = gradientEnabled ? gradientTo : lightenColor(color, 0.4);
        const to = gradientEnabled ? gradientFrom : color;
        setStyle({
          background: `linear-gradient(${gradientDirection}, ${from}, ${mid}, ${to})`,
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: `textFlowingGradient ${duration}ms linear infinite`,
        });
        setKeyframeStyle(LOOP_ANIM_KEYFRAMES.textFlowingGradient);
        break;
      }
      case "shineSweep": {
        const baseFrom = gradientEnabled ? gradientFrom : color;
        const baseTo = gradientEnabled ? gradientTo : color;
        const shineColor = isLightColor(baseFrom) ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.9)";
        setStyle({
          background: `linear-gradient(90deg, ${baseFrom} 20%, ${baseTo} 35%, ${shineColor} 50%, ${baseTo} 65%, ${baseFrom} 80%)`,
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          animation: `textShineSweep ${duration}ms linear infinite`,
        });
        setKeyframeStyle(LOOP_ANIM_KEYFRAMES.textShineSweep);
        break;
      }
      default:
        setStyle({});
        setKeyframeStyle("");
    }
  }, [animation, duration, color, gradientFrom, gradientTo, gradientEnabled, gradientDirection, active]);

  return { style, keyframeStyle };
}

function isLightColor(color: string): boolean {
  if (!color.startsWith("#")) return false;
  const hex = color.slice(1);
  if (hex.length < 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function lightenColor(color: string, amount: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  if (hex.length < 6) return color;
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function useMarquee(enabled: boolean, speed: number, direction: "left" | "right" | "up" | "down", suffix: string) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [keyframeStyle, setKeyframeStyle] = useState<string>("");
  const [ready, setReady] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStyle({});
      setKeyframeStyle("");
      setReady(false);
      return;
    }

    const isHorizontal = direction === "left" || direction === "right";
    const kfName = isHorizontal ? `textMarqueeH${suffix}` : `textMarqueeV${suffix}`;

    const updateKeyframes = () => {
      const contentEl = contentRef.current;
      const containerEl = containerRef.current;
      if (!contentEl || !containerEl) return false;

      if (isHorizontal) {
        const contentW = contentEl.scrollWidth;
        const containerW = containerEl.clientWidth;

        if (direction === "left") {
          setKeyframeStyle(`@keyframes ${kfName} { from { transform:translateX(${containerW}px) } to { transform:translateX(-${contentW}px) } }`);
        } else {
          setKeyframeStyle(`@keyframes ${kfName} { from { transform:translateX(-${contentW}px) } to { transform:translateX(${containerW}px) } }`);
        }
      } else {
        const contentH = contentEl.scrollHeight;
        const containerH = containerEl.clientHeight;

        if (direction === "up") {
          setKeyframeStyle(`@keyframes ${kfName} { from { transform:translateY(${containerH}px) } to { transform:translateY(-${contentH}px) } }`);
        } else {
          setKeyframeStyle(`@keyframes ${kfName} { from { transform:translateY(-${contentH}px) } to { transform:translateY(${containerH}px) } }`);
        }
      }
      return true;
    };

    const tryStart = () => {
      if (updateKeyframes()) {
        const duration = Math.max(2000, speed);
        setStyle({
          display: "inline-block",
          whiteSpace: isHorizontal ? "nowrap" : undefined,
          animation: `${kfName} ${duration}ms linear infinite`,
        });
        setReady(true);
      }
    };

    requestAnimationFrame(tryStart);

    const containerEl = containerRef.current;
    let ro: ResizeObserver | null = null;
    if (containerEl) {
      ro = new ResizeObserver(() => updateKeyframes());
      ro.observe(containerEl);
    }

    return () => { ro?.disconnect(); };
  }, [enabled, speed, direction, suffix]);

  if (enabled && !ready) {
    return {
      style: { display: "inline-block", whiteSpace: (direction === "left" || direction === "right") ? "nowrap" : undefined } as React.CSSProperties,
      keyframeStyle: "",
      contentRef,
      containerRef,
    };
  }

  return { style, keyframeStyle, contentRef, containerRef };
}

function useFadeCarousel(text: string, enabled: boolean, duration: number) {
  const lines = useMemo(() => text.split("\n").filter(l => l.length > 0), [text]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [displayText, setDisplayText] = useState(lines[0] || text);

  useEffect(() => {
    if (!enabled || lines.length <= 1) {
      setDisplayText(text);
      return;
    }
    setDisplayText(lines[0]);
    setCurrentIndex(0);
    setPhase("in");
  }, [enabled, lines, text]);

  useEffect(() => {
    if (!enabled || lines.length <= 1) return;

    const fadeMs = Math.max(150, duration * 0.3);
    const showDuration = Math.max(300, duration - fadeMs);

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;

      setTimeout(() => {
        if (cancelled) return;
        setPhase("out");

        setTimeout(() => {
          if (cancelled) return;
          setCurrentIndex(prev => (prev + 1) % lines.length);
          setPhase("in");
          scheduleNext();
        }, fadeMs);
      }, showDuration);
    };

    scheduleNext();

    return () => { cancelled = true; };
  }, [enabled, lines.length, duration]);

  useEffect(() => {
    if (enabled && lines[currentIndex] !== undefined) {
      setDisplayText(lines[currentIndex]);
    }
  }, [currentIndex, enabled, lines]);

  if (!enabled || lines.length === 0) return { text, animStyle: {} };

  const fadeMs = Math.max(150, duration * 0.3);
  const animStyle: React.CSSProperties = phase === "in"
    ? { animation: `textFadeCarouselIn ${fadeMs}ms ease-out forwards` }
    : { animation: `textFadeCarouselOut ${fadeMs}ms ease-in forwards` };

  return { text: displayText, animStyle };
}

function useAutoFit(
  contentRef: React.RefObject<HTMLDivElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  autoFit: boolean,
  onConfigChange: ((key: string, value: unknown) => void) | undefined,
  padding: number,
  borderWidth: number,
  deps: React.DependencyList,
) {
  const fittedRef = useRef(false);
  const prevAutoFitRef = useRef(autoFit);

  useEffect(() => {
    if (autoFit && !prevAutoFitRef.current) {
      fittedRef.current = false;
    }
    prevAutoFitRef.current = autoFit;
  }, [autoFit]);

  useEffect(() => {
    if (!autoFit) return;
    fittedRef.current = false;
  }, deps);

  useEffect(() => {
    if (!autoFit || fittedRef.current || !contentRef.current || !containerRef.current) return;

    const contentEl = contentRef.current;
    const savedWidth = contentEl.style.width;
    const savedWhiteSpace = contentEl.style.whiteSpace;
    const savedWordBreak = contentEl.style.wordBreak;
    contentEl.style.width = "max-content";
    contentEl.style.whiteSpace = "nowrap";
    contentEl.style.wordBreak = "normal";

    const contentW = contentEl.scrollWidth;
    const contentH = contentEl.scrollHeight;

    contentEl.style.width = savedWidth;
    contentEl.style.whiteSpace = savedWhiteSpace;
    contentEl.style.wordBreak = savedWordBreak;

    const fitW = Math.ceil(contentW + padding * 2 + borderWidth * 2);
    const fitH = Math.ceil(contentH + padding * 2 + borderWidth * 2);

    if (fitW > 0 && fitH > 0 && onConfigChange) {
      onConfigChange("_autoFitSize", { width: fitW, height: fitH });
      fittedRef.current = true;
    }
  }, [autoFit, onConfigChange, padding, borderWidth, contentRef, containerRef, ...deps]);
}

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
