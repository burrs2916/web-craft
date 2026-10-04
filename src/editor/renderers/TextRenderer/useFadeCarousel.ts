import { useState, useEffect, useMemo } from "react";

export function useFadeCarousel(text: string, enabled: boolean, duration: number) {
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