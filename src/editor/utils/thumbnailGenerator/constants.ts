export const THUMB_W = 120;
export const THUMB_H = 80;
export const THUMB_DPR = 1;
export const CONCURRENCY = 4;
export const RENDER_WAIT_SVG = 200;
export const RENDER_WAIT_CANVAS = 400;
export const TIMEOUT = 8000;

export const THUMB_BG = "linear-gradient(180deg, #07111f 0%, #0d1b2a 50%, #101827 100%)";
export const THUMB_BG_COLOR = "#0d1b2a";

export const SKIP_THUMBNAIL_TYPES = new Set([
  "map-tile",
  "map-cad",
  "map-globe",
  "map-heatmap",
  "map-blue-print",
  "video",
]);