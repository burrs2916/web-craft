import { useState, useEffect } from "react";

export function useTypewriter(text: string, enabled: boolean, duration: number): { displayed: string; complete: boolean } {
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