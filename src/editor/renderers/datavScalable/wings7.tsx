import { useId } from "react";
import { BaseProps, useElementSize } from "./shared";
import { adjustLightness, blendHex } from "./colorUtils";

/* ===================== 箭头装饰 Decoration7 ===================== */

/**
 * 参考 vectorstock_45904626.svg
 *
 * 结构：每个"箭头对"由左右两个盾牌形多边形在中点 (1055.33, 879.68) 拼接，
 *       整对宽 2110.66，高 1759.36。
 *       参考图共 2 对，水平并排（左对偏移 527.67，右对偏移 0），间距 527.67。
 *
 *  - 左半（左指箭头）6 顶点：左平直 + 右双尖端 648.11（尾）/ 1055.33（头）
 *  - 右半（右指箭头）6 顶点：右平直 + 左双尖端 1462.55（尾）/ 2110.66（头）
 *  - 上下镜像对称，Y 中线 = 879.68
 */
/* ===================== 双翼装饰 DecorationArrow7 ===================== */
/* 参考 SVG: vectorstock_33677367.svg
   - viewBox: 0 0 4564 1506
   - 2 个主体翼（左右对角张开） + 2 个暗部小三角（翼根位置） + 1 个中间红色弧形带
   - 用户只配 2 个色：color1 = 最亮主色（高光），color2 = 最暗暗色（翼根/暗部三角）
   - 翼 9 色标、弧形带 5 色标、暗部三角 全部按 HSL 派生，保证色调整体协调 */

const VBW_WINGS = 4564;
const VBH_WINGS = 1506;

/* 翼 1（左）— 从画布底部向右上张开 */
const WING_LEFT_D =
  "M787.98,869.676 C775,874.186 761.94,878.776 749,883.456 L1176.42,1027.896 C1163.1,1031.226 1149.75,1034.676 1136.43,1038.136 C776.93,1131.766 426.53,1270.216 94.04,1453.506 C63.45,1470.356 33.11,1487.596 2.86,1505.166 C24.26,1469.986 45.67,1434.926 67.24,1400.126 C142.54,1278.316 218.76,1158.856 295.83,1041.676 C217.75,999.076 140.56,958.926 64.34,921.046 C42.81,910.386 21.36,899.856 0,889.566 C30.21,871.916 60.59,854.636 91.14,837.826 C303.46,720.566 523.11,621.586 747.78,540.976 C875.83,494.966 1005.52,454.936 1136.44,420.846 C1150.09,417.266 1163.83,413.806 1177.48,410.356 L1177.48,753.336 C1046.35,786.156 916.37,824.926 787.98,869.676 Z";

/* 翼 2（右）— 从画布底部向左上张开（翼 1 的镜像） */
const WING_RIGHT_D =
  "M4496.05,1400.116 C4517.62,1434.916 4539.03,1469.976 4560.43,1505.156 C4530.18,1487.586 4499.84,1470.356 4469.29,1453.496 C4140.38,1272.186 3793.98,1134.786 3438.61,1041.236 C3424.96,1037.616 3411.31,1034.076 3397.61,1030.616 L3826.3,887.736 C3813.2,883.016 3800.01,878.296 3786.82,873.666 C3658.52,828.576 3528.61,789.436 3397.53,756.276 L3397.53,413.296 C3411.27,416.796 3424.92,420.286 3438.61,423.916 C3569.44,458.336 3699.01,498.746 3826.97,545.096 C4047.63,624.946 4263.41,722.526 4472.15,837.816 C4502.7,854.626 4533.08,871.906 4563.29,889.556 C4541.93,899.836 4520.48,910.376 4498.95,921.036 C4422.73,958.916 4345.53,999.076 4267.5,1041.666 C4344.57,1158.846 4420.79,1278.296 4496.04,1400.116 Z";

/* 暗部小三角（翼根阴影，由 color2 HSL-35% 派生） */
const WING_SHADOW_LEFT_D =
  "M1177.49,753.336 L1177.49,1027.636 L749.02,883.446 C761.96,878.766 775.02,874.176 788,869.666 C916.39,824.916 1046.38,786.156 1177.5,753.326 Z";
const WING_SHADOW_RIGHT_D =
  "M3826.3,887.746 L3397.61,1030.626 L3397.53,756.276 C3528.61,789.436 3658.52,828.576 3786.82,873.666 C3800.01,878.296 3813.2,883.016 3826.3,887.736 Z";

/* 中间红色弧形带（横跨画布） */
const CENTER_BAND_D =
  "M3826.99,270.716 L3826.99,888.006 C3826.76,887.926 3826.51,887.836 3826.3,887.756 C3813.2,883.036 3800.01,878.316 3786.82,873.686 C3658.52,828.596 3528.61,789.456 3397.53,756.296 C2669.72,571.956 1905.63,570.986 1177.49,753.346 C1046.36,786.166 916.38,824.936 787.99,869.686 C775.01,874.196 761.95,878.786 749.01,883.466 C748.59,883.636 748.21,883.806 747.79,883.926 L747.79,266.596 C761.15,261.796 774.59,257.076 787.99,252.396 C1757.7,-85.443 2817.83,-84.143 3786.83,256.396 C3800.23,261.116 3813.67,265.876 3826.99,270.726 L3826.99,270.716 Z";

/* === 翼渐变色标（按 HSL 派生，offset 与参考 SVG 一致） ===
 *   索引  offset  角色                派生规则
 *   0     0%     起点（最深）         color2 HSL -25%
 *   1    15%     翼根深色             color2 HSL -12%
 *   2    30%     主体（中暗）         color1 HSL -18%
 *   3    42%     过渡到高光           color1 HSL -6%
 *   4    50%     最亮高光             color1
 *   5    54%     高光过渡             color1 HSL -6%
 *   6    72%     主体（次亮）         color1 HSL -16%
 *   7    87%     翼端暗色             color1 HSL -26%
 *   8   100%     末端                 color2
 */
const WING_OFFSETS = ["0%", "15%", "30%", "42%", "50%", "54%", "72%", "87%", "100%"];

/**
 * 翼 9 色标派生（对称、对角线、横向共用同一组派生规则）：
 *   - 0%/100%：color2 的 HSL 推暗版本（暗端）
 *   - 50%：color1（最亮）
 *   - 中间：color1 与 color2 之间按偏移插值
 */
function buildWingStops(c1: string, c2: string): string[] {
  // 参考 SVG 的 9 色标比例：0%, 15%, 30%, 42%, 50%, 54%, 72%, 87%, 100%
  // 派生规则：
  //   50% → c1
  //   0% / 100% → c2 HSL-25%（最深）
  //   30%/72% → c1/c2 中点（推暗 15%）
  //   42%/54% → 接近 c1，推暗 5%
  //   15%/87% → 接近 c2，推暗 10%
  return [
    adjustLightness(c2, -0.25), // 0%  起点最深
    adjustLightness(c2, -0.12), // 15% 深
    blendHex(c1, c2, 0.5) ? adjustLightness(blendHex(c1, c2, 0.5), -0.10) : c1, // 30% 中暗
    adjustLightness(c1, -0.05), // 42% 过渡
    c1,                         // 50% 最亮
    adjustLightness(c1, -0.05), // 54% 过渡
    adjustLightness(blendHex(c1, c2, 0.6), -0.10), // 72% 中暗
    adjustLightness(c2, -0.12), // 87% 深
    c2,                         // 100% 末端
  ];
}

/** 弧形带 5 色标派生：50%→100% 范围，从 c1 平滑到 c2 */
function buildBandStops(c1: string, c2: string): string[] {
  return [
    c1,                         // 50% 最亮
    adjustLightness(c1, -0.05), // 54%
    adjustLightness(blendHex(c1, c2, 0.5), -0.08), // 72%
    adjustLightness(c2, -0.12), // 87%
    c2,                         // 100%
  ];
}

export function DecorationArrow7({
  color1,
  color2,
  backgroundColor,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const uid = useId().replace(/:/g, "");
  const gradL = `dw7-gradL-${uid}`;
  const gradR = `dw7-gradR-${uid}`;
  const gradC = `dw7-gradC-${uid}`;

  // 用户只配 2 个色，默认与参考 SVG 保持一致
  const c1 = color1 || "#FF0000";
  const c2 = color2 || "#750000";
  // 暗部三角用 c2 HSL-30%（比 c2 更深，确保可见对比）
  const shadowColor = adjustLightness(c2, -0.30);
  // 描边用 c2（暗端）
  const strokeColor = c2;

  const wingStops = buildWingStops(c1, c2);
  const bandStops = buildBandStops(c1, c2);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW_WINGS} ${VBH_WINGS}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* 翼 1（左侧）— 对角渐变（左下→右上），9 色标由 color1/color2 派生 */}
          <linearGradient
            id={gradL}
            x1="5.64%"
            y1="69.53%"
            x2="78.81%"
            y2="36.47%"
          >
            {WING_OFFSETS.map((off, i) => (
              <stop
                key={`l-${i}`}
                offset={off}
                stopColor={wingStops[i]}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
          {/* 翼 2（右侧）— 横向渐变（左→右），9 色标由 color1/color2 派生 */}
          <linearGradient
            id={gradR}
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            {WING_OFFSETS.map((off, i) => (
              <stop
                key={`r-${i}`}
                offset={off}
                stopColor={wingStops[i]}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
          {/* 中间红色弧形带 — 半边渐变 50%→100% */}
          <linearGradient
            id={gradC}
            x1="2.36%"
            y1="50.26%"
            x2="98.72%"
            y2="49.91%"
          >
            {bandStops.map((color, i) => (
              <stop
                key={`c-${i}`}
                offset={["50%", "54%", "72%", "87%", "100%"][i]}
                stopColor={color}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
        </defs>

        {/* 阴影层（每翼黑色 20% 透明，偏移 (40, 40)） */}
        <g opacity="0.2" transform="translate(40, 40)">
          <path d={WING_LEFT_D} fill="#000000" />
          <path d={WING_RIGHT_D} fill="#000000" />
        </g>

        {/* 暗部小三角（翼根处，加深翼的根部，由 color2 派生） */}
        <path d={WING_SHADOW_LEFT_D} fill={shadowColor} opacity="0.55" />
        <path d={WING_SHADOW_RIGHT_D} fill={shadowColor} opacity="0.55" />

        {/* 主体 — 2 片翼 */}
        <path
          d={WING_LEFT_D}
          fill={`url(#${gradL})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={WING_RIGHT_D}
          fill={`url(#${gradR})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 中间红色弧形带（横跨画布） */}
        <path
          d={CENTER_BAND_D}
          fill={`url(#${gradC})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth * 0.5)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/* 别名（语义） */
export const DecorationDualWings7 = DecorationArrow7;
