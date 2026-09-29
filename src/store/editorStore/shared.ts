import type { ViewportState } from "../../types/editor";
import type { EditorState, EditorStore } from "./types";

export const DEFAULT_VIEWPORT: ViewportState = {
  scale: 1,
  offset: { x: 0, y: 0 },
};

export function deepClone<T>(obj: T): T {
  return structuredClone(obj);
}

/** immer 中间件下 `set` 的最小契约：支持草稿函数或部分状态对象两种形式。 */
export type EditorSet = (
  updater: ((draft: EditorState) => void) | Partial<EditorStore>,
) => void;

export type EditorGet = () => EditorStore;