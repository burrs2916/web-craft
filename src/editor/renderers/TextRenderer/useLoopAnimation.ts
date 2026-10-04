import { useState, useEffect } from "react";
import { LOOP_ANIM_KEYFRAMES } from "./keyframes";
import { isLightColor, lightenColor } from "./colorUtils";
import type { LoopAnimation, GradientDirection } from "./types";

export function useLoopAnimation(
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