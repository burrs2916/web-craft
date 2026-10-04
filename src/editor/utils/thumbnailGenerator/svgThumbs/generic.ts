import { THUMB_W, THUMB_H } from "../constants";

export function generateSvgThumbnail(type: string): string | null {
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