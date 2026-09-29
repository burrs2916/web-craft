import type { ConfigField } from '../../../types/editor';

/**
 * `ConfigFieldRenderer` 的 switch 支持的字段类型清单 —— 必须与 switch 的 case 一一对应。
 *
 * 为什么必须有这份清单：
 * `ConfigField.type` 是联合类型，switch 又有 `default` 兜底，两者之间**没有任何机械约束** ——
 * 往联合里加一个成员却忘了加 case，面板只会安静地少渲染一行，tsc / vitest / vite build 全都不会报错。
 * `group` 就是这样一个漂移样本：声明在联合里、长期没有 case（实测全仓仅 `dataConfigMixin` 用了它）。
 *
 * 下面的 `assertAllFieldTypesHandled` 把这件事变成**编译期错误**：联合里一旦出现清单外的成员，
 * `MissingFieldTypes` 就不再是 `never`，函数返回类型变成 `false`，而函数体 `return true` ——
 * tsc 会直接在这一行报「true 不能赋给 false」，把新成员的名字一并指出来。
 */
export const HANDLED_FIELD_TYPES = [
  "group",
  "button-action",
  "text",
  "number",
  "select",
  "color",
  "toggle",
  "slider",
  "textarea",
  "menu-items",
  "pane-editor",
  "tab-editor",
  "icon-picker",
  "metric-icon-picker",
  "map-editor",
  "json",
  "json-data",
  "table-editor",
  "cascader-options",
  "file",
  "api-field-picker",
  "list-editor",
  "form-fields",
  "global-datasource",
  "mapLibrary",
  "dataSourceInfo",
  "datasource",
  "datafield",
  "dbTable",
  "dbColumn",
  "deviceSelect",
  "action",
  "deviceMultiSelect",
  "keyValueMapping",
  "tagMultiSelect",
] as const;

/** 联合里存在、但上面的清单未覆盖的字段类型（正常应恒为 `never`） */
type MissingFieldTypes = Exclude<NonNullable<ConfigField["type"]>, (typeof HANDLED_FIELD_TYPES)[number]>;

/**
 * 编译期守卫（**无需调用**，导出只是为了让 `noUnusedLocals` 不把它当死代码）：
 * 返回类型里带着 `MissingFieldTypes`，一旦它不为 `never`，返回类型即 `false`，函数体的 `return true` 立刻 tsc 报错。
 *
 * 用 `[T] extends [never]` 而不是 `T extends never`：后者会按 naked 类型参数分发，`never` 会直接分发成 `never`，
 * 那时候连「一切正常」的情况都会报错。
 */
export function assertAllFieldTypesHandled(): [MissingFieldTypes] extends [never] ? true : false {
  return true;
}