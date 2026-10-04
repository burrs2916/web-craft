import { useEffect, useRef } from "react";

export function useAutoFit(
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