// Border 1,2,3,10 的 SVG 缩略图
export const BORDER_SVG_THUMBS_EXTRA: Record<string, (w: number, h: number) => string> = {
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

export const SCALABLE_BORDER_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
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