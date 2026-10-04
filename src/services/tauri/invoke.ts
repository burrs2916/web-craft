import { invoke as _tInvoke } from "@tauri-apps/api/core";

// ─── Tauri 环境守卫 ──────────────────────────────────────────────
// Tauri 2.x 在 webview 启动时才注入 `window.__TAURI_INTERNALS__`，
// 在纯浏览器（vite dev 直接打开 / dist 静态文件 / webview 还没初始化完）
// 环境下 `invoke` 函数内部会访问 `undefined.invoke` 抛 TypeError。
// 这里包一层守卫，浏览器模式下拒绝调用并给出明确提示，store 侧
// 仍按 reject 处理（不污染控制台），不影响 UI 渲染。
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isTauri()) {
    const msg = `[tauri] command "${cmd}" unavailable: not running inside Tauri webview. Use "npm run tauri dev" or "tauri dev".`;
    if (typeof window !== "undefined") {
      console.warn(msg);
    }
    return Promise.reject(new Error(msg));
  }
  return _tInvoke<T>(cmd, args);
};