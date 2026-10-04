// Decoration 7-12 的 SVG 缩略图
export const DECO_SVG_THUMBS: Record<string, (w: number, h: number) => string> = {
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