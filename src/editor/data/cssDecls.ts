/**
 * CSS 声明对象与取值小工具的**公共底座** —— 所有「唯一取值口径」文件共用。
 *
 * 背景：`tableStyle.ts` / `mediaStyle.ts` / `fieldStyle.ts` / `iconStyle.ts` 等口径文件
 * 曾各自复制一份 `num/clampNum/str/bool` 与 `cssText/styleAttr`。同一批工具复制 N 份，
 * 一旦有人只改其中一份（比如加了 `!important` 过滤），两端行为就会悄悄分叉。
 * 现在这些原语只此一份，各口径文件与 tableStyle 一样从这里取。
 *
 * 输出形态约定（全仓库一致）：
 * - 口径文件返回 **React 风格的 CSS 声明对象**（camelCase 键、值自带单位）；
 * - 编辑区直接展开进 MUI `sx={{ ...decl }}`；
 * - 发布端用 `cssText(decl)` 序列化成 `kebab-case:value;` 拼进 `style="…"`。
 */

/** CSS 声明对象（camelCase → 值） */
export type CssDecls = Record<string, string>;

/* ──────────────────────────────────────────────
 * 序列化：供发布端把声明对象写进 style 属性
 * ────────────────────────────────────────────── */

/** camelCase → kebab-case（忽略自定义属性 `--x`） */
export function kebab(key: string): string {
  if (key.startsWith("--")) return key;
  return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** 声明对象 → `a:1;b:2`（空值声明被丢弃） */
export function cssText(decls: CssDecls): string {
  return Object.entries(decls)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${kebab(k)}:${v}`)
    .join(";");
}

/** 声明对象 → `style="a:1;b:2"`（空对象返回空串） */
export function styleAttr(decls: CssDecls): string {
  const s = cssText(decls);
  return s ? ` style="${s}"` : "";
}

/** 转义写进 HTML 文本节点的内容（发布端统一入口） */
export function escapeHTML(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 转义写进 HTML 属性值的内容（单引号也转，避免与单引号属性冲突） */
export function escapeAttr(v: unknown): string {
  return escapeHTML(v).replace(/'/g, "&#39;");
}

/* ──────────────────────────────────────────────
 * 取值小工具
 * ────────────────────────────────────────────── */

export function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num(v, fallback)));
}

/** 去首尾空白；空串时返回 fallback（注意：`"0"` 不是空串） */
export function str(v: unknown, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

/** 未被显式设置过（undefined/null）时取 fallback，否则严格按 `=== true` 判真 */
export function bool(v: unknown, fallback: boolean): boolean {
  return v === undefined || v === null ? fallback : v === true;
}

/* ──────────────────────────────────────────────
 * 对齐映射（两端同一张表，勿在渲染器里再写一份）
 * ────────────────────────────────────────────── */

/** 面板对齐值 → flex `justify-content` */
export function alignToFlex(v: unknown): string {
  const a = String(v ?? "left");
  if (a === "center") return "center";
  if (a === "right" || a === "flex-end") return "flex-end";
  return "flex-start";
}

/** 面板对齐值 → `text-align` */
export function alignToText(v: unknown): string {
  const a = String(v ?? "left");
  return a === "center" ? "center" : a === "right" ? "right" : "left";
}

/**
 * 面板**垂直**对齐值 → flex `align-items`。
 * 与 `alignToFlex` 分开是必须的：后者的 `left/right` 语义在纵轴上不存在，
 * 若复用会把「底部对齐」错映射成 `flex-start`。默认 `center`（本仓库既定观感）。
 */
export function vAlignToFlex(v: unknown): string {
  const a = String(v ?? "center");
  if (a === "top") return "flex-start";
  if (a === "bottom" || a === "flex-end") return "flex-end";
  return "center";
}

/** 向 `flex-start|center|flex-end` 拉齐到合法值 */
export function flexToAlign(v: unknown): "left" | "center" | "right" {
  const a = String(v ?? "left");
  if (a === "center") return "center";
  if (a === "right" || a === "flex-end") return "right";
  return "left";
}
