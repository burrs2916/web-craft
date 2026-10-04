/**
 * datav 自实现的可缩放边框（静态 SVG 帧）：2 / 3 / 6 / 10。
 * 无 JS 驱动动画，仅依赖纯 SVG + 容器自适应。
 */

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