/**
 * 单元格编辑运行时：可编辑判定、编辑值解析、写回与 HTML 渲染。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */
import { formatCellDisplay } from './rows';
import type { ColumnDef } from './columns';
import type { TableRow } from './rows';

export const EDITABLE_CELL_TYPES = ["text", "number", "date", "boolean", "select"] as const;

/** 该列是否可编辑：类型在集合内且未被显式声明只读（editable !== false） */

export function isCellEditable(col: ColumnDef): boolean {
  var t = String(col.type ?? "text");
  return (t === "text" || t === "number" || t === "date" || t === "boolean" || t === "select") && col.editable !== false;
}

/** 编辑控件的初始值（字符串形态）：date 取 YYYY-MM-DD 前缀，boolean 映射是/否 */

export function initialEditValue(raw: unknown, col: ColumnDef): string {
  if (raw == null) return "";
  if (col.type === "date") {
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  if (col.type === "boolean") {
    return raw === true || raw === "true" || raw === 1 ? "是" : "否";
  }
  return String(raw);
}

/**
 * 编辑提交值解析（两端同源）：number 非法输入保持原字符串（诚实不吞），
 * boolean 是/true/1 → true，其余按字符串。
 */

export function parseCellEditValue(col: ColumnDef, input: unknown): unknown {
  const v = String(input == null ? "" : input);
  if (col.type === "number") {
    if (v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return v;
  }
  if (col.type === "boolean") {
    return v === "是" || v === "true" || v === "1";
  }
  return v;
}

/**
 * 行的搜索文本（与 filterTableRows 的匹配口径一致的纯文本表示）。
 * 自包含，可被 codegen 以 toString() 内联进编辑脚本（提交后同步 data-search-text）。
 */

export function tableRowSearchText(row: TableRow, columns: ColumnDef[]): string {
  return columns
    .map((col) => {
      const raw = row[col.field];
      if (raw == null) return "";
      if (col.type === "boolean") {
        const on = raw === true || raw === "true" || raw === 1;
        return on ? "是" : "否";
      }
      return String(raw);
    })
    .join(" ")
    .toLowerCase();
}

/**
 * 多态单元格 HTML（发布端唯一渲染口径，取代 codegen 内的手写 renderCellCodegen /
 * 运行时 renderCell 双份实现）。引用 formatCellDisplay —— 内联点须先声明该标识符
 * （同 computeVirtualRange 引用 VIRTUAL_OVERSCAN 的既有范式）。
 * 转义口径与 codegen escapeHTML 完全一致（含单引号 &#039;）。
 */

export function renderCellHtml(row: TableRow, col: ColumnDef): string {
  const esc = (s: unknown): string =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const safeUrl = (u: string): string | null => {
    try {
      const p = new URL(u, "http://localhost").protocol;
      return p === "http:" || p === "https:" || p === "data:" ? u : null;
    } catch (e) {
      return null;
    }
  };
  const raw = row[col.field];
  if (raw == null) return "";
  const val = String(raw);
  if (col.type === "boolean") {
    const on = raw === true || raw === "true" || raw === 1;
    const color = on ? "#4CAF50" : "#F44336";
    return '<span style="display:inline-flex;align-items:center;gap:4px;color:' + color + ';font-size:inherit"><span style="width:8px;height:8px;border-radius:50%;background-color:' + color + ';display:inline-block"></span>' + (on ? "是" : "否") + "</span>";
  }
  if (col.type === "status" && val) {
    const dotColor = val === "error" ? "#F44336" : val === "warning" ? "#FF9800" : "#4CAF50";
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:0.85em;background-color:rgba(255,255,255,0.08);color:rgba(255,255,255,0.9)"><span style="width:6px;height:6px;border-radius:50%;background-color:' + dotColor + ';display:inline-block"></span>' + esc(val) + "</span>";
  }
  if (col.type === "link" && val) {
    const href = safeUrl(val) != null ? safeUrl(val) as string : "#unsafe";
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" style="color:#2196F3;text-decoration:none;font-size:inherit">' + esc(val) + "</a>";
  }
  if (col.type === "image" && val) {
    const src = safeUrl(val) != null ? safeUrl(val) as string : "";
    if (!src) return "";
    return '<img src="' + esc(src) + '" alt="' + esc(col.header || col.field) + '" style="max-width:48px;max-height:32px;object-fit:contain;border-radius:2px;display:block" />';
  }
  return esc(formatCellDisplay(row, col));
}

/**
 * 单元格写回请求（发布端编辑脚本专用，自包含）。
 * 请求体：{ [idField]: 行主键值, [field]: 新值 }（idField 缺失或行无该字段时只发字段值）。
 * 取数基建口径与 dataLoaderScript 完全同源：__WC_API_BASE 拼接、__WC_DEFAULT_HEADERS、
 * 认证三态（null = 跟随 __WC_AUTH_ENABLED）、__WC_TOKEN_* 四件套。
 * 站点静态模式（__WC_SITE_MODE === "static"）不发请求，视为本地生效（乐观值保留）。
 * 返回 Promise<boolean>：true = 写回成功或无需写回；false = 失败（调用方回滚）。
 */

export function tableCellWriteBack(o: {
  url: string;
  method: string;
  idField: string;
  row: TableRow;
  field: string;
  value: unknown;
  authEnabled: boolean | null;
}): Promise<boolean> {
  const w = (typeof window !== "undefined" ? window : {}) as unknown as Record<string, unknown>;
  if (w.__WC_SITE_MODE === "static") return Promise.resolve(true);
  let full = String(o.url ?? "");
  const base = typeof w.__WC_API_BASE === "string" ? w.__WC_API_BASE : "";
  if (full && base && !/^https?:\/\//i.test(full)) {
    full = base.replace(/\/+$/, "") + (full.charAt(0) === "/" ? full : "/" + full);
  }
  if (!full) return Promise.resolve(true);
  const headers: Record<string, string> = {};
  const dh = (w.__WC_DEFAULT_HEADERS && typeof w.__WC_DEFAULT_HEADERS === "object" ? w.__WC_DEFAULT_HEADERS : {}) as Record<string, string>;
  for (const k in dh) headers[k] = dh[k];
  if (headers["Content-Type"] === undefined) headers["Content-Type"] = "application/json";
  const useAuth = o.authEnabled === null ? (w.__WC_AUTH_ENABLED ? true : false) : o.authEnabled === true;
  if (useAuth) {
    const storage = typeof w.__WC_TOKEN_STORAGE === "string" ? w.__WC_TOKEN_STORAGE : "localStorage";
    const key = typeof w.__WC_TOKEN_KEY === "string" ? w.__WC_TOKEN_KEY : "auth_token";
    const hdr = typeof w.__WC_TOKEN_HEADER === "string" ? w.__WC_TOKEN_HEADER : "Authorization";
    const prefix = typeof w.__WC_TOKEN_PREFIX === "string" ? w.__WC_TOKEN_PREFIX : "Bearer ";
    let token: string | null = null;
    try {
      if (storage === "localStorage") token = window.localStorage.getItem(key);
      else if (storage === "sessionStorage") token = window.sessionStorage.getItem(key);
      else if (storage === "memory") {
        const cache = (w.__webcraft_memory_cache ?? {}) as Record<string, string>;
        token = cache[key] != null ? cache[key] : null;
      }
    } catch (e) {
      token = null;
    }
    if (token) headers[hdr] = prefix + token;
  }
  const body: Record<string, unknown> = {};
  if (o.idField && o.row[o.idField] != null) body[o.idField] = o.row[o.idField];
  body[o.field] = o.value;
  return fetch(full, {
    method: o.method || "PUT",
    headers: headers,
    body: JSON.stringify(body),
  })
    .then((res) => res.ok)
    .catch(() => false);
}

/**
 * 发布端双击编辑控制器（静态 bake 模式与接口/虚拟运行时共用同一份实现）。
 * 自包含（引用 isCellEditable/initialEditValue/parseCellEditValue —— 内联点须先声明）。
 * 交互：双击可编辑单元格 → 原位编辑控件（布尔/下拉为 select，其余为 input）→
 * 失焦/回车提交、Esc 取消；提交 = 乐观更新行对象 + 重渲染该单元格 +
 * 同步行搜索文本 + onEdit 回调（派发 cell-edit 事件）+ 可选写回（失败回滚重渲染）。
 * 定位契约：td 带 data-col-index（可见列序号）、tr 带 data-row-index
 * （getRows() 返回与该序号对应的行数组）。
 */

export function attachTableCellEditing(
  root: HTMLElement,
  opts: {
    enabled: boolean;
    getColumns: () => ColumnDef[];
    getRows: () => TableRow[];
    renderCellHtml: (row: TableRow, col: ColumnDef) => string;
    searchTextOf: ((row: TableRow, cols: ColumnDef[]) => string) | null;
    writeBack: ((row: TableRow, field: string, value: unknown, done: (ok: boolean) => void) => void) | null;
    onEdit: ((row: TableRow, field: string, value: unknown) => void) | null;
  },
): void {
  if (!root || !opts || !opts.enabled) return;
  root.addEventListener("dblclick", function (e) {
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return;
    const td = t.closest("td") as HTMLElement | null;
    if (!td || td.getAttribute("data-col-index") == null) return;
    if (td.getAttribute("data-editing") != null) return;
    const tr = td.closest("tr") as HTMLElement | null;
    if (!tr || tr.getAttribute("data-row-index") == null) return;
    const ci = Number(td.getAttribute("data-col-index"));
    const ri = Number(tr.getAttribute("data-row-index"));
    const col = opts.getColumns()[ci];
    const row = opts.getRows()[ri];
    if (!col || !row) return;
    if (!isCellEditable(col)) return;
    const raw = row[col.field];
    const inputStyle = "width:100%;box-sizing:border-box;height:24px;font:inherit;color:inherit;background-color:rgba(255,255,255,0.06);border:1px solid rgba(33,150,243,0.6);border-radius:3px;padding:0 4px;outline:none";
    let finished = false;
    const commit = (inputVal: unknown) => {
      if (finished) return;
      finished = true;
      td.removeAttribute("data-editing");
      const parsed = parseCellEditValue(col, inputVal);
      const prev = row[col.field];
      const same = parsed === prev || String(parsed) === String(prev);
      if (same) {
        td.innerHTML = opts.renderCellHtml(row, col);
        return;
      }
      row[col.field] = parsed;
      const syncSearch = () => {
        if (tr.getAttribute("data-search-text") != null && opts.searchTextOf) {
          tr.setAttribute("data-search-text", opts.searchTextOf(row, opts.getColumns()));
        }
      };
      td.innerHTML = opts.renderCellHtml(row, col);
      syncSearch();
      if (opts.onEdit) opts.onEdit(row, col.field, parsed);
      if (opts.writeBack) {
        opts.writeBack(row, col.field, parsed, (ok) => {
          if (!ok) {
            row[col.field] = prev;
            td.innerHTML = opts.renderCellHtml(row, col);
            syncSearch();
          }
        });
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      td.removeAttribute("data-editing");
      td.innerHTML = opts.renderCellHtml(row, col);
    };
    let editor: HTMLInputElement | HTMLSelectElement;
    if (col.type === "boolean") {
      const sel = document.createElement("select");
      sel.setAttribute("style", inputStyle);
      const labels = ["是", "否"];
      const cur = initialEditValue(raw, col);
      for (let i = 0; i < labels.length; i++) {
        const opt = document.createElement("option");
        opt.value = labels[i];
        opt.textContent = labels[i];
        if (labels[i] === cur) opt.selected = true;
        sel.appendChild(opt);
      }
      editor = sel;
    } else if (col.type === "select") {
      const sel = document.createElement("select");
      sel.setAttribute("style", inputStyle);
      const list = Array.isArray(col.options) ? col.options.map(String) : [];
      const cur2 = raw == null ? "" : String(raw);
      if (cur2 !== "" && list.indexOf(cur2) < 0) list.unshift(cur2);
      for (let j = 0; j < list.length; j++) {
        const opt2 = document.createElement("option");
        opt2.value = list[j];
        opt2.textContent = list[j];
        if (list[j] === cur2) opt2.selected = true;
        sel.appendChild(opt2);
      }
      editor = sel;
    } else {
      const inp = document.createElement("input");
      inp.type = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
      inp.setAttribute("style", inputStyle);
      inp.value = initialEditValue(raw, col);
      editor = inp;
    }
    editor.addEventListener("keydown", (ev) => {
      const ke = ev as KeyboardEvent;
      if (ke.key === "Enter") {
        ke.preventDefault();
        commit(editor.value);
      } else if (ke.key === "Escape") {
        cancel();
      }
    });
    if (editor.tagName === "SELECT") {
      editor.addEventListener("change", () => {
        commit(editor.value);
      });
    }
    editor.addEventListener("blur", () => {
      commit(editor.value);
    });
    td.innerHTML = "";
    td.appendChild(editor);
    try {
      editor.focus();
    } catch (err) {
      /* 聚焦失败不阻断编辑 */
    }
  });
}

/* ══════════════════════════════════════════════
 * 5. 日历（calendar）
 * ══════════════════════════════════════════════ */
