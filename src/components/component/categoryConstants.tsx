/** 分组颜色预设 */
export const COLOR_PRESETS = [
  "#90CAF9", "#A5D6A7", "#FFCC80", "#EF9A9A", "#CE93D8",
  "#80DEEA", "#F48FB1", "#FFE082", "#B0BEC5", "#BCAAA4",
];

/** 分组默认图标 */
export const DEFAULT_CATEGORY_ICON = "folder";

/** 分组默认颜色 */
export const DEFAULT_CATEGORY_COLOR = "#90CAF9";

import React from "react";
import { resolveIcon } from "../../editor/plugins";
import { CustomIconImg, isCustomIcon } from "./CustomIconImg";

/** 分组图标渲染：支持 emoji / custom / material 三种格式 */
export function renderCategoryIcon(icon: string | null | undefined, size: number = 12): React.ReactElement {
  if (icon && /^\p{Emoji}/u.test(icon) && icon.length <= 2) {
    return <span style={{ fontSize: size }}>{icon}</span>;
  }
  if (isCustomIcon(icon)) {
    return <CustomIconImg icon={icon!} size={size} fallback={resolveIcon("folder", "folder", size)} />;
  }
  return resolveIcon(icon ?? "folder", "folder", size);
}
