import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 将文件路径转换为可显示的 URL。
 * data: 和 http(s): 协议直接返回；本地文件路径通过 Tauri convertFileSrc 转换。
 */
export function toAssetUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) return path;
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
