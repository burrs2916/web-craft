/**
 * 描述列表：默认项、解析、归一与补齐。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */
import { posInt } from './util';

export interface DescriptionItem {
  label: string;
  value: string;
}

/** 未配置时的占位内容（两端同一份，勿在渲染器/codegen 里再写一份） */

export const DEFAULT_DESCRIPTION_ITEMS: DescriptionItem[] = [
  { label: "产品名称", value: "WebCraft 编辑器" },
  { label: "版本", value: "v0.7.0" },
  { label: "技术栈", value: "React + Tauri" },
  { label: "许可", value: "MIT" },
];

/**
 * 静态配置文本 → 描述项。支持三种写法（与面板 help 一致）：
 *   - JSON 数组 `[{"label":"a","value":"b"}]`
 *   - 每行 `标签: 值`（中英文冒号皆可）
 *   - 每行仅标签
 * 无有效配置时返回空数组（由调用方决定是否落默认值）。
 */

export function parseDescriptionItems(input: unknown): DescriptionItem[] {
  if (Array.isArray(input)) {
    return normalizeDescriptionPayload(input, (i) => `字段 ${i + 1}`);
  }
  if (typeof input !== "string") return [];

  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeDescriptionPayload(parsed, (i) => `字段 ${i + 1}`);
    } catch {
      /* 落到按行解析 */
    }
  }

  const lines = trimmed.split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    const half = line.indexOf(":");
    const full = line.indexOf("：");
    const idx = half > 0 ? half : full;
    if (idx > 0) {
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    return { label: line.trim(), value: "" };
  });
}

/**
 * 接口/静态数据 → 描述项。
 *   - 数组 → 每项取 label|name|key + value|text
 *   - 对象 → 逐字段展开为 `字段名 / 值`（嵌套对象跳过）
 * `fallbackLabel` 让两端对"数组里缺 label 的项"使用同一命名规则。
 */

export function normalizeDescriptionPayload(
  data: unknown,
  fallbackLabel?: (index: number) => string,
): DescriptionItem[] {
  const fb = fallbackLabel ?? (() => "");
  if (Array.isArray(data)) {
    const out: DescriptionItem[] = [];
    data.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const rec = item as Record<string, unknown>;
      const label = rec.label ?? rec.name ?? rec.key ?? fb(i);
      const value = rec.value ?? rec.text ?? "";
      const row = { label: String(label ?? ""), value: String(value ?? "") };
      if (row.label || row.value) out.push(row);
    });
    return out;
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .filter(([k]) => k.trim() !== "")
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([k, v]) => ({ label: k, value: String(v ?? "") }));
  }
  return [];
}

/**
 * 描述列表数据的最终取值口径。
 * 「接口模式且已拿到数据」优先；否则静态数据；再否则内容组 items；全空则落默认占位。
 */

export function resolveDescriptionItems(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): DescriptionItem[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";

  if (isApi) {
    const fromApi = normalizeDescriptionPayload(fetched);
    if (fromApi.length > 0) return fromApi;
  } else if (config.staticData != null && config.staticData !== "") {
    let parsed: unknown = config.staticData;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* 非 JSON，按文本解析 */
      }
    }
    const fromStatic =
      typeof parsed === "string"
        ? parseDescriptionItems(parsed)
        : normalizeDescriptionPayload(parsed ?? undefined);
    if (fromStatic.length > 0) return fromStatic;
  }

  const fromItems = parseDescriptionItems(config.items);
  if (fromItems.length > 0) return fromItems;
  return isApi ? [] : DEFAULT_DESCRIPTION_ITEMS;
}

/** 水平布局下补齐到"列数 × 2"的整数倍，保证网格完整（两端同一份） */

export function padDescriptionItems(items: DescriptionItem[], columns: number): DescriptionItem[] {
  const cols = posInt(columns, 1);
  const padded = [...items];
  while (padded.length % cols !== 0) padded.push({ label: "", value: "" });
  return padded;
}

/* ══════════════════════════════════════════════
 * 3. 树形控件（tree）
 * ══════════════════════════════════════════════ */
