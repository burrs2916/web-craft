import { componentRegistry } from "../registry";
import { OrnamentalFrame } from "../renderers/ornamentalFrame";
import {
  ScanBorder12,
  PolylineBorder13,
  DotMatrixDeco1,
  ScanLineDeco2,
  FlickerDotsDeco3,
  GradientBorderDeco4,
  PolylineDeco5,
  BarJumpingDeco6,
} from "../renderers/datavScalable";
import { toPng } from "html-to-image";
import logger from "../../utils/logger";

const THUMB_W = 120;
const THUMB_H = 80;
const THUMB_DPR = 1;
const CONCURRENCY = 4;
const RENDER_WAIT_SVG = 200;
const RENDER_WAIT_CANVAS = 400;
const TIMEOUT = 8000;

const THUMB_BG = "linear-gradient(180deg, #07111f 0%, #0d1b2a 50%, #101827 100%)";
const THUMB_BG_COLOR = "#0d1b2a";

type DataVComp = React.ComponentType<any>;

const BORDER_MAP: Record<string, DataVComp> = {
  "12": ScanBorder12,
  "13": PolylineBorder13,
};

const DECO_MAP: Record<string, DataVComp> = {
  "1": DotMatrixDeco1, "2": ScanLineDeco2, "3": FlickerDotsDeco3,
  "4": GradientBorderDeco4, "5": PolylineDeco5, "6": BarJumpingDeco6,
};

const BORDER_DEFAULTS: Record<string, [string, string]> = {
  "1": ["#4fd2dd", "#235fa7"], "2": ["#fff", "rgba(255,255,255,0.6)"],
  "3": ["#2862b7", "#2862b7"], "4": ["red", "rgba(0,0,255,0.8)"],
  "5": ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.20)"],
  "6": ["rgba(255,255,255,0.35)", "gray"],
  "7": ["rgba(128,128,128,0.3)", "rgba(128,128,128,0.5)"],
  "8": ["#235fa7", "#4fd2dd"], "9": ["#11eefd", "#0078d2"],
  "10": ["#1d48c4", "#d3e1f8"], "11": ["#e1b86c", "#8c5c00"],
  "12": ["#2e6099", "#7ce7fd"], "13": ["#6586ec", "#2cf7fe"],
};

const DECO_DEFAULTS: Record<string, [string, string]> = {
  "1": ["#fff", "#0de7c2"], "2": ["#3faacb", "#fff"],
  "3": ["#7acaec", "transparent"], "4": ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.3)"],
  "5": ["#3f96a5", "#3f96a5"], "6": ["#7acaec", "#7acaec"],
  "7": ["#1dc1f5", "#1dc1f5"], "8": ["#3f96a5", "#3f96a5"],
  "9": ["rgba(3,166,224,0.8)", "rgba(3,166,224,0.5)"],
  "10": ["#00c2ff", "rgba(0,194,255,0.3)"], "11": ["#1a98fc", "#2cf7fe"],
  "12": ["#2783ce", "#2cf7fe"],
};

export const SKIP_THUMBNAIL_TYPES = new Set([
  "map-tile",
  "map-cad",
  "map-globe",
  "map-heatmap",
  "map-blue-print",
  "video",
]);

// 设备组件 SVG 缩略图生成函数
// 参考金箔雕花边框 (OrnamentalFrame) 的模式：纯 SVG 矢量绘制，不依赖设备数据
const DEVICE_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
  "device:FY002-MainController": (w, h) => {
    // 喷雾集控器 - 严格 1:1 复刻自 /references/SVG参考/设备/exported_image.svg
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 360 266" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(0, 3)">
        <!-- 1. 主体面板 -->
        <rect x="20" y="10" width="320" height="240" rx="8" fill="#D93A3A" />
        <!-- 2. 外框描边 -->
        <rect x="10" y="0" width="340" height="260" rx="10" fill="none" stroke="#B82F2F" stroke-width="6" />
        <!-- 3. 螺丝孔 - 上边 5 个 -->
        <circle cx="30" cy="20" r="4" fill="#222222" />
        <circle cx="110" cy="20" r="4" fill="#222222" />
        <circle cx="180" cy="20" r="4" fill="#222222" />
        <circle cx="250" cy="20" r="4" fill="#222222" />
        <circle cx="330" cy="20" r="4" fill="#222222" />
        <!-- 螺丝孔 - 下边 5 个 -->
        <circle cx="30" cy="240" r="4" fill="#222222" />
        <circle cx="110" cy="240" r="4" fill="#222222" />
        <circle cx="180" cy="240" r="4" fill="#222222" />
        <circle cx="250" cy="240" r="4" fill="#222222" />
        <circle cx="330" cy="240" r="4" fill="#222222" />
        <!-- 螺丝孔 - 左右中间各 1 个 -->
        <circle cx="30" cy="130" r="4" fill="#222222" />
        <circle cx="330" cy="130" r="4" fill="#222222" />
        <!-- 4. 屏幕区域 -->
        <rect x="110" y="80" width="140" height="80" rx="4" fill="#5A9ED6" stroke="#333333" stroke-width="2" />
        <!-- 5. 接线端子组 -->
        <g transform="translate(0, 70)" fill="#B82F2F">
          <rect x="0" y="0" width="10" height="20" rx="2" />
          <rect x="0" y="100" width="10" height="20" rx="2" />
          <rect x="350" y="0" width="10" height="20" rx="2" />
          <rect x="350" y="100" width="10" height="20" rx="2" />
        </g>
      </g>
    </svg>`;
  },
};

// Border 1,2,3,10 的 SVG 缩略图
const BORDER_SVG_THUMBS_EXTRA: Record<string, (w: number, h: number) => string> = {
  "1": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#4fd2dd", c2 = "#235fa7";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <rect x="3" y="3" width="${vw - 6}" height="${vh - 6}" fill="none" stroke="${c1}" stroke-width="2"/>
      <path d="M 0 20 L 0 0 L 20 0" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <path d="M ${vw - 20} 0 L ${vw} 0 L ${vw} 20" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <path d="M ${vw} ${vh - 20} L ${vw} ${vh} L ${vw - 20} ${vh}" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 20 ${vh} L 0 ${vh} L 0 ${vh - 20}" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="${vw/2}" cy="${vh/2}" r="20" fill="none" stroke="${c2}" stroke-width="2"/>
    </svg>`;
  },
  "2": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#fff", c2 = "rgba(255,255,255,0.6)";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <rect x="1" y="1" width="${vw - 2}" height="${vh - 2}" fill="none" stroke="${c1}" stroke-width="1" opacity="0.3"/>
      <rect x="5" y="5" width="${vw - 10}" height="${vh - 10}" fill="none" stroke="${c2}" stroke-width="2" rx="4"/>
      <line x1="0" y1="${vh/2}" x2="${vw}" y2="${vh/2}" stroke="${c2}" stroke-width="1" stroke-dasharray="8 4" opacity="0.5"/>
    </svg>`;
  },
  "3": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#2862b7";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <rect x="5" y="5" width="${vw - 10}" height="${vh - 10}" fill="none" stroke="${c1}" stroke-width="1" stroke-dasharray="12 6"/>
      <circle cx="10" cy="10" r="3" fill="${c1}"/>
      <circle cx="${vw - 10}" cy="10" r="3" fill="${c1}"/>
      <circle cx="${vw - 10}" cy="${vh - 10}" r="3" fill="${c1}"/>
      <circle cx="10" cy="${vh - 10}" r="3" fill="${c1}"/>
    </svg>`;
  },
  "10": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#1d48c4", c2 = "#d3e1f8";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bb10-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="50%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c1}"/>
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="${vw - 6}" height="${vh - 6}" fill="none" stroke="url(#bb10-grad)" stroke-width="2" rx="4"/>
      <rect x="8" y="8" width="${vw - 16}" height="${vh - 16}" fill="none" stroke="${c1}" stroke-width="1" opacity="0.5" rx="2"/>
      <polygon points="${vw/2 - 8},${vh/2 - 10} ${vw/2 + 8},${vh/2 - 10} ${vw/2 + 12},${vh/2} ${vw/2 + 8},${vh/2 + 10} ${vw/2 - 8},${vh/2 + 10} ${vw/2 - 12},${vh/2}" fill="${c2}" opacity="0.7"/>
    </svg>`;
  },
};

// Decoration 7-12 的 SVG 缩略图
const DECO_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
  "7": (w, h) => {
    const vw = 400, vh = 300;
    const c = "#1dc1f5";
    const cx = vw / 2, cy = vh / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(${cx}, ${cy})">
        <path d="M -30 -40 L 0 -60 L 30 -40 L 20 -20 L -20 -20 Z" fill="none" stroke="${c}" stroke-width="2"/>
        <path d="M -30 40 L 0 60 L 30 40 L 20 20 L -20 20 Z" fill="none" stroke="${c}" stroke-width="2"/>
        <circle r="15" fill="none" stroke="${c}" stroke-width="2"/>
        <line x1="-50" y1="0" x2="-20" y2="0" stroke="${c}" stroke-width="2"/>
        <line x1="20" y1="0" x2="50" y2="0" stroke="${c}" stroke-width="2"/>
      </g>
    </svg>`;
  },
  "8": (w, h) => {
    const vw = 400, vh = 300;
    const c = "#3f96a5";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <g fill="${c}" opacity="0.7">
        <path d="M 0 ${vh*0.3} Q ${vw*0.15} ${vh*0.1} ${vw*0.3} ${vh*0.3} T ${vw*0.6} ${vh*0.3} T ${vw} ${vh*0.3} L ${vw} ${vh*0.5} Q ${vw*0.85} ${vh*0.3} ${vw*0.7} ${vh*0.5} T ${vw*0.4} ${vh*0.5} T 0 ${vh*0.5} Z"/>
        <path d="M 0 ${vh*0.6} Q ${vw*0.2} ${vh*0.4} ${vw*0.4} ${vh*0.6} T ${vw*0.8} ${vh*0.6} T ${vw} ${vh*0.6} L ${vw} ${vh*0.8} Q ${vw*0.8} ${vh*0.6} ${vw*0.6} ${vh*0.8} T ${vw*0.2} ${vh*0.8} T 0 ${vh*0.8} Z" opacity="0.5"/>
      </g>
    </svg>`;
  },
  "9": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "rgba(3,166,224,0.8)", c2 = "rgba(3,166,224,0.3)";
    const cx = vw / 2, cy = vh / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">
      <circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="${c2}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${c2}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="20" fill="${c1}"/>
      <line x1="${cx}" y1="${cy - 70}" x2="${cx}" y2="${cy + 70}" stroke="${c1}" stroke-width="1" opacity="0.5"/>
      <line x1="${cx - 70}" y1="${cy}" x2="${cx + 70}" y2="${cy}" stroke="${c1}" stroke-width="1" opacity="0.5"/>
    </svg>`;
  },
  "10": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#00c2ff", c2 = "rgba(0,194,255,0.3)";
    const cx = vw / 2, cy = vh / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="deco10-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${c1}" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="${c2}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="80" fill="url(#deco10-glow)"/>
      <circle cx="${cx}" cy="${cy}" r="50" fill="none" stroke="${c1}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="${c1}" stroke-width="1" opacity="0.6"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="${c1}"/>
    </svg>`;
  },
  "11": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#1a98fc", c2 = "#2cf7fe";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="deco11-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
      </defs>
      <g transform="translate(${vw/2}, ${vh/2})">
        <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill="none" stroke="url(#deco11-grad)" stroke-width="2"/>
        <polygon points="0,-35 30,-17 30,17 0,35 -30,17 -30,-17" fill="none" stroke="${c2}" stroke-width="1.5" opacity="0.7"/>
        <circle r="10" fill="${c2}" opacity="0.8"/>
      </g>
    </svg>`;
  },
  "12": (w, h) => {
    const vw = 400, vh = 300;
    const c1 = "#2783ce", c2 = "#2cf7fe";
    const cx = vw / 2, cy = vh / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">
      <circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${c1}" stroke-width="1" opacity="0.4"/>
      <circle cx="${cx}" cy="${cy}" r="50" fill="none" stroke="${c1}" stroke-width="1.5" opacity="0.6"/>
      <circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="${c2}" stroke-width="2"/>
      <line x1="${cx}" y1="${cy - 30}" x2="${cx}" y2="${cy - 50}" stroke="${c2}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="${c2}"/>
      <path d="M ${cx - 20} ${cy + 15} Q ${cx} ${cy + 35} ${cx + 20} ${cy + 15}" fill="none" stroke="${c2}" stroke-width="1.5"/>
    </svg>`;
  },
};

const SVG_THUMB_TYPES = new Set(["text", "image", "shape"]);

const SCALABLE_BORDER_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
  "4": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "red";
    const c2 = "rgba(0,0,255,0.8)";
    const s = w / vw;
    const dash9 = `${100 * s} ${250 * s}`;
    const dash10 = `${80 * s} ${270 * s}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <polygon fill="transparent" points="${vw - 15},22 170,22 150,7 40,7 28,21 32,24 16,42 16,${vh - 32} 41,${vh - 7} ${vw - 15},${vh - 7}"/>
      <polyline class="dv-bb4-line-1" stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="145,${vh - 5} 40,${vh - 5} 10,${vh - 35} 10,40 40,5 150,5 170,20 ${vw - 15},20"/>
      <polyline class="dv-bb4-line-2" stroke="${c2}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="245,${vh - 1} 36,${vh - 1} 14,${vh - 23} 14,${vh - 100}"/>
      <polyline class="dv-bb4-line-3" stroke="${c1}" fill="none" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" points="7,${vh - 40} 7,${vh - 75}"/>
      <polyline class="dv-bb4-line-4" stroke="${c1}" fill="none" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" points="28,24 13,41 13,64"/>
      <polyline class="dv-bb4-line-5" stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="5,45 5,140"/>
      <polyline class="dv-bb4-line-6" stroke="${c2}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="14,75 14,180"/>
      <polyline class="dv-bb4-line-7" stroke="${c2}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="55,11 147,11 167,26 250,26"/>
      <polyline class="dv-bb4-line-8" stroke="${c2}" fill="none" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" points="158,5 173,16"/>
      <polyline class="dv-bb4-line-9" stroke="${c1}" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash9}" vector-effect="non-scaling-stroke" points="200,17 ${vw - 10},17"/>
      <polyline class="dv-bb4-line-10" stroke="${c2}" fill="none" stroke-width="1" stroke-dasharray="${dash10}" vector-effect="non-scaling-stroke" points="385,17 ${vw - 10},17"/>
    </svg>`;
  },
  "5": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "rgba(255,255,255,0.35)";
    const c2 = "rgba(255,255,255,0.20)";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <polygon fill="transparent" points="10,22 ${vw - 22},22 ${vw - 22},${vh - 86} ${vw - 84},${vh - 24} 10,${vh - 24}"/>
      <polyline class="dv-bb5-line-1" stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="8,5 ${vw - 5},5 ${vw - 5},${vh - 100} ${vw - 100},${vh - 5} 8,${vh - 5} 8,5"/>
      <polyline class="dv-bb5-line-2" stroke="${c2}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="3,5 ${vw - 20},5 ${vw - 20},${vh - 60} ${vw - 74},${vh - 5} 3,${vh - 5} 3,5"/>
      <polyline class="dv-bb5-line-3" stroke="${c2}" fill="none" stroke-width="5" vector-effect="non-scaling-stroke" points="50,13 ${vw - 35},13"/>
      <polyline class="dv-bb5-line-4" stroke="${c2}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" points="15,20 ${vw - 35},20"/>
      <polyline class="dv-bb5-line-5" stroke="${c2}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" points="15,${vh - 20} ${vw - 110},${vh - 20}"/>
      <polyline class="dv-bb5-line-6" stroke="${c2}" fill="none" stroke-width="5" vector-effect="non-scaling-stroke" points="15,${vh - 13} ${vw - 110},${vh - 13}"/>
    </svg>`;
  },
  "6": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "rgba(255,255,255,0.35)";
    const c2 = "gray";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <polygon fill="transparent" points="9,7 ${vw - 9},7 ${vw - 9},${vh - 7} 9,${vh - 7}"/>
      <circle fill="${c2}" cx="5" cy="5" r="2"/>
      <circle fill="${c2}" cx="${vw - 5}" cy="5" r="2"/>
      <circle fill="${c2}" cx="${vw - 5}" cy="${vh - 5}" r="2"/>
      <circle fill="${c2}" cx="5" cy="${vh - 5}" r="2"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="10,4 ${vw - 10},4"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="10,${vh - 4} ${vw - 10},${vh - 4}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="5,70 5,${vh - 70}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="${vw - 5},70 ${vw - 5},${vh - 70}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="3,10 3,50"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="7,30 7,80"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="${vw - 3},10 ${vw - 3},50"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="${vw - 7},30 ${vw - 7},80"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="3,${vh - 10} 3,${vh - 50}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="7,${vh - 30} 7,${vh - 80}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="${vw - 3},${vh - 10} ${vw - 3},${vh - 50}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" points="${vw - 7},${vh - 30} ${vw - 7},${vh - 80}"/>
    </svg>`;
  },
  "7": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "rgba(128,128,128,0.3)";
    const c2 = "rgba(128,128,128,0.5)";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <defs>
        <filter id="bb7-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur"/>
          <feComposite in="blur" in2="SourceGraphic" operator="atop"/>
        </filter>
      </defs>
      <rect x="1" y="1" width="${vw - 2}" height="${vh - 2}" fill="transparent" stroke="${c1}" stroke-width="1" filter="url(#bb7-glow)"/>
      <polyline stroke="${c1}" fill="none" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" points="0,25 0,0 25,0"/>
      <polyline stroke="${c1}" fill="none" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${vw - 25},0 ${vw},0 ${vw},25"/>
      <polyline stroke="${c1}" fill="none" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${vw - 25},${vh} ${vw},${vh} ${vw},${vh - 25}"/>
      <polyline stroke="${c1}" fill="none" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" points="0,${vh - 25} 0,${vh} 25,${vh}"/>
      <polyline stroke="${c2}" fill="none" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" points="0,10 0,0 10,0"/>
      <polyline stroke="${c2}" fill="none" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${vw - 10},0 ${vw},0 ${vw},10"/>
      <polyline stroke="${c2}" fill="none" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${vw - 10},${vh} ${vw},${vh} ${vw},${vh - 10}"/>
      <polyline stroke="${c2}" fill="none" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke" points="0,${vh - 10} 0,${vh} 10,${vh}"/>
    </svg>`;
  },
  "8": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "#235fa7";
    const c2 = "#4fd2dd";
    const pathD = `M2.5,2.5 L${vw - 2.5},2.5 L${vw - 2.5},${vh - 2.5} L2.5,${vh - 2.5} L2.5,2.5`;
    const length = (vw + vh - 5) * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <path d="${pathD}" fill="transparent" stroke="${c1}" stroke-width="1"/>
      <path d="${pathD}" fill="transparent" stroke="${c2}" stroke-width="3" stroke-dasharray="${length},0"/>
      <polygon fill="transparent" points="5,5 ${vw - 5},5 ${vw - 5},${vh - 5} 5,${vh - 5}"/>
    </svg>`;
  },
  "9": (w, h) => {
    const vw = 400;
    const vh = 300;
    const c1 = "#11eefd";
    const c2 = "#0078d2";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="bb9-thumb-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="100%" stop-color="${c2}"/>
        </linearGradient>
        <mask id="bb9-thumb-mask">
          <polyline stroke="#fff" stroke-width="3" fill="transparent" points="8,${vh * 0.4} 8,3,${vw * 0.4 + 7},3"/>
          <polyline fill="#fff" points="8,${vh * 0.15} 8,3,${vw * 0.1 + 7},3 ${vw * 0.1},8 14,8 14,${vh * 0.15 - 7}"/>
          <polyline stroke="#fff" stroke-width="3" fill="transparent" points="${vw * 0.5},3 ${vw - 3},3,${vw - 3},${vh * 0.25}"/>
          <polyline fill="#fff" points="${vw * 0.52},3 ${vw * 0.58},3 ${vw * 0.58 - 7},9 ${vw * 0.52 + 7},9"/>
          <polyline fill="#fff" points="${vw * 0.9},3 ${vw - 3},3 ${vw - 3},${vh * 0.1} ${vw - 9},${vh * 0.1 - 7} ${vw - 9},9 ${vw * 0.9 + 7},9"/>
          <polyline stroke="#fff" stroke-width="3" fill="transparent" points="8,${vh * 0.5} 8,${vh - 3} ${vw * 0.3 + 7},${vh - 3}"/>
          <polyline fill="#fff" points="8,${vh * 0.55} 8,${vh * 0.7} 2,${vh * 0.7 - 7} 2,${vh * 0.55 + 7}"/>
          <polyline stroke="#fff" stroke-width="3" fill="transparent" points="${vw * 0.35},${vh - 3} ${vw - 3},${vh - 3} ${vw - 3},${vh * 0.35}"/>
          <polyline fill="#fff" points="${vw * 0.92},${vh - 3} ${vw - 3},${vh - 3} ${vw - 3},${vh * 0.8} ${vw - 9},${vh * 0.8 + 7} ${vw - 9},${vh - 9} ${vw * 0.92 + 7},${vh - 9}"/>
        </mask>
      </defs>
      <polygon fill="transparent" points="15,9 ${vw * 0.1 + 1},9 ${vw * 0.1 + 4},6 ${vw * 0.52 + 2},6 ${vw * 0.52 + 6},10 ${vw * 0.58 - 7},10 ${vw * 0.58 - 2},6 ${vw * 0.9 + 2},6 ${vw * 0.9 + 6},10 ${vw - 10},10 ${vw - 10},${vh * 0.1 - 6} ${vw - 6},${vh * 0.1 - 1} ${vw - 6},${vh * 0.8 + 1} ${vw - 10},${vh * 0.8 + 6} ${vw - 10},${vh - 10} ${vw * 0.92 + 7},${vh - 10} ${vw * 0.92 + 2},${vh - 6} 11,${vh - 6} 11,${vh * 0.15 - 2} 15,${vh * 0.15 - 7}"/>
      <rect x="0" y="0" width="${vw}" height="${vh}" fill="url(#bb9-thumb-grad)" mask="url(#bb9-thumb-mask)"/>
    </svg>`;
  },
};

function parseDataVType(type: string): { kind: "border" | "decoration"; idx: string } | null {
  const borderMatch = type.match(/^datav-border-(\d+)$/);
  if (borderMatch) return { kind: "border", idx: borderMatch[1] };
  const decoMatch = type.match(/^datav-decoration-(\d+)$/);
  if (decoMatch) return { kind: "decoration", idx: decoMatch[1] };
  return null;
}

async function invokeTauri(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args as any);
}

function svgToDataUrl(svgStr: string, w: number, h: number): Promise<string | null> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * THUMB_DPR;
      c.height = h * THUMB_DPR;
      const ctx = c.getContext("2d")!;
      ctx.scale(THUMB_DPR, THUMB_DPR);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function generateSvgThumbnail(type: string): string | null {
  const w = THUMB_W;
  const h = THUMB_H;

  if (type === "text") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#07111f"/>
          <stop offset="50%" stop-color="#0d1b2a"/>
          <stop offset="100%" stop-color="#101827"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" rx="4" fill="url(#bg)"/>
      <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="central"
            font-family="sans-serif" font-size="16" font-weight="bold" fill="#e0e0e0">Aa</text>
      <text x="${w / 2}" y="${h / 2 + 18}" text-anchor="middle" dominant-baseline="central"
            font-family="sans-serif" font-size="8" fill="#7acaec">文本</text>
    </svg>`;
  }

  if (type === "image") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#07111f"/>
          <stop offset="50%" stop-color="#0d1b2a"/>
          <stop offset="100%" stop-color="#101827"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" rx="4" fill="url(#bg)"/>
      <rect x="20" y="12" width="${w - 40}" height="${h - 24}" rx="3"
            fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 2"/>
      <polygon points="32,${h - 22} 48,${h - 36} 60,${h - 26} 76,${h - 32} ${w - 32},${h - 22}"
               fill="rgba(122,202,236,0.25)" stroke="#7acaec" stroke-width="0.5"/>
      <circle cx="${w - 38}" cy="26" r="6" fill="#ffd54f" opacity="0.7"/>
      <text x="${w / 2}" y="${h / 2 + 2}" text-anchor="middle" dominant-baseline="central"
            font-family="sans-serif" font-size="8" fill="rgba(255,255,255,0.4)">图片</text>
    </svg>`;
  }

  if (type === "shape") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#07111f"/>
          <stop offset="50%" stop-color="#0d1b2a"/>
          <stop offset="100%" stop-color="#101827"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" rx="4" fill="url(#bg)"/>
      <rect x="16" y="14" width="38" height="28" rx="2"
            fill="rgba(33,150,243,0.3)" stroke="#2196F3" stroke-width="1.5"/>
      <circle cx="78" cy="28" r="14"
              fill="rgba(33,150,243,0.3)" stroke="#2196F3" stroke-width="1.5"/>
      <line x1="16" y1="62" x2="${w - 16}" y2="62"
            stroke="#2196F3" stroke-width="2"/>
      <text x="${w / 2}" y="${h - 6}" text-anchor="middle" dominant-baseline="central"
            font-family="sans-serif" font-size="7" fill="rgba(255,255,255,0.35)">形状</text>
    </svg>`;
  }

  return null;
}

class ThumbnailGenerator {
  private offscreen: HTMLDivElement | null = null;
  private active = 0;
  private generating = new Set<string>();
  private generated = new Set<string>();

  getUrl(type: string): string {
    // 与后端 save_thumbnail 保持一致：冒号等非法字符替换为 __
    const safeType = type.replace(/:/g, "__");
    return `/thumbnails/${safeType}.png`;
  }

  async ensureAll(): Promise<void> {
    const allDefs = componentRegistry.getAll();
    const types = allDefs
      .filter((d) => d.enabled !== false && !SKIP_THUMBNAIL_TYPES.has(d.type))
      .map((d) => d.type);

    if (types.length === 0) return;

    let existingMap: Map<string, boolean>;
    try {
      const results = await invokeTauri("check_thumbnails_exist", { types }) as boolean[];
      existingMap = new Map(types.map((t, i) => [t, results[i]]));
    } catch {
      existingMap = new Map(types.map((t) => [t, false]));
    }

    // 设备类型缩略图总是重新生成（设备外观可能随代码更新而变化）
    const deviceTypes = types.filter((t) => t.startsWith("device:"));
    const nonDeviceTypes = types.filter((t) => !t.startsWith("device:"));

    const missing = nonDeviceTypes.filter((t) => !existingMap.get(t) && !this.generated.has(t));
    // 设备类型：无论是否已存在都重新生成
    const deviceMissing = deviceTypes.filter((t) => !this.generated.has(t));

    const allMissing = [...missing, ...deviceMissing];
    if (allMissing.length === 0) {
      logger.info("ThumbnailGenerator", `All ${types.length} thumbnails exist, skipping generation`);
      return;
    }

    logger.info("ThumbnailGenerator", `Generating ${allMissing.length} thumbnails (${deviceMissing.length} device, ${missing.length} other)...`);

    const promises = allMissing.map((type) => this._scheduleGenerate(type));
    await Promise.allSettled(promises);

    logger.info("ThumbnailGenerator", "Thumbnail generation complete");
  }

  async generate(type: string): Promise<string | null> {
    if (SKIP_THUMBNAIL_TYPES.has(type)) return null;
    if (this.generated.has(type)) return this.getUrl(type);

    if (this.generating.has(type)) {
      while (this.generating.has(type)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return this.generated.has(type) ? this.getUrl(type) : null;
    }

    const dataUrl = await this._scheduleGenerate(type);
    return dataUrl ? this.getUrl(type) : null;
  }

  private async _scheduleGenerate(type: string): Promise<string | null> {
    while (this.active >= CONCURRENCY) {
      await new Promise((r) => setTimeout(r, 30));
    }
    this.active++;
    this.generating.add(type);
    try {
      const result = await Promise.race([
        this._generate(type),
        new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT)),
      ]);
      if (result) this.generated.add(type);
      return result;
    } finally {
      this.active--;
      this.generating.delete(type);
    }
  }

  private async _generate(type: string): Promise<string | null> {
    const def = componentRegistry.get(type);
    if (!def) return null;

    try {
      let dataUrl: string | null = null;

      // 设备组件：使用专门的 SVG 缩略图生成（参考金箔雕花边框的做法）
      if (type.startsWith("device:")) {
        dataUrl = await this._generateDeviceSvg(type);
      }

      if (!dataUrl && SVG_THUMB_TYPES.has(type)) {
        dataUrl = await this._generateSvgThumb(type);
      } else if (!dataUrl) {
        const dataVInfo = parseDataVType(type);
        if (dataVInfo && dataVInfo.kind === "border" && dataVInfo.idx === "11") {
          dataUrl = await this._generateOrnamentalFrame();
        } else if (dataVInfo && dataVInfo.kind === "border" && (
          SCALABLE_BORDER_SVG_THUMBS[dataVInfo.idx] ||
          BORDER_SVG_THUMBS_EXTRA[dataVInfo.idx]
        )) {
          const thumbFn = SCALABLE_BORDER_SVG_THUMBS[dataVInfo.idx] || BORDER_SVG_THUMBS_EXTRA[dataVInfo.idx];
          const svgStr = thumbFn(THUMB_W, THUMB_H);
          dataUrl = await svgToDataUrl(svgStr, THUMB_W, THUMB_H);
        } else if (dataVInfo && dataVInfo.kind === "decoration" && DECO_SVG_THUMBS[dataVInfo.idx]) {
          const svgStr = DECO_SVG_THUMBS[dataVInfo.idx](THUMB_W, THUMB_H);
          dataUrl = await svgToDataUrl(svgStr, THUMB_W, THUMB_H);
        } else if (dataVInfo) {
          dataUrl = await this._generateDataV(type, dataVInfo);
        } else {
          dataUrl = await this._generateGeneric(type, def);
        }
      }

      if (dataUrl) {
        await this._saveToDisk(type, dataUrl);
      }

      return dataUrl;
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to generate thumbnail for "${type}":`, { error: String(e) });
      return null;
    }
  }

  private async _generateSvgThumb(type: string): Promise<string | null> {
    const svgStr = generateSvgThumbnail(type);
    if (!svgStr) return null;
    return svgToDataUrl(svgStr, THUMB_W, THUMB_H);
  }

  private async _generateDataV(
    _type: string,
    info: { kind: "border" | "decoration"; idx: string }
  ): Promise<string | null> {
    const compMap = info.kind === "border" ? BORDER_MAP : DECO_MAP;
    const defaults = info.kind === "border" ? BORDER_DEFAULTS : DECO_DEFAULTS;
    const Component = compMap[info.idx];
    if (!Component) return null;

    const defaultColors = defaults[info.idx] || ["#4fd2dd", "#235fa7"];

    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    const props: Record<string, any> = {
      color: defaultColors,
      backgroundColor: "transparent",
      style: { width: "100%", height: "100%" },
    };

    if (info.kind === "border" && info.idx === "11") {
      props.titleWidth = 250;
    }

    root.render(React.createElement(Component, props));

    await new Promise<void>((r) => setTimeout(r, RENDER_WAIT_SVG));

    const dataUrl = await this._capture(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }
  private async _generateOrnamentalFrame(): Promise<string | null> {
    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    root.render(
      React.createElement(OrnamentalFrame, {
        color1: "#e1b86c",
        color2: "#8c5c00",
        backgroundColor: "transparent",
        reverse: false,
      })
    );

    await new Promise<void>((r) => setTimeout(r, RENDER_WAIT_SVG));

    const dataUrl = await this._capture(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }

  private async _generateDeviceSvg(type: string): Promise<string | null> {
    // 设备组件：优先走 React 渲染器（触发 isTemplate 逻辑 → 红色面板 + 绿点 + 产品名），
    // 只有 React 渲染器加载失败时才 fallback 到 DEVICE_SVG_THUMBS 静态 SVG
    const def = componentRegistry.get(type);
    if (def) {
      const reactResult = await this._generateGeneric(type, def);
      if (reactResult) return reactResult;
    }

    // Fallback：使用预定义的静态 SVG（无屏幕内容，仅外壳轮廓）
    const svgGenerator = DEVICE_SVG_THUMBS[type];
    if (!svgGenerator) return null;

    const w = THUMB_W;
    const h = THUMB_H;
    const svgStr = svgGenerator(w, h);
    return svgToDataUrl(svgStr, w, h);
  }

  private async _generateGeneric(type: string, def: any): Promise<string | null> {
    const Renderer = await componentRegistry.loadRenderer(type);
    if (!Renderer) return null;

    const dw = def.defaultSize?.width ?? THUMB_W * 2;
    const dh = def.defaultSize?.height ?? THUMB_H * 2;
    const s = Math.min(THUMB_W / dw, THUMB_H / dh, 1);
    const w = Math.round(dw * s);
    const h = Math.round(dh * s);

    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${w}px;height:${h}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    root.render(
      React.createElement(Renderer, {
        config: { ...def.defaultConfig, _thumbnail: true },
        componentId: `thumb-${type}`,
        mode: "preview",
        width: w,
        height: h,
      })
    );

    const usesCanvas = type === "echart" || type.startsWith("echart-");
    const waitMs = usesCanvas ? RENDER_WAIT_CANVAS : RENDER_WAIT_SVG;
    await new Promise<void>((r) => setTimeout(r, waitMs));

    // 设备组件：跳过 SVG 截图，直接走 DOM 截图
    // 原因：SVG 截图会丢失 filter/clipPath 引用、无背景色、低分辨率
    // 而 DOM 截图（toPng）能完整保留 React 渲染效果，与集控器缩略图一致
    const dataUrl = type.startsWith("device:")
      ? await this._captureDom(mount)
      : await this._capture(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }

  private async _capture(mount: HTMLDivElement): Promise<string | null> {
    const svgResult = await this._captureSvg(mount);
    if (svgResult) return svgResult;

    const canvasResult = this._captureCanvas(mount);
    if (canvasResult) return canvasResult;

    const domResult = await this._captureDom(mount);
    if (domResult) return domResult;

    return null;
  }

  private async _captureSvg(mount: HTMLDivElement): Promise<string | null> {
    const svg = mount.querySelector("svg");
    if (!svg) return null;

    try {
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(THUMB_W));
      clone.setAttribute("height", String(THUMB_H));
      // 保留原 SVG 的 viewBox + 强制 meet 居中（保持设备原始比例）
      const origViewBox = svg.getAttribute("viewBox");
      if (origViewBox) clone.setAttribute("viewBox", origViewBox);
      clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

      // 注入背景矩形：解决 SVG 透明区域变成黑色的问题
      // 直接在 <svg> 第一个子元素前插入一个全 viewBox 填充的背景矩形
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("x", "0");
      bgRect.setAttribute("y", "0");
      if (origViewBox) {
        const parts = origViewBox.split(/\s+/).map(Number);
        bgRect.setAttribute("width", String(parts[2] ?? THUMB_W));
        bgRect.setAttribute("height", String(parts[3] ?? THUMB_H));
      } else {
        bgRect.setAttribute("width", String(THUMB_W));
        bgRect.setAttribute("height", String(THUMB_H));
      }
      bgRect.setAttribute("fill", THUMB_BG_COLOR);
      clone.insertBefore(bgRect, clone.firstChild);

      clone
        .querySelectorAll("animate,animateTransform,animateMotion")
        .forEach((e) => e.remove());

      const str = new XMLSerializer().serializeToString(clone);
      return svgToDataUrl(str, THUMB_W, THUMB_H);
    } catch {
      return null;
    }
  }

  private _captureCanvas(mount: HTMLDivElement): string | null {
    const canvas = mount.querySelector("canvas");
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  private async _captureDom(mount: HTMLDivElement): Promise<string | null> {
    try {
      const rect = mount.getBoundingClientRect();
      const dataUrl = await toPng(mount, {
        width: rect.width || THUMB_W,
        height: rect.height || THUMB_H,
        pixelRatio: THUMB_DPR,
        backgroundColor: THUMB_BG_COLOR,
        skipAutoScale: true,
        fetchRequestInit: {
          cache: "no-store",
        } as RequestInit,
      });
      return dataUrl;
    } catch {
      return null;
    }
  }

  private async _saveToDisk(type: string, dataUrl: string): Promise<void> {
    try {
      await invokeTauri("save_thumbnail", { componentType: type, dataUrl });
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to save thumbnail for "${type}":`, { error: String(e) });
    }
  }

  private _offscreen(): HTMLDivElement {
    if (!this.offscreen || !document.body.contains(this.offscreen)) {
      this.offscreen = document.createElement("div");
      this.offscreen.setAttribute("aria-hidden", "true");
      this.offscreen.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;pointer-events:none;z-index:-1;";
      document.body.appendChild(this.offscreen);
    }
    return this.offscreen;
  }

  async captureElement(element: HTMLElement, type: string): Promise<string | null> {
    try {
      const rect = element.getBoundingClientRect();
      const dataUrl = await toPng(element, {
        width: rect.width || THUMB_W,
        height: rect.height || THUMB_H,
        pixelRatio: THUMB_DPR,
        backgroundColor: THUMB_BG_COLOR,
        skipAutoScale: true,
        fetchRequestInit: {
          cache: "no-store",
        } as RequestInit,
      });
      if (dataUrl && type) {
        await this._saveToDisk(type, dataUrl);
      }
      return dataUrl;
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to capture element for "${type}":`, { error: String(e) });
      return null;
    }
  }

  getThumbnailUrl(type: string): string {
    return `${this.getUrl(type)}&t=${Date.now()}`;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
