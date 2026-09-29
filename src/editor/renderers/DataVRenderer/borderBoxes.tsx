/**
 * datav 自实现的可缩放边框 1~10（纯 SVG + 容器尺寸监听，无外部依赖）。
 * 从 DataVRenderer.tsx 迁出，仅做代码搬迁。
 */
import React, { useEffect, useRef, useState, useId } from "react";

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
  const svgStyle: React.CSSProperties = {
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

// ── BorderBox 10 自实现：渐变边框 + 四角装饰 ──
interface ScalableBorderBox10Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox10({ color1, color2, backgroundColor }: ScalableBorderBox10Props) {
  const w = 400;
  const h = 300;
  const cornerSize = 18;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", boxSizing: "border-box" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <linearGradient id="dv-bb10-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="50%" stopColor={color2} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
          <linearGradient id="dv-bb10-grad-v" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="50%" stopColor={color2} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
        </defs>
        {/* 背景 */}
        <rect x="2" y="2" width={w - 4} height={h - 4} fill={backgroundColor} rx="4" />
        {/* 外边框 */}
        <rect x="2" y="2" width={w - 4} height={h - 4} fill="none" stroke="url(#dv-bb10-grad)" strokeWidth="2" rx="4" />
        {/* 内描边 */}
        <rect x="8" y="8" width={w - 16} height={h - 16} fill="none" stroke={color1} strokeWidth="1" opacity="0.5" rx="2" />
        {/* 四角装饰 */}
        <path d={`M 2 ${cornerSize} L 2 2 L ${cornerSize} 2`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w - cornerSize} 2 L ${w - 2} 2 L ${w - 2} ${cornerSize}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w - 2} ${h - cornerSize} L ${w - 2} ${h - 2} L ${w - cornerSize} ${h - 2}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${cornerSize} ${h - 2} L 2 ${h - 2} L 2 ${h - cornerSize}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox6Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox6({ color1, color2, backgroundColor }: ScalableBorderBox6Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-6" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`9, 7 ${w - 9}, 7 ${w - 9}, ${h - 7} 9, ${h - 7}`}
        />
        <circle fill={color2} cx="5" cy="5" r="2" />
        <circle fill={color2} cx={w - 5} cy="5" r="2" />
        <circle fill={color2} cx={w - 5} cy={h - 5} r="2" />
        <circle fill={color2} cx="5" cy={h - 5} r="2" />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, 4 ${w - 10}, 4`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, ${h - 4} ${w - 10}, ${h - 4}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`5, 70 5, ${h - 70}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 5}, 70 ${w - 5}, ${h - 70}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="3, 10 3, 50"
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="7, 30 7, 80"
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 3}, 10 ${w - 3}, 50`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 7}, 30 ${w - 7}, 80`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`3, ${h - 10} 3, ${h - 50}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`7, ${h - 30} 7, ${h - 80}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 3}, ${h - 10} ${w - 3}, ${h - 50}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 7}, ${h - 30} ${w - 7}, ${h - 80}`}
        />
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
  const svgStyle: React.CSSProperties = {
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

interface ScalableBorderBox3Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox3({ color1, color2, backgroundColor }: ScalableBorderBox3Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-3" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`23, 23 ${w - 24}, 23 ${w - 24}, ${h - 24} 23, ${h - 24}`}
        />
        <polyline
          className="dv-bb3-line1"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          points={`4, 4 ${w - 22}, 4 ${w - 22}, ${h - 22} 4, ${h - 22} 4, 4`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, 10 ${w - 16}, 10 ${w - 16}, ${h - 16} 10, ${h - 16} 10, 10`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`16, 16 ${w - 10}, 16 ${w - 10}, ${h - 10} 16, ${h - 10} 16, 16`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`22, 22 ${w - 4}, 22 ${w - 4}, ${h - 4} 22, ${h - 4} 22, 22`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox2Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

export function ScalableBorderBox2({ color1, color2, backgroundColor }: ScalableBorderBox2Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-2" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`7, 7 ${w - 7}, 7 ${w - 7}, ${h - 7} 7, ${h - 7}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`2, 2 ${w - 2}, 2 ${w - 2}, ${h - 2} 2, ${h - 2} 2, 2`}
        />
        <polyline
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`6, 6 ${w - 6}, 6 ${w - 6}, ${h - 6} 6, ${h - 6} 6, 6`}
        />
        <circle fill={color1} cx={11} cy={11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={w - 11} cy={11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={w - 11} cy={h - 11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={11} cy={h - 11} r={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

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

        <g style={{ "--dv1-c0": color1, "--dv1-c1": color2 } as React.CSSProperties}>
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
