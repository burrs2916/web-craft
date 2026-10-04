import { useState, useEffect } from "react";
import { ENTER_ANIM_KEYFRAMES } from "./keyframes";
import type { EnterAnimation } from "./types";

export function useEnterAnimation(animation: EnterAnimation, duration: number) {
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