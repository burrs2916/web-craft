/**
 * 列定义模型与解析：ColumnDef 及其归一化、推断、合并。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */

export interface ColumnDef {
  /** 字段键名（接口数据映射、对象数组取值的依据） */
  field: string;
  /** 列标题（空串或缺失时回退到 field） */
  header?: string;
  /** 列数据类型，决定单元格渲染方式与格式化策略；
   *  select 为可编辑下拉类型（候选值见 options），编辑型类型见 EDITABLE_CELL_TYPES */
  type?: "text" | "number" | "date" | "boolean" | "status" | "link" | "image" | "select";
  /** select 类型的候选值（编辑时下拉展示；展示态仍按纯文本渲染） */
  options?: string[];
  /** 列宽：支持 px / % / fr / auto */
  width?: string;
  /** 水平对齐 */
  align?: "left" | "center" | "right";
  /** 格式化模板或规则名（日期格式、数字精度、状态映射键等） */
  format?: string;
  /** 是否允许排序 */
  sortable?: boolean;
  /** 是否显示（用于列显隐切换） */
  visible?: boolean;
  /** 是否允许单元格编辑（仅编辑型类型生效；undefined = 跟随类型默认，false = 明确只读） */
  editable?: boolean;
}

/** 旧版表头 → 列定义的降级转换（保持向后兼容） */

export function headersToColumnDefs(headers: string[]): ColumnDef[] {
  return headers.map((h) => ({ field: h, header: h }));
}

/**
 * 列定义解析：接受多种输入形态，统一归一化为 ColumnDef[]。
 *   - ColumnDef[] 数组                → 直接返回（补全缺失 header）
 *   - JSON 字符串（数组或对象）      → 先 parse 再处理
 *   - 逗号分隔的字段名文本           → 每项生成 { field }
 *   - 逗号分隔的 "field:header" 对   → 解析为 { field, header }
 */

export function parseColumnDefs(input: unknown): ColumnDef[] {
  if (input == null) return [];

  // 已经是数组：对象项按 ColumnDef 全字段解析；字符串项兼容旧式
  // "field" / "field:header" / "field:header:type"（旧版 {columns:["x"],rows:[...]} 的形态）
  if (Array.isArray(input)) {
    const defs = input
      .map((item): ColumnDef | null => {
        if (item == null) return null;
        if (typeof item === "string") {
          const parts = item.split(":").map((s) => s.trim());
          const field = parts[0];
          if (!field) return null;
          return {
            field,
            header: parts[1] || field,
            type: normalizeColumnType(parts[2]),
          };
        }
        if (typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        return {
          field: String(rec.field ?? ""),
          header: rec.header != null ? String(rec.header) : undefined,
          type: normalizeColumnType(rec.type),
          width: rec.width != null ? String(rec.width) : undefined,
          align: normalizeColumnAlign(rec.align),
          format: rec.format != null ? String(rec.format) : undefined,
          sortable: rec.sortable === true,
          visible: rec.visible !== false,
          options: parseColumnOptions(rec.options),
          editable: typeof rec.editable === "boolean" ? rec.editable : undefined,
        };
      })
      .filter((d): d is ColumnDef => d != null && d.field !== "")
      // 补全缺失的 header（用 field 兜底）
      .map((d) => ({ ...d, header: d.header || d.field }));
    return defs;
  }

  // 字符串：先尝试 JSON parse
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseColumnDefs(parsed);
      } catch {
        /* 落到按行/逗号解析 */
      }
    }
    // 逗号分隔的字段名：支持 "field" 或 "field:header" 或 "field:header:type"
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment) => {
        const parts = segment.split(":").map((s) => s.trim());
        const field = parts[0];
        const header = parts[1] || field;
        const type = normalizeColumnType(parts[2]);
        return { field, header, type };
      });
  }

  return [];
}

function normalizeColumnType(v: unknown): ColumnDef["type"] | undefined {
  const s = String(v ?? "").toLowerCase();
  const allowed = new Set<ColumnDef["type"]>(["text", "number", "date", "boolean", "status", "link", "image", "select"]);
  return allowed.has(s as ColumnDef["type"]) ? (s as ColumnDef["type"]) : undefined;
}

/** select 列候选值归一：数组逐项 String；字符串按逗号切分；其余 undefined */

function parseColumnOptions(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    const out = input.map((v) => String(v)).filter((s) => s.trim() !== "");
    return out.length > 0 ? out : undefined;
  }
  if (typeof input === "string") {
    const out = input.split(",").map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

function normalizeColumnAlign(v: unknown): ColumnDef["align"] | undefined {
  const s = String(v ?? "").toLowerCase();
  if (s === "left" || s === "center" || s === "right") return s;
  return undefined;
}

/** 从对象数组的样本数据推断列定义（接口数据首条记录驱动） */

export function inferColumnDefs(sample: Record<string, unknown> | null): ColumnDef[] {
  if (!sample || typeof sample !== "object") return [];
  return Object.keys(sample).map((field) => {
    const val = sample[field];
    let type: ColumnDef["type"] = "text";
    if (typeof val === "boolean") type = "boolean";
    else if (typeof val === "number") type = "number";
    else if (typeof val === "string") {
      // 简单启发式：URL 识别为 link，图片路径识别为 image，ISO 日期识别为 date
      const lower = val.toLowerCase();
      if (/^https?:\/\//.test(val) || /^\//.test(val)) {
        if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(lower)) type = "image";
        else type = "link";
      } else if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        type = "date";
      }
    }
    // 启发式对齐：数字右对齐，其余左对齐
    const align: ColumnDef["align"] = type === "number" ? "right" : "left";
    return { field, header: field, type, align };
  });
}

/**
 * 合并面板列定义与 API 推断的列定义。
 *
 * 策略（panel 优先）：
 *   - API 有、面板也有同一 field → 面板的 header / type / align / width / format /
 *     sortable / visible 覆盖 API 推断，保留 API 的 field
 *   - API 有、面板没有 → 保留 API 推断（新增字段自动出现）
 *   - 面板有、API 没有 → 保留面板定义（可能显示空列，让用户有机会配置即将上线的字段）
 *
 * 这样用户可以在面板上微调列标题、宽度、对齐、显隐等，而不必手动列出所有字段。
 */

export function mergeColumnDefs(apiColumns: ColumnDef[], panelColumns: ColumnDef[]): ColumnDef[] {
  const panelMap = new Map(panelColumns.map((c) => [c.field, c]));
  const apiFields = new Set(apiColumns.map((c) => c.field));

  // API 列用面板属性覆盖
  const merged = apiColumns.map((apiCol) => {
    const panelCol = panelMap.get(apiCol.field);
    if (!panelCol) return apiCol;
    return {
      ...apiCol,
      header: panelCol.header ?? apiCol.header,
      type: panelCol.type ?? apiCol.type,
      align: panelCol.align ?? apiCol.align,
      width: panelCol.width ?? apiCol.width,
      format: panelCol.format ?? apiCol.format,
      sortable: panelCol.sortable ?? apiCol.sortable,
      visible: panelCol.visible !== undefined ? panelCol.visible : (apiCol.visible ?? true),
      options: panelCol.options ?? apiCol.options,
      editable: panelCol.editable ?? apiCol.editable,
    };
  });

  // 面板有但 API 没有的列追加到末尾
  const extraPanelColumns = panelColumns.filter((c) => !apiFields.has(c.field));
  return [...merged, ...extraPanelColumns];
}

/** 数据行：旧版是 string[][]，新版支持对象数组 */

export function visibleColumnDefs(defs: ColumnDef[]): ColumnDef[] {
  return defs.filter((c) => c.visible !== false);
}

/** 数据量上限保护：防止超大输入导致内存/性能问题 */
