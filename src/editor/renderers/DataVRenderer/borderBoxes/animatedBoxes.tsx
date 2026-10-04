/**
 * datav 自实现的可缩放边框（JS 驱动动画）：8 / 9。
 * 两者均通过 ResizeObserver 监听容器尺寸，并用 useId 生成唯一的 SVG defs id。
 */
import { useEffect, useId, useRef, useState } from "react";

interface ScalableBorderBox8Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  dur: number;
  reverse: boolean;
}

export function ScalableBorderBox8({ color1, color2, backgroundColor, dur, reverse }: ScalableBorderBox8Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const motionRefs = useRef<Element[]>([]);
  const dashAnimRefs = useRef<Element[]>([]);
  const sizeRef = useRef({ width: 400, height: 300 });
  const uid = useId().replace(/:/g, "");

  const getPathD = (w: number, h: number) => {
    if (reverse) return `M 2.5, 2.5 L 2.5, ${h - 2.5} L ${w - 2.5}, ${h - 2.5} L ${w - 2.5}, 2.5 L 2.5, 2.5`;
    return `M2.5, 2.5 L${w - 2.5}, 2.5 L${w - 2.5}, ${h - 2.5} L2.5, ${h - 2.5} L2.5, 2.5`;
  };

  useEffect(() => {
    const el = containerRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!el || !svg || !path) return;
    const update = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 300;
      if (sizeRef.current.width === w && sizeRef.current.height === h) return;
      sizeRef.current = { width: w, height: h };
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      const d = getPathD(w, h);
      path.setAttribute("d", d);
      motionRefs.current.forEach((am) => am.setAttribute("path", d));
      const newLen = (w + h - 5) * 2;
      if (dashAnimRefs.current[0]) {
        dashAnimRefs.current[0].setAttribute("from", `0, ${newLen}`);
        dashAnimRefs.current[0].setAttribute("to", `${newLen}, 0`);
      }
      if (dashAnimRefs.current[1]) {
        dashAnimRefs.current[1].setAttribute("from", `${newLen}, 0`);
        dashAnimRefs.current[1].setAttribute("to", `0, ${newLen}`);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reverse]);

  const { width, height } = sizeRef.current;
  const pathD = getPathD(width, height);
  const length = (width + height - 5) * 2;

  const glowRadius = 180;
  const trailRadius1 = 120;
  const trailRadius2 = 70;

  const pathId = `bb8-path-${uid}`;
  const gradientId = `bb8-grad-${uid}`;
  const maskId = `bb8-mask-${uid}`;

  const staggerOffset = dur / 3;

  return (
    <div
      className="dv-border-box-8"
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <svg
        ref={svgRef}
        className="dv-border-svg-container"
        width={width}
        height={height}
        style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none" }}
      >
        <defs>
          <path ref={pathRef} id={pathId} d={pathD} fill="transparent" />
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="30%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={maskId}>
            <circle cx="0" cy="0" r={glowRadius} fill={`url(#${gradientId})`}>
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[0] = el; }}
                dur={`${dur}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="0" cy="0" r={trailRadius1} fill={`url(#${gradientId})`} opacity="0.6">
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[1] = el; }}
                dur={`${dur}s`}
                begin={`${staggerOffset}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="0" cy="0" r={trailRadius2} fill={`url(#${gradientId})`} opacity="0.35">
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[2] = el; }}
                dur={`${dur}s`}
                begin={`${staggerOffset * 2}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
          </mask>
        </defs>

        <use
          stroke={color1}
          strokeWidth="1"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
        />

        <use
          stroke={color2}
          strokeWidth="3"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
          mask={`url(#${maskId})`}
        >
          <animate
            ref={(el) => { if (el) dashAnimRefs.current[0] = el; }}
            attributeName="stroke-dasharray"
            from={`0, ${length}`}
            to={`${length}, 0`}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </use>

        <use
          stroke={color2}
          strokeWidth="1.5"
          strokeOpacity="0.6"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
          mask={`url(#${maskId})`}
        >
          <animate
            ref={(el) => { if (el) dashAnimRefs.current[1] = el; }}
            attributeName="stroke-dasharray"
            from={`${length}, 0`}
            to={`0, ${length}`}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </use>
      </svg>
      <div
        className="border-box-content"
        style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}
      />
    </div>
  );
}

interface ScalableBorderBox9Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox9({ color1, color2, backgroundColor }: ScalableBorderBox9Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 300 });
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 300;
      setSize({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;

  const gradientId = `bb9-grad-${uid}`;
  const maskId = `bb9-mask-${uid}`;

  return (
    <div className="dv-border-box-9" ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg className="dv-border-svg-container" width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <animate attributeName="x1" values="0%;100%;0%" dur="10s" begin="0s" repeatCount="indefinite" />
            <animate attributeName="x2" values="100%;0%;100%" dur="10s" begin="0s" repeatCount="indefinite" />
            <stop offset="0%" stopColor={color1}>
              <animate attributeName="stop-color" values={`${color1};${color2};${color1}`} dur="10s" begin="0s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={color2}>
              <animate attributeName="stop-color" values={`${color2};${color1};${color2}`} dur="10s" begin="0s" repeatCount="indefinite" />
            </stop>
          </linearGradient>

          <mask id={maskId}>
            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`8, ${height * 0.4} 8, 3, ${width * 0.4 + 7}, 3`} />
            <polyline fill="#fff" points={`8, ${height * 0.15} 8, 3, ${width * 0.1 + 7}, 3 ${width * 0.1}, 8 14, 8 14, ${height * 0.15 - 7}`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`${width * 0.5}, 3 ${width - 3}, 3, ${width - 3}, ${height * 0.25}`} />
            <polyline fill="#fff" points={`${width * 0.52}, 3 ${width * 0.58}, 3 ${width * 0.58 - 7}, 9 ${width * 0.52 + 7}, 9`} />
            <polyline fill="#fff" points={`${width * 0.9}, 3 ${width - 3}, 3 ${width - 3}, ${height * 0.1} ${width - 9}, ${height * 0.1 - 7} ${width - 9}, 9 ${width * 0.9 + 7}, 9`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`8, ${height * 0.5} 8, ${height - 3} ${width * 0.3 + 7}, ${height - 3}`} />
            <polyline fill="#fff" points={`8, ${height * 0.55} 8, ${height * 0.7} 2, ${height * 0.7 - 7} 2, ${height * 0.55 + 7}`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`${width * 0.35}, ${height - 3} ${width - 3}, ${height - 3} ${width - 3}, ${height * 0.35}`} />
            <polyline fill="#fff" points={`${width * 0.92}, ${height - 3} ${width - 3}, ${height - 3} ${width - 3}, ${height * 0.8} ${width - 9}, ${height * 0.8 + 7} ${width - 9}, ${height - 9} ${width * 0.92 + 7}, ${height - 9}`} />
          </mask>
        </defs>

        <polygon
          fill={backgroundColor}
          points={`15, 9 ${width * 0.1 + 1}, 9 ${width * 0.1 + 4}, 6 ${width * 0.52 + 2}, 6 ${width * 0.52 + 6}, 10 ${width * 0.58 - 7}, 10 ${width * 0.58 - 2}, 6 ${width * 0.9 + 2}, 6 ${width * 0.9 + 6}, 10 ${width - 10}, 10 ${width - 10}, ${height * 0.1 - 6} ${width - 6}, ${height * 0.1 - 1} ${width - 6}, ${height * 0.8 + 1} ${width - 10}, ${height * 0.8 + 6} ${width - 10}, ${height - 10} ${width * 0.92 + 7}, ${height - 10} ${width * 0.92 + 2}, ${height - 6} 11, ${height - 6} 11, ${height * 0.15 - 2} 15, ${height * 0.15 - 7}`}
        />

        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={color1}
          opacity="0.25"
          mask={`url(#${maskId})`}
        />

        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={`url(#${gradientId})`}
          mask={`url(#${maskId})`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}