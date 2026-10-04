import type { ComponentCategory, ComponentPluginItem } from "../../types/component";
import { parseIconSource } from "../../utils/iconSource";
import type { ComponentDefinition } from "../../types/editor";
import type { DbCategoryRecord, DbPluginRecord, DbPluginModel } from "./types";

export function dbCategoryToModel(c: DbCategoryRecord): ComponentCategory {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    sortOrder: c.sortOrder ?? c.sort_order ?? 0,
    parentId: c.parentId ?? c.parent_id ?? undefined,
    description: c.description,
    createdAt: c.createdAt ?? c.created_at ?? 0,
    updatedAt: c.updatedAt ?? c.updated_at ?? 0,
  };
}

export function dbRecordToDbPlugin(p: DbPluginRecord): DbPluginModel {
  return {
    id: p.id,
    type: p.pluginType ?? p.plugin_type ?? p.type ?? "",
    category: p.category ?? "",
    enabled: p.enabled === undefined ? true : Boolean(p.enabled),
    builtIn: p.builtIn === undefined ? Boolean(p.built_in) : Boolean(p.builtIn),
    dbIcon: p.icon || undefined,
    name: p.name || undefined,
    description: p.description || undefined,
    author: p.author || undefined,
  };
}

export function mergePluginWithRegistry(
  def: ComponentDefinition,
  dbRecord: DbPluginModel | undefined
): ComponentPluginItem {
  // 只有当数据库的 icon 与注册定义的默认 icon 语义不同时，才视为用户覆盖
  // 使用 parseIconSource 归一化比较：裸字符串 "bar_chart" 和 "material:bar_chart" 等价
  const regIcon = typeof def.icon === "string" ? def.icon : "widgets";
  let iconOverride: string | undefined;
  if (dbRecord?.dbIcon) {
    const regParsed = parseIconSource(regIcon);
    const dbParsed = parseIconSource(dbRecord.dbIcon);
    let isSameIcon = false;
    if (regParsed.kind === dbParsed.kind) {
      if (regParsed.kind === "material" && dbParsed.kind === "material") {
        isSameIcon = regParsed.name === dbParsed.name;
      } else if (regParsed.kind === "thumbnail" && dbParsed.kind === "thumbnail") {
        isSameIcon = true;
      } else if (regParsed.kind === "text" && dbParsed.kind === "text") {
        isSameIcon = regParsed.content === dbParsed.content;
      } else if (regParsed.kind === "color" && dbParsed.kind === "color") {
        isSameIcon = regParsed.color === dbParsed.color;
      }
    }
    iconOverride = isSameIcon ? undefined : dbRecord.dbIcon;
  }
  return {
    id: dbRecord?.id ?? def.type,
    type: def.type,
    // 当数据库 name 等于 pluginType 或匹配脏数据模式（如 "DataV边框1"、"DataV装饰3"）时，
    // 视为"未设置"，fallback 到注册定义名称
    name: (dbRecord?.name && dbRecord.name !== def.type && !/^(DataV边框|DataV装饰)\d+$/.test(dbRecord.name)) ? dbRecord.name : def.name,
    version: def.version,
    description: dbRecord?.description ?? def.description,
    icon: def.icon,
    iconOverride,
    category: dbRecord?.category || def.category,
    builtIn: def.builtIn ?? dbRecord?.builtIn ?? false,
    enabled: dbRecord?.enabled ?? def.enabled !== false,
    author: dbRecord?.author,
    source: dbRecord ? "merged" : "registry",
  };
}