/**
 * datav 自实现的可缩放边框（支持 reverse 翻转）：4 / 5。
 * BorderBox4 依据容器宽度计算虚线间隔。
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

interface ScalableBorderBox4Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse: boolean;
}

export function ScalableBorderBox4({ color1, color2, backgroundColor, reverse }: ScalableBorderBox4Props) {
  const w = 400;
  const h = 300;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth || 400);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = containerW / w;
  const dash9 = `${100 * scale} ${250 * scale}`;
  const dash10 = `${80 * scale} ${270 * scale}`;

  const svgClassName = reverse ? "dv-border-svg-container dv-reverse" : "dv-border-svg-container";
  const svgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    ...(reverse ? { transform: "rotate(180deg)" } : {}),
  };

  return (
    <div ref={containerRef} className="dv-border-box-4" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className={svgClassName}
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <polygon
          fill={backgroundColor}
          points={`${w - 15}, 22 170, 22 150, 7 40, 7 28, 21 32, 24 16, 42 16, ${h - 32} 41, ${h - 7} ${w - 15}, ${h - 7}`}
        />
        <polyline
          className="dv-bb4-line-1"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`145, ${h - 5} 40, ${h - 5} 10, ${h - 35} 10, 40 40, 5 150, 5 170, 20 ${w - 15}, 20`}
        />
        <polyline
          className="dv-bb4-line-2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`245, ${h - 1} 36, ${h - 1} 14, ${h - 23} 14, ${h - 100}`}
        />
        <polyline
          className="dv-bb4-line-3"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`7, ${h - 40} 7, ${h - 75}`}
        />
        <polyline
          className="dv-bb4-line-4"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points="28, 24 13, 41 13, 64"
        />
        <polyline
          className="dv-bb4-line-5"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="5, 45 5, 140"
        />
        <polyline
          className="dv-bb4-line-6"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="14, 75 14, 180"
        />
        <polyline
          className="dv-bb4-line-7"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="55, 11 147, 11 167, 26 250, 26"
        />
        <polyline
          className="dv-bb4-line-8"
          stroke={color2}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points="158, 5 173, 16"
        />
        <polyline
          className="dv-bb4-line-9"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={dash9}
          vectorEffect="non-scaling-stroke"
          points={`200, 17 ${w - 10}, 17`}
        />
        <polyline
          className="dv-bb4-line-10"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          strokeDasharray={dash10}
          vectorEffect="non-scaling-stroke"
          points={`385, 17 ${w - 10}, 17`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox5Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse: boolean;
}

export function ScalableBorderBox5({ color1, color2, backgroundColor, reverse }: ScalableBorderBox5Props) {
  const w = 400;
  const h = 300;

  const svgClassName = reverse ? "dv-border-svg-container dv-reverse" : "dv-border-svg-container";
  const svgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    ...(reverse ? { transform: "rotate(180deg)" } : {}),
  };

  return (
    <div className="dv-border-box-5" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className={svgClassName}
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <polygon
          fill={backgroundColor}
          points={`10, 22 ${w - 22}, 22 ${w - 22}, ${h - 86} ${w - 84}, ${h - 24} 10, ${h - 24}`}
        />
        <polyline
          className="dv-bb5-line-1"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`8, 5 ${w - 5}, 5 ${w - 5}, ${h - 100} ${w - 100}, ${h - 5} 8, ${h - 5} 8, 5`}
        />
        <polyline
          className="dv-bb5-line-2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`3, 5 ${w - 20}, 5 ${w - 20}, ${h - 60} ${w - 74}, ${h - 5} 3, ${h - 5} 3, 5`}
        />
        <polyline
          className="dv-bb5-line-3"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          points={`50, 13 ${w - 35}, 13`}
        />
        <polyline
          className="dv-bb5-line-4"
          stroke={color2}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={`15, 20 ${w - 35}, 20`}
        />
        <polyline
          className="dv-bb5-line-5"
          stroke={color2}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={`15, ${h - 20} ${w - 110}, ${h - 20}`}
        />
        <polyline
          className="dv-bb5-line-6"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          points={`15, ${h - 13} ${w - 110}, ${h - 13}`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}