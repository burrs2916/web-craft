export function isLightColor(color: string): boolean {
  if (!color.startsWith("#")) return false;
  const hex = color.slice(1);
  if (hex.length < 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

export function lightenColor(color: string, amount: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  if (hex.length < 6) return color;
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}