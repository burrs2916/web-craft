import type { GradientDirection } from "./types";

export const ENTER_ANIM_KEYFRAMES: Record<string, string> = {
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

export const LOOP_ANIM_KEYFRAMES: Record<string, string> = {
  textBreathing: `@keyframes textBreathing { 0%,100% { opacity:1 } 50% { opacity:0.25 } }`,
  textBlink: `@keyframes textBlink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }`,
  textPulse: `@keyframes textPulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.15) } }`,
  textFlowingGradient: `@keyframes textFlowingGradient { 0% { background-position:0% 50% } 50% { background-position:100% 50% } 100% { background-position:0% 50% } }`,
  textShineSweep: `@keyframes textShineSweep { 0% { background-position:-200% center } 100% { background-position:200% center } }`,
  textFadeCarouselIn: `@keyframes textFadeCarouselIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`,
  textFadeCarouselOut: `@keyframes textFadeCarouselOut { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(-8px) } }`,
};

export function getGradientDirection(dir: string): GradientDirection {
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