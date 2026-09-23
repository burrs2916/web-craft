/**
 * 面包屑数据映射工具（零依赖纯函数）
 *
 * 编辑态渲染器（BreadcrumbRenderer）与发布态代码生成（codegen/components/breadcrumb.ts）
 * 共用同一套解析逻辑：从接口响应/静态数据解包出面包屑项数组，并对齐两端行为，
 * 保证"编辑器所见即发布所得"。
 */

export interface BreadcrumbItem {
  label: string;
  href: string;
  icon?: string;
  newTab?: boolean;
}

/**
 * 响应自定义字段映射：接口里的字段不一定叫 label/href/icon/newTab，
 * 用户可在属性栏指定真实字段名（支持点路径，如 nested.title）。
 */
export interface BreadcrumbMapping {
  labelField?: string;
  hrefField?: string;
  iconField?: string;
  newTabField?: string;
}

export const DEFAULT_CRUMB_ITEMS: BreadcrumbItem[] = [
  { label: "首页", href: "", icon: "material:home" },
  { label: "分类", href: "", icon: "material:folder" },
  { label: "当前页", href: "", icon: "material:article" },
];

/** 取对象字段，支持点路径 */
function pick(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** 单个原始项 -> 标准 BreadcrumbItem（应用字段映射，带默认别名兜底） */
function mapItem(item: unknown, mapping: BreadcrumbMapping, index: number): BreadcrumbItem {
  if (item == null || typeof item !== "object") {
    return { label: `面包屑 ${index + 1}`, href: "" };
  }
  const obj = item as Record<string, unknown>;
  const label =
    pick(obj, mapping.labelField ?? "") ?? obj.label ?? obj.text ?? obj.title ?? obj.name ?? `面包屑 ${index + 1}`;
  const href = pick(obj, mapping.hrefField ?? "") ?? obj.href ?? obj.link ?? obj.url ?? obj.path ?? "";
  const icon = pick(obj, mapping.iconField ?? "") ?? obj.icon ?? obj.iconName ?? undefined;
  const newTab = mapping.newTabField ? pick(obj, mapping.newTabField) === true : obj.newTab === true;
  return {
    label: String(label),
    href: String(href),
    icon: icon != null ? String(icon) : undefined,
    newTab,
  };
}

function parseArray(input: unknown[], mapping: BreadcrumbMapping): BreadcrumbItem[] {
  return input.map((item, i) => mapItem(item, mapping, i));
}

function parseJsonOrLines(input: string, mapping: BreadcrumbMapping): BreadcrumbItem[] {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseArray(parsed, mapping);
    } catch {
      // fall through
    }
  }
  const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length > 0) return lines.map((label) => ({ label, href: "" }));
  return [];
}

/**
 * 从静态数据 / 接口响应中解包出面包屑项数组。
 * 支持：数组 / JSON 字符串 / 每行一个的面包屑文本 / 对象（内含常见数组键）。
 * 返回渲染与发布共用的标准项结构；无法解析时返回空数组（不含默认项，由调用方决定兜底）。
 */
export function parseBreadcrumbItems(input: unknown, mapping: BreadcrumbMapping = {}): BreadcrumbItem[] {
  if (input == null) return [];

  // 数组
  if (Array.isArray(input)) return parseArray(input, mapping);

  // 字符串：JSON 数组 或 每行一个
  if (typeof input === "string") return parseJsonOrLines(input, mapping);

  // 对象：尝试常见数组键（不再遍历任意键，避免取错字段）
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["items", "list", "breadcrumbs", "crumbs", "data"]) {
      const v = obj[key];
      if (Array.isArray(v)) return parseArray(v, mapping);
    }
    // 纯对象单条（如 {label, href}）当作一条
    if (obj.label != null || obj.text != null || obj.title != null) {
      return [mapItem(obj, mapping, 0)];
    }
  }
  return [];
}