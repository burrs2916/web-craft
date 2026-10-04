/**
 * datav 自实现的可缩放边框（角饰 / 内发光）：1 / 7。
 * BorderBox1 使用 CSS keyframes 驱动四角填充动画。
 */
import type { CSSProperties } from "react";

interface ScalableBorderBox1Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox1({ color1, color2, backgroundColor }: ScalableBorderBox1Props) {
  const w = 400;
  const h = 300;
  const cw = 150;
  const ch = 150;
  const sx = cw / 150;
  const sy = ch / 150;

  const mainPoints = `
    10, 27 10, ${h - 27} 13, ${h - 24} 13, ${h - 21} 24, ${h - 11}
    38, ${h - 11} 41, ${h - 8} 73, ${h - 8} 75, ${h - 10} 81, ${h - 10}
    85, ${h - 6} ${w - 85}, ${h - 6} ${w - 81}, ${h - 10} ${w - 75}, ${h - 10}
    ${w - 73}, ${h - 8} ${w - 41}, ${h - 8} ${w - 38}, ${h - 11}
    ${w - 24}, ${h - 11} ${w - 13}, ${h - 21} ${w - 13}, ${h - 24}
    ${w - 10}, ${h - 27} ${w - 10}, 27 ${w - 13}, 25 ${w - 13}, 21
    ${w - 24}, 11 ${w - 38}, 11 ${w - 41}, 8 ${w - 73}, 8 ${w - 75}, 10
    ${w - 81}, 10 ${w - 85}, 6 85, 6 81, 10 75, 10 73, 8 41, 8 38, 11 24, 11 13, 21 13, 24
  `;

  const cornerPoly1 = "6,66 6,18 12,12 18,12 24,6 27,6 30,9 36,9 39,6 84,6 81,9 75,9 73.2,7 40.8,7 37.8,10.2 24,10.2 12,21 12,24 9,27 9,51 7.8,54 7.8,63";
  const cornerPoly2 = "27.599999999999998,4.8 38.4,4.8 35.4,7.8 30.599999999999998,7.8";
  const cornerPoly3 = "9,54 9,63 7.199999999999999,66 7.199999999999999,75 7.8,78 7.8,110 8.4,110 8.4,66 9.6,66 9.6,54";

  return (
    <div className="dv-border-box-1" style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>
        {`@keyframes dv1-fill-a{0%,100%{fill:var(--dv1-c0)}50%{fill:var(--dv1-c1)}}@keyframes dv1-fill-b{0%,100%{fill:var(--dv1-c1)}50%{fill:var(--dv1-c0)}}@keyframes dv1-fill-c{0%,100%{fill:var(--dv1-c0)}33%{fill:var(--dv1-c1)}66%{fill:transparent}}`}
      </style>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <polygon fill={backgroundColor} points={mainPoints} />

        <g style={{ "--dv1-c0": color1, "--dv1-c1": color2 } as CSSProperties}>
          <g transform={`translate(0,0) scale(${sx},${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(${w},0) scale(-${sx},${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(0,${h}) scale(${sx},-${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(${w},${h}) scale(-${sx},-${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>
        </g>
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox7Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox7({ color1, color2, backgroundColor }: ScalableBorderBox7Props) {
  const w = 400;
  const h = 300;

  return (
    <div
      className="dv-border-box-7"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        boxShadow: `inset 0 0 40px ${color1}`,
        border: `1px solid ${color1}`,
        backgroundColor,
      }}
    >
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, 25 0, 0 25, 0`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 25}, 0 ${w}, 0 ${w}, 25`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 25}, ${h} ${w}, ${h} ${w}, ${h - 25}`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, ${h - 25} 0, ${h} 25, ${h}`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, 10 0, 0 10, 0`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 10}, 0 ${w}, 0 ${w}, 10`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 10}, ${h} ${w}, ${h} ${w}, ${h - 10}`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, ${h - 10} 0, ${h} 10, ${h}`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}