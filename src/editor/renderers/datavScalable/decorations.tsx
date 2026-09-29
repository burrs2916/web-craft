import { useMemo } from "react";
import { BaseProps, useElementSize } from "./shared";

/* ===================== 点阵装饰 Decoration1 ===================== */

export function DotMatrixDeco1({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 200;
  const VBH = 50;
  const rowNum = 4;
  const rowPoints = 20;
  const pointSize = Math.max(0.5, 2.5 * strokeWidth);

  const points = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const result: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        result.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    return result;
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {points.map((p, i) => {
          const isAccent = i < rowPoints;
          const fill = isAccent ? color2 : color1;
          return (
            <rect
              key={i}
              fill={fill}
              x={p[0] - pointSize / 2}
              y={p[1] - pointSize / 2}
              width={pointSize}
              height={pointSize}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ===================== 扫描线装饰 Decoration2 ===================== */

export function ScanLineDeco2({
  color1,
  color2,
  strokeWidth = 1,
  reverse = false,
  dur = 6,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const lineWidth = Math.max(1, 1 * strokeWidth);
  const headSize = Math.max(1, 1 * strokeWidth);

  if (reverse) {
    return (
      <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <rect x={0} y={h / 2 - lineWidth / 2} width={w} height={lineWidth} fill={color1}>
            <animate
              attributeName="height"
              from={`0`}
              to={`${h}`}
              dur={`${dur}s`}
              calcMode="spline"
              keyTimes="0;1"
              keySplines=".42,0,.58,1"
              repeatCount="indefinite"
            />
          </rect>
          <rect x={0} y={0} width={headSize} height={headSize} fill={color2}>
            <animate
              attributeName="y"
              from="0"
              to={`${h - headSize}`}
              dur={`${dur}s`}
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.42,0,0.58,1"
              repeatCount="indefinite"
            />
          </rect>
        </svg>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <rect x={0} y={h / 2 - lineWidth / 2} width={w} height={lineWidth} fill={color1}>
          <animate
            attributeName="width"
            from="0"
            to={`${w}`}
            dur={`${dur}s`}
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".42,0,.58,1"
            repeatCount="indefinite"
          />
        </rect>
        <rect x={0} y={0} width={headSize} height={headSize} fill={color2}>
          <animate
            attributeName="x"
            from="0"
            to={`${w - headSize}`}
            dur={`${dur}s`}
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.42,0,0.58,1"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
    </div>
  );
}

/* ===================== 闪烁点阵装饰 Decoration3 ===================== */

export function FlickerDotsDeco3({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 300;
  const VBH = 35;
  const rowNum = 2;
  const rowPoints = 25;
  const pointSize = Math.max(1, 7 * strokeWidth);

  const points = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const result: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        result.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    return result;
  }, []);

  const flickerFlags = useMemo(() => points.map(() => Math.random() > 0.6), [points]);
  const durs = useMemo(() => points.map(() => Math.random() + 1), [points]);
  const begins = useMemo(() => points.map(() => Math.random() * 2), [points]);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {points.map((p, i) => (
          <rect
            key={i}
            fill={color1}
            x={p[0] - pointSize / 2}
            y={p[1] - pointSize / 2}
            width={pointSize}
            height={pointSize}
          >
            {flickerFlags[i] && (
              <animate
                attributeName="fill"
                values={`${color1};${color2};${color1}`}
                dur={`${durs[i]}s`}
                begin={`${begins[i]}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        ))}
      </svg>
    </div>
  );
}

/* ===================== 渐变边框装饰 Decoration4 ===================== */

export function GradientBorderDeco4({
  color1,
  color2,
  strokeWidth = 1,
  reverse = false,
  dur = 3,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const thickness = Math.max(1, 5 * strokeWidth);
  const dashSw = Math.max(0.5, 3 * strokeWidth);

  if (reverse) {
    return (
      <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={color1}
            strokeWidth={thickness}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={color2}
            strokeWidth={dashSw}
            strokeDasharray="20, 80"
            strokeDashoffset="-30"
            vectorEffect="non-scaling-stroke"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-100"
              dur={`${dur}s`}
              repeatCount="indefinite"
            />
          </line>
        </svg>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <line
          x1={w / 2}
          y1={0}
          x2={w / 2}
          y2={h}
          stroke={color1}
          strokeWidth={thickness}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={w / 2}
          y1={0}
          x2={w / 2}
          y2={h}
          stroke={color2}
          strokeWidth={dashSw}
          strokeDasharray="20, 80"
          strokeDashoffset="-30"
          vectorEffect="non-scaling-stroke"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-100"
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </line>
      </svg>
    </div>
  );
}

/* ===================== 折线装饰 Decoration5 ===================== */

export function PolylineDeco5({
  color1,
  color2,
  strokeWidth = 1,
  dur = 1.2,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const line1Sw = Math.max(0.5, 3 * strokeWidth);
  const line2Sw = Math.max(0.5, 2 * strokeWidth);

  const { line1Points, line2Points, line1Length, line2Length } = useMemo(() => {
    const l1: Array<[number, number]> = [
      [0, h * 0.2],
      [w * 0.18, h * 0.2],
      [w * 0.2, h * 0.4],
      [w * 0.25, h * 0.4],
      [w * 0.27, h * 0.6],
      [w * 0.72, h * 0.6],
      [w * 0.75, h * 0.4],
      [w * 0.8, h * 0.4],
      [w * 0.82, h * 0.2],
      [w, h * 0.2],
    ];
    const l2: Array<[number, number]> = [
      [w * 0.3, h * 0.8],
      [w * 0.7, h * 0.8],
    ];
    const len = (pts: Array<[number, number]>) => {
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        total += Math.hypot(dx, dy);
      }
      return total;
    };
    return {
      line1Points: l1.map((p) => p.join(",")).join(" "),
      line2Points: l2.map((p) => p.join(",")).join(" "),
      line1Length: len(l1),
      line2Length: len(l2),
    };
  }, [w, h]);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <polyline
          fill="transparent"
          stroke={color1}
          strokeWidth={line1Sw}
          vectorEffect="non-scaling-stroke"
          points={line1Points}
        >
          <animate
            attributeName="stroke-dasharray"
            from={`0, ${line1Length / 2}, 0, ${line1Length / 2}`}
            to={`0, 0, ${line1Length}, 0`}
            dur={`${dur}s`}
            begin="0s"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4,1,0.49,0.98"
            repeatCount="indefinite"
          />
        </polyline>
        <polyline
          fill="transparent"
          stroke={color2}
          strokeWidth={line2Sw}
          vectorEffect="non-scaling-stroke"
          points={line2Points}
        >
          <animate
            attributeName="stroke-dasharray"
            from={`0, ${line2Length / 2}, 0, ${line2Length / 2}`}
            to={`0, 0, ${line2Length}, 0`}
            dur={`${dur}s`}
            begin="0s"
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".4,1,.49,.98"
            repeatCount="indefinite"
          />
        </polyline>
      </svg>
    </div>
  );
}

/* ===================== 柱状跳动装饰 Decoration6 ===================== */

export function BarJumpingDeco6({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 300;
  const VBH = 35;
  const rowNum = 1;
  const rowPoints = 40;
  const rectWidth = Math.max(1, 7 * strokeWidth);

  const data = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const points: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        points.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const heights = new Array(rowNum * rowPoints).fill(0).map(() =>
      Math.random() > 0.8 ? rand(0.7 * VBH, VBH) : rand(0.2 * VBH, 0.5 * VBH)
    );
    const minHeights = heights.map((v) => v * Math.random());
    const randoms = new Array(rowNum * rowPoints).fill(0).map(() => Math.random() + 1.5);
    return { points, heights, minHeights, randoms };
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {data.points.map((p, i) => {
          const fill = Math.random() > 0.5 ? color1 : color2;
          const h1 = data.heights[i];
          const h2 = data.minHeights[i];
          return (
            <rect
              key={i}
              fill={fill}
              x={p[0] - rectWidth / 2}
              y={p[1] - h1 / 2}
              width={rectWidth}
              height={h1}
            >
              <animate
                attributeName="y"
                values={`${p[1] - h2 / 2};${p[1] - h1 / 2};${p[1] - h2 / 2}`}
                dur={`${data.randoms[i]}s`}
                keyTimes="0;0.5;1"
                calcMode="spline"
                keySplines="0.42,0,0.58,1;0.42,0,0.58,1"
                begin="0s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="height"
                values={`${h2};${h1};${h2}`}
                dur={`${data.randoms[i]}s`}
                keyTimes="0;0.5;1"
                calcMode="spline"
                keySplines="0.42,0,0.58,1;0.42,0,0.58,1"
                begin="0s"
                repeatCount="indefinite"
              />
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
