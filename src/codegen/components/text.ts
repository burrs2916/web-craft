import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";

/**
 * text 组件 → HTML
 *
 * 完整对齐 TextRenderer 的所有功能：
 * - 基础排版、颜色、渐变、阴影、背景、边框、内边距、溢出
 * - 入场动画（fadeIn/slideUp/slideDown/slideLeft/slideRight/bounceIn/zoomIn/blurIn/flipIn/charFadeIn/lineSlideUp/typewriter）
 * - 循环动画（breathing/blink/pulse/flowingGradient/shineSweep/marquee/fadeCarousel）
 * - hover 效果（scale/glow/highlight）
 * - marquee 跑马灯（left/right/up/down）
 * - fadeCarousel 淡入淡出轮播
 */
export const textCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const content = String(c.content ?? "文本内容");
  const escapedContent = escapeHTML(content);

  // ── 排版 ──
  const fontFamily = String(c.fontFamily ?? "inherit");
  const fontSize = Number(c.fontSize ?? 16);
  const fontWeight = String(c.fontWeight ?? "normal");
  const fontStyle = String(c.fontStyle ?? "normal");
  const lineHeight = Number(c.lineHeight ?? 1.5);
  const letterSpacing = Number(c.letterSpacing ?? 0);
  const textAlign = String(c.textAlign ?? "center");
  const verticalAlign = String(c.verticalAlign ?? "middle");
  const color = String(c.color ?? "#ffffff");
  const overflow = String(c.overflow ?? "hidden");
  const cursor = String(c.cursor ?? "default");
  const textDecoration = String(c.textDecoration ?? "none");

  // ── 渐变 ──
  const gradientEnabled = Boolean(c.gradientEnabled);
  const gradientFrom = String(c.gradientFrom ?? "#2196F3");
  const gradientTo = String(c.gradientTo ?? "#FF9800");
  const gradientDirection = gradientDirCSS(String(c.gradientDirection ?? "to-right"));

  // ── 阴影 ──
  const textShadowEnabled = Boolean(c.textShadowEnabled);
  const textShadowColor = String(c.textShadowColor ?? "rgba(0,0,0,0.5)");
  const textShadowBlur = Number(c.textShadowBlur ?? 4);
  const textShadowOffsetX = Number(c.textShadowOffsetX ?? 1);
  const textShadowOffsetY = Number(c.textShadowOffsetY ?? 1);

  // ── 背景 ──
  const backgroundEnabled = Boolean(c.backgroundEnabled);
  const backgroundColor = String(c.backgroundColor ?? "#1a1a2e");
  const backgroundOpacity = Number(c.backgroundOpacity ?? 80);

  // ── 边框 ──
  const borderEnabled = Boolean(c.borderEnabled);
  const borderColor = String(c.borderColor ?? "#ffffff");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderRadius = Number(c.borderRadius ?? 4);
  const padding = Number(c.padding ?? 8);

  // ── 动画 ──
  const enterAnimation = String(c.animation ?? "none");
  const animationDuration = Number(c.animationDuration ?? 500);
  const loopAnimation = String(c.loopAnimation ?? "none");
  const loopAnimationDuration = Number(c.loopAnimationDuration ?? 2000);
  const hoverEffect = String(c.hoverEffect ?? "none");
  const marqueeDirection = String(c.marqueeDirection ?? "left");
  const marqueeSpeed = Number(c.marqueeSpeed ?? 5000);

  // ── 唯一 ID ──
  const uid = `txt-${Math.random().toString(36).slice(2, 9)}`;

  // ── 容器样式 ──
  const containerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    "flex-direction: column",
    `font-family: ${fontFamily}`,
    `font-size: ${fontSize}px`,
    `font-weight: ${fontWeight}`,
    `font-style: ${fontStyle}`,
    `text-align: ${textAlign}`,
    `line-height: ${lineHeight}`,
    `letter-spacing: ${letterSpacing}px`,
    `text-decoration: ${textDecoration}`,
    `cursor: ${cursor}`,
    `padding: ${padding}px`,
    `border-radius: ${borderRadius}px`,
    "box-sizing: border-box",
    "transition: transform 0.2s ease, filter 0.2s ease",
  ];

  // vertical align
  const alignMap: Record<string, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };
  const justifyMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end", justify: "flex-start" };
  containerStyles.push(`align-items: ${alignMap[verticalAlign] ?? "center"}`);
  containerStyles.push(`justify-content: ${justifyMap[textAlign] ?? "center"}`);

  // background
  if (backgroundEnabled) {
    const opacity = backgroundOpacity / 100;
    containerStyles.push(`background-color: ${applyOpacity(backgroundColor, opacity)}`);
  }

  // border
  if (borderEnabled && borderWidth > 0) {
    containerStyles.push(`border: ${borderWidth}px solid ${borderColor}`);
  }

  // overflow
  const isMarquee = loopAnimation === "marquee";
  const isFadeCarousel = loopAnimation === "fadeCarousel";
  const isPulse = loopAnimation === "pulse";
  if (isMarquee || isFadeCarousel) {
    containerStyles.push("overflow: hidden");
  } else if (isPulse) {
    containerStyles.push("overflow: visible");
  } else {
    containerStyles.push(`overflow: ${overflow}`);
    if (overflow === "ellipsis") {
      containerStyles.push("white-space: nowrap", "text-overflow: ellipsis");
    }
  }

  // ── 内容样式 ──
  const contentStyles: string[] = [];
  const isHorizontalMarquee = isMarquee && (marqueeDirection === "left" || marqueeDirection === "right");

  // color / gradient
  const usesBackgroundClipText = gradientEnabled
    || (loopAnimation === "flowingGradient" && enterAnimation === "none")
    || (loopAnimation === "shineSweep" && enterAnimation === "none")
    || ((loopAnimation === "breathing" || loopAnimation === "blink" || loopAnimation === "pulse") && gradientEnabled);

  if (usesBackgroundClipText && !isMarquee && !isFadeCarousel) {
    contentStyles.push(`background: linear-gradient(${gradientDirection}, ${gradientFrom}, ${gradientTo})`);
    contentStyles.push("-webkit-background-clip: text");
    contentStyles.push("-webkit-text-fill-color: transparent");
    contentStyles.push("background-clip: text");
  } else {
    contentStyles.push(`color: ${color}`);
  }

  // text shadow (suppressed when using background-clip text)
  if (textShadowEnabled && !usesBackgroundClipText) {
    contentStyles.push(`text-shadow: ${textShadowOffsetX}px ${textShadowOffsetY}px ${textShadowBlur}px ${textShadowColor}`);
  }

  if (isHorizontalMarquee) {
    contentStyles.push("white-space: nowrap");
  } else if (overflow !== "ellipsis") {
    contentStyles.push("word-break: break-word");
  }

  // ── hover 效果 ──
  let hoverCss = "";
  if (hoverEffect === "scale") {
    hoverCss = `#${uid}:hover { transform: scale(1.05); }`;
  } else if (hoverEffect === "glow" && !gradientEnabled) {
    hoverCss = `#${uid}:hover { filter: drop-shadow(0 0 8px ${color}); }`;
  } else if (hoverEffect === "highlight") {
    hoverCss = `#${uid}:hover { filter: brightness(1.3); }`;
  }

  // ── 入场动画 keyframes ──
  const enterKeyframes = getEnterKeyframes(enterAnimation);
  const enterAnimStyle = getEnterAnimStyle(enterAnimation, animationDuration);

  // ── 循环动画 keyframes + style ──
  const loopResult = getLoopAnimStyle(loopAnimation, loopAnimationDuration);

  // ── 构建 keyframes <style> ──
  const allKeyframes: string[] = [];
  if (enterKeyframes) allKeyframes.push(enterKeyframes);
  if (loopResult.keyframes) allKeyframes.push(loopResult.keyframes);
  if (hoverCss) allKeyframes.push(hoverCss);

  // fadeCarousel keyframes
  if (isFadeCarousel) {
    allKeyframes.push(`@keyframes ${uid}-carouselIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`);
    allKeyframes.push(`@keyframes ${uid}-carouselOut { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(-8px) } }`);
  }

  const styleTag = allKeyframes.length > 0 ? `<style>${allKeyframes.join("\n")}</style>` : "";

  // ── 构建内容 HTML ──
  let contentHtml = "";
  let needsJs = false;

  if (enterAnimation === "typewriter") {
    contentHtml = `<span class="${uid}-typewriter">${escapeHTML("")}</span>`;
    needsJs = true;
  } else if (enterAnimation === "charFadeIn") {
    const chars = content.split("");
    const maxStagger = Math.min(40, animationDuration / Math.max(chars.length, 1));
    contentHtml = chars.map((char, i) =>
      `<span style="display:inline-block;opacity:0;animation:textCharFadeIn ${animationDuration}ms ease-out ${i * maxStagger}ms forwards;">${char === " " ? "&nbsp;" : escapeHTML(char)}</span>`
    ).join("");
  } else if (enterAnimation === "lineSlideUp") {
    const lines = content.split("\n");
    const maxStagger = Math.min(120, animationDuration / Math.max(lines.length, 1));
    contentHtml = lines.map((line, i) =>
      `<div style="opacity:0;animation:textLineSlideUp ${animationDuration}ms ease-out ${i * maxStagger}ms forwards;">${escapeHTML(line) || "&nbsp;"}</div>`
    ).join("");
  } else if (isFadeCarousel) {
    const lines = content.split("\n").filter((l) => l.length > 0);
    if (lines.length > 1) {
      contentHtml = `<span class="${uid}-carousel">${escapeHTML(lines[0])}</span>`;
      needsJs = true;
    } else {
      contentHtml = escapedContent;
    }
  } else if (isMarquee) {
    contentHtml = `<span class="${uid}-marquee-content" style="display:inline-block;">${escapedContent}</span>`;
    needsJs = true;
  } else {
    contentHtml = escapedContent;
  }

  // Apply loop animation to content if needed
  if (loopResult.animation && !isMarquee && !isFadeCarousel) {
    contentStyles.push(`animation: ${loopResult.animation}`);
  }

  // Apply enter animation to container
  if (enterAnimStyle) {
    containerStyles.push(enterAnimStyle);
  }

  // ── 构建 JS ──
  let jsCode = "";
  if (needsJs) {
    const scripts: string[] = [];

    // Typewriter
    if (enterAnimation === "typewriter") {
      scripts.push(`(function(){
        var el = document.querySelector(".${uid}-typewriter");
        if (!el) return;
        var text = ${JSON.stringify(content)};
        var dur = ${animationDuration};
        var i = 0;
        var interval = dur / Math.max(text.length, 1);
        var timer = setInterval(function() {
          if (i >= text.length) { clearInterval(timer); return; }
          i++;
          el.textContent = text.slice(0, i);
        }, interval);
      })();`);
    }

    // Marquee
    if (isMarquee) {
      const isHorizontal = marqueeDirection === "left" || marqueeDirection === "right";
      scripts.push(`(function(){
        var container = document.getElementById("${uid}");
        var content = container.querySelector(".${uid}-marquee-content");
        if (!container || !content) return;
        var isHorizontal = ${isHorizontal};
        var dir = ${JSON.stringify(marqueeDirection)};
        var speed = ${marqueeSpeed};
        var kfName = "${uid}-marquee";
        function update() {
          var existing = document.getElementById(kfName + "-style");
          if (existing) existing.remove();
          var style = document.createElement("style");
          style.id = kfName + "-style";
          var contentW = content.scrollWidth;
          var containerW = container.clientWidth;
          var contentH = content.scrollHeight;
          var containerH = container.clientHeight;
          if (isHorizontal) {
            if (dir === "left") {
              style.textContent = "@keyframes " + kfName + " { from { transform:translateX(" + containerW + "px) } to { transform:translateX(-" + contentW + "px) } }";
            } else {
              style.textContent = "@keyframes " + kfName + " { from { transform:translateX(-" + contentW + "px) } to { transform:translateX(" + containerW + "px) } }";
            }
          } else {
            if (dir === "up") {
              style.textContent = "@keyframes " + kfName + " { from { transform:translateY(" + containerH + "px) } to { transform:translateY(-" + contentH + "px) } }";
            } else {
              style.textContent = "@keyframes " + kfName + " { from { transform:translateY(-" + contentH + "px) } to { transform:translateY(" + containerH + "px) } }";
            }
          }
          document.head.appendChild(style);
          content.style.display = "inline-block";
          content.style.whiteSpace = isHorizontal ? "nowrap" : "normal";
          content.style.animation = kfName + " " + Math.max(2000, speed) + "ms linear infinite";
        }
        requestAnimationFrame(update);
        var ro;
        if (window.ResizeObserver) { ro = new ResizeObserver(update); ro.observe(container); }
      })();`);
    }

    // FadeCarousel
    if (isFadeCarousel) {
      scripts.push(`(function(){
        var container = document.getElementById("${uid}");
        if (!container) return;
        var el = container.querySelector(".${uid}-carousel");
        if (!el) return;
        var lines = ${JSON.stringify(content.split("\n").filter((l) => l.length > 0))};
        if (lines.length <= 1) return;
        var duration = ${loopAnimationDuration};
        var fadeMs = Math.max(150, duration * 0.3);
        var showDuration = Math.max(300, duration - fadeMs);
        var idx = 0;
        var phase = "in";
        function step() {
          if (phase === "in") {
            el.style.animation = "${uid}-carouselIn " + fadeMs + "ms ease-out forwards";
            setTimeout(function() {
              phase = "out";
              el.style.animation = "${uid}-carouselOut " + fadeMs + "ms ease-in forwards";
              setTimeout(function() {
                idx = (idx + 1) % lines.length;
                el.textContent = lines[idx];
                phase = "in";
                step();
              }, fadeMs);
            }, showDuration);
          }
        }
        el.textContent = lines[0];
        step();
      })();`);
    }

    jsCode = `<script>${scripts.join("\n")}</script>`;
  }

  // ── 组装 ──
  const containerStyleStr = containerStyles.join("; ");
  const contentStyleStr = contentStyles.length > 0 ? ` style="${contentStyles.join("; ")}"` : "";

  return `${styleTag}<div id="${uid}" style="${containerStyleStr}"><span class="${uid}-content"${contentStyleStr}>${contentHtml}</span></div>${jsCode}`;
};

// ── 辅助函数 ──

function gradientDirCSS(dir: string): string {
  const map: Record<string, string> = {
    "to-right": "to right",
    "to-left": "to left",
    "to-bottom": "to bottom",
    "to-top": "to top",
    "to-right-bottom": "to bottom right",
    "to-left-bottom": "to bottom left",
  };
  return map[dir] ?? "to right";
}

function applyOpacity(color: string, opacity: number): string {
  if (color.startsWith("rgba")) return color;
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

function getEnterKeyframes(anim: string): string {
  const keyframes: Record<string, string> = {
    fadeIn: "@keyframes textFadeIn { from { opacity:0 } to { opacity:1 } }",
    slideUp: "@keyframes textSlideUp { from { opacity:0; transform:translateY(30px) } to { opacity:1; transform:translateY(0) } }",
    slideDown: "@keyframes textSlideDown { from { opacity:0; transform:translateY(-30px) } to { opacity:1; transform:translateY(0) } }",
    slideLeft: "@keyframes textSlideLeft { from { opacity:0; transform:translateX(30px) } to { opacity:1; transform:translateX(0) } }",
    slideRight: "@keyframes textSlideRight { from { opacity:0; transform:translateX(-30px) } to { opacity:1; transform:translateX(0) } }",
    bounceIn: "@keyframes textBounceIn { 0% { opacity:0; transform:scale(0.3) } 50% { opacity:1; transform:scale(1.1) } 70% { transform:scale(0.92) } 100% { opacity:1; transform:scale(1) } }",
    zoomIn: "@keyframes textZoomIn { from { opacity:0; transform:scale(0.3) } to { opacity:1; transform:scale(1) } }",
    blurIn: "@keyframes textBlurIn { from { opacity:0; filter:blur(16px) } to { opacity:1; filter:blur(0) } }",
    flipIn: "@keyframes textFlipIn { from { opacity:0; transform:perspective(400px) rotateX(90deg) } to { opacity:1; transform:perspective(400px) rotateX(0) } }",
    charFadeIn: "@keyframes textCharFadeIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }",
    lineSlideUp: "@keyframes textLineSlideUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }",
  };
  return keyframes[anim] ?? "";
}

function getEnterAnimStyle(anim: string, duration: number): string {
  const mapping: Record<string, { initial: string; kf: string; easing: string }> = {
    fadeIn: { initial: "opacity:0", kf: "textFadeIn", easing: "ease-out" },
    slideUp: { initial: "opacity:0; transform:translateY(30px)", kf: "textSlideUp", easing: "ease-out" },
    slideDown: { initial: "opacity:0; transform:translateY(-30px)", kf: "textSlideDown", easing: "ease-out" },
    slideLeft: { initial: "opacity:0; transform:translateX(30px)", kf: "textSlideLeft", easing: "ease-out" },
    slideRight: { initial: "opacity:0; transform:translateX(-30px)", kf: "textSlideRight", easing: "ease-out" },
    bounceIn: { initial: "opacity:0; transform:scale(0.3)", kf: "textBounceIn", easing: "cubic-bezier(0.215,0.61,0.355,1)" },
    zoomIn: { initial: "opacity:0; transform:scale(0.3)", kf: "textZoomIn", easing: "ease-out" },
    blurIn: { initial: "opacity:0; filter:blur(16px)", kf: "textBlurIn", easing: "ease-out" },
    flipIn: { initial: "opacity:0; transform:perspective(400px) rotateX(90deg)", kf: "textFlipIn", easing: "ease-out" },
  };
  const cfg = mapping[anim];
  if (!cfg) return "";
  return `${cfg.initial}; animation: ${cfg.kf} ${duration}ms ${cfg.easing} forwards`;
}

function getLoopAnimStyle(
  anim: string,
  duration: number,
): { keyframes: string; animation: string } {
  const kfMap: Record<string, string> = {
    breathing: "@keyframes textBreathing { 0%,100% { opacity:1 } 50% { opacity:0.25 } }",
    blink: "@keyframes textBlink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }",
    pulse: "@keyframes textPulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.15) } }",
    flowingGradient: "@keyframes textFlowingGradient { 0% { background-position:0% 50% } 50% { background-position:100% 50% } 100% { background-position:0% 50% } }",
    shineSweep: "@keyframes textShineSweep { 0% { background-position:-200% center } 100% { background-position:200% center } }",
  };

  switch (anim) {
    case "breathing":
      return { keyframes: kfMap.breathing, animation: `textBreathing ${duration}ms ease-in-out infinite` };
    case "blink":
      return { keyframes: kfMap.blink, animation: `textBlink ${duration}ms step-end infinite` };
    case "pulse":
      return { keyframes: kfMap.pulse, animation: `textPulse ${duration}ms ease-in-out infinite` };
    case "flowingGradient": {
      return {
        keyframes: kfMap.flowingGradient,
        animation: `textFlowingGradient ${duration}ms linear infinite`,
      };
    }
    case "shineSweep": {
      return {
        keyframes: kfMap.shineSweep,
        animation: `textShineSweep ${duration}ms linear infinite`,
      };
    }
    default:
      return { keyframes: "", animation: "" };
  }
}
