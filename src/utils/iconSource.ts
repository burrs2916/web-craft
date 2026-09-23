// 图标源解析工具
// 图标源格式：
//   "material:Widgets"               — MUI 图标
//   "thumbnail"                      — 自动截图（从 /thumbnails/{type}.png 加载）
//   "upload"                         — 上传的图片（同 thumbnail 路径，区别在 source 类型）
//   "text:📊"                        — 文字/emoji
//   "text:Hello"                     — 纯文字
//   "color:#3faacb"                  — 纯色块（无文字）
//
// 注意：原 `iconOverride` 字段是 MUI 图标名（裸字符串），与 "material:xxx" 等价。
// 旧数据（"Widgets"）自动按 material 处理。

export type IconSource =
  | { kind: "material"; name: string }
  | { kind: "thumbnail" }
  | { kind: "text"; content: string }
  | { kind: "color"; color: string };

export const ICON_SOURCE_PREFIX = {
  material: "material:",
  thumbnail: "thumbnail:",
  upload: "upload:",
  text: "text:",
  color: "color:",
} as const;

export function parseIconSource(raw: string | null | undefined): IconSource {
  if (!raw) return { kind: "material", name: "widgets" };

  if (raw.startsWith(ICON_SOURCE_PREFIX.thumbnail) || raw === "thumbnail" || raw === "thumbnail:") {
    return { kind: "thumbnail" };
  }
  if (raw.startsWith(ICON_SOURCE_PREFIX.upload)) {
    return { kind: "thumbnail" };
  }
  if (raw.startsWith(ICON_SOURCE_PREFIX.text)) {
    return { kind: "text", content: raw.slice(ICON_SOURCE_PREFIX.text.length) };
  }
  if (raw.startsWith(ICON_SOURCE_PREFIX.color)) {
    return { kind: "color", color: raw.slice(ICON_SOURCE_PREFIX.color.length) };
  }
  if (raw.startsWith(ICON_SOURCE_PREFIX.material)) {
    return { kind: "material", name: raw.slice(ICON_SOURCE_PREFIX.material.length) };
  }

  // 兼容历史裸字符串（无前缀）= MUI 图标名
  return { kind: "material", name: raw };
}

export function serializeIconSource(src: IconSource): string {
  switch (src.kind) {
    case "material": return `${ICON_SOURCE_PREFIX.material}${src.name}`;
    case "thumbnail": return ICON_SOURCE_PREFIX.thumbnail;
    case "text": return `${ICON_SOURCE_PREFIX.text}${src.content}`;
    case "color": return `${ICON_SOURCE_PREFIX.color}${src.color}`;
  }
}

export function getIconDisplayUrl(type: string, src: IconSource, thumbnailUpdatedAt?: number): string | null {
  if (src.kind === "thumbnail") {
    // 与后端 save_thumbnail 保持一致：冒号等非法字符替换为 __
    const safeType = type.replace(/:/g, "__");
    return `/thumbnails/${safeType}.png${thumbnailUpdatedAt ? `?t=${thumbnailUpdatedAt}` : ""}`;
  }
  return null;
}

/**
 * 获取组件的有效图标源。
 * - 如果 iconOverride 存在且与 definitionIcon 语义不同，使用 iconOverride
 * - 否则使用 definitionIcon
 * - 两者都为空时返回 material:widgets
 */
export function getEffectiveIconSource(
  iconOverride: string | null | undefined,
  definitionIcon: string | null | undefined,
): IconSource {
  if (iconOverride) {
    const overrideParsed = parseIconSource(iconOverride);
    const defParsed = parseIconSource(definitionIcon);
    // 语义相同则使用 definition 图标（避免无意义的 override）
    if (overrideParsed.kind === defParsed.kind) {
      if (overrideParsed.kind === "material" && defParsed.kind === "material" && overrideParsed.name === defParsed.name) {
        return defParsed;
      }
      if (overrideParsed.kind === "thumbnail" && defParsed.kind === "thumbnail") {
        return defParsed;
      }
    }
    return overrideParsed;
  }
  return parseIconSource(definitionIcon);
}
