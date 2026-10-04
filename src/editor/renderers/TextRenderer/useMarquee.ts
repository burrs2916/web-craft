import { useState, useEffect, useRef } from "react";

export function useMarquee(enabled: boolean, speed: number, direction: "left" | "right" | "up" | "down", suffix: string) {
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