/**
 * 内容面板（content-panel）共享数据工具
 *
 * panes 以 JSON 字符串形式存在组件 config 中，属性编辑器（PaneEditor）、
 * 画布渲染器（ContentPanelRenderer）、codegen、菜单绑定列表（MenuItemsEditor）
 * 四处均需解析——必须走同一实现，保证行为一致。
 */

export interface PaneItem {
  id: string;
  name: string;
  content: string;
  bgColor?: string | null;
}

/** 解析 panes JSON 字符串 → 规范化 PaneItem[]；解析失败返回空数组 */
export function parsePanes(raw: unknown): PaneItem[] {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("[")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: PaneItem[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    let id = String(p.id ?? "").trim();
    if (!id) id = genPaneId();
    // 重复 ID 会导致菜单绑定错乱，只保留第一个
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(p.name ?? ""),
      content: String(p.content ?? ""),
      bgColor: p.bgColor == null ? null : String(p.bgColor),
    });
  }
  return out;
}

/** 序列化 PaneItem[] → JSON 字符串 */
export function serializePanes(panes: PaneItem[]): string {
  return JSON.stringify(panes, null, 2);
}

/** 生成唯一面板 id */
export function genPaneId(): string {
  return `pane-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * 规范化激活面板 ID：activePaneId 指向的面板不存在（被删除/ID 变动）时
 * 回退到第一个面板；空列表返回空字符串
 */
export function normalizeActivePaneId(panes: PaneItem[], activePaneId: unknown): string {
  const id = String(activePaneId ?? "").trim();
  if (id && panes.some((p) => p.id === id)) return id;
  return panes[0]?.id ?? "";
}

/** rgb()/rgba()/#hex → #rrggbb（供原生 color input 使用），无法转换返回 fallback */
export function colorToHex(color: string | null | undefined, fallback = "#1e1e32"): string {
  const c = String(color ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return "#" + c.slice(1).split("").map((ch) => ch + ch).join("").toLowerCase();
  }
  const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    if ([r, g, b].every((v) => v >= 0 && v <= 255)) {
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    }
  }
  return fallback;
}

/**
 * 插值：将 content 中 {field} 占位符替换为 data 中对应字段值。
 * 支持嵌套路径 {a.b.c}；字段不存在时保留原文（便于发现绑定错误）。
 * 编辑器渲染与发布产物共用此语义。
 */
export function interpolateContent(content: string, data: unknown): string {
  if (!content || typeof content !== "string" || content.indexOf("{") < 0) return content;
  const get = (path: string): unknown => {
    let cur: unknown = data;
    for (const k of path.split(".")) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  };
  return content.replace(/\{\s*([A-Za-z0-9_.\-]+)\s*\}/g, (whole, key: string) => {
    const v = get(key);
    if (v === undefined || v === null) return whole;
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}
