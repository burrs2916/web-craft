import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";
import { parseOptionItems, diagnoseOptionItems, diagnoseSelectedIndex } from "../data/optionItems";
import { choiceValidationSchema, scaleFitField, hAlignField, vAlignField, choiceApiMappingFields } from "./shared";

// ─── 单选组 ───
export function registerFormRadio(): void {
  componentRegistry.register({
    type: "form-radio",
    name: "单选组",
    icon: "radio_button_checked",
    description: "单选按钮组，支持多个选项；静态/接口两种选项来源（含认证三态）",
    category: "ccat_form",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 280, height: 100 },
    minSize: { width: 120, height: 60 },
    defaultConfig: {
      fieldName: "",
      label: "性别",
      items: [
        { label: "男", value: "男" },
        { label: "女", value: "女" },
      ],
      selectedIndex: 0,
      direction: "vertical",
      labelPlacement: "top",
      size: "small",
      helperText: "",
      required: false,
      validateMessage: "",
      errorColor: "#f44336",
      disabled: false,
      textColor: "#333333",
      accentColor: "#1976d2",
      fontSize: 14,
      scaleFit: true,
      align: "center",
      vAlign: "center",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/FormRadioRenderer").then(m => ({ default: m.FormRadioRenderer }))),
    configSchema: [
      { key: "fieldName", label: "字段名", type: "text", group: "内容", placeholder: "如 gender，留空用组标签", help: "提交到接口时的字段 key" },
      { key: "label", label: "组标签", type: "text", group: "内容" },
      { key: "items", label: "选项列表", type: "list-editor", group: "内容",
        itemLabelKey: "label", addItemLabel: "添加选项",
        hidden: (c) => (c.dataMode ?? "static") === "api",
        help: "逐条添加选项：显示名、提交值、图标；切换「接口读取」时改由接口响应驱动",
        diagnose: (c) => diagnoseOptionItems(c.items ?? c.options),
        // 旧 options 文本（每行一个选项）自动迁移进面板，避免"面板无选项、画布仍有旧数据"
        legacyKey: "options",
        legacyParse: (raw) => parseOptionItems(raw),
        itemFields: [
          { key: "label", label: "显示名", type: "text", placeholder: "如 男" },
          { key: "value", label: "提交值", type: "text", placeholder: "如 male；留空则同显示名" },
          { key: "icon", label: "图标", type: "icon-picker" },
        ] },
      { key: "selectedIndex", label: "默认选中索引", type: "number", min: 0, max: 50, group: "内容",
        help: "对应选项列表中的第 N 项（0 起）；超出范围则不预选；接口模式下恒取第 1 项",
        diagnose: (c) => diagnoseSelectedIndex(c, parseOptionItems(c.items ?? c.options), "radio") },
      { key: "direction", label: "排列方向", type: "select", group: "内容", options: [
        { label: "垂直", value: "vertical" },
        { label: "水平", value: "horizontal" },
      ] },
      { key: "labelPlacement", label: "标签位置", type: "select", group: "内容", options: [
        { label: "上方", value: "top" },
        { label: "左侧", value: "left" },
      ] },
      { key: "helperText", label: "帮助文字", type: "text", group: "内容",
        help: "选项组下方常驻说明文字，校验出错时让位于错误提示" },
      { key: "required", label: "必填", type: "toggle", group: "内容" },
      ...dataSourceSchemaFieldsNoStatic,
      ...choiceApiMappingFields,
      ...choiceValidationSchema,
      scaleFitField,
      hAlignField,
      vAlignField,
      { key: "disabled", label: "禁用", type: "toggle", group: "状态" },
      { key: "size", label: "尺寸", type: "select", group: "样式", options: [
        { label: "小", value: "small" },
        { label: "中", value: "medium" },
      ] },
      { key: "textColor", label: "文字颜色", type: "color", group: "样式" },
      { key: "accentColor", label: "强调色", type: "color", group: "样式" },
      { key: "fontSize", label: "字号", type: "number", min: 10, max: 30, group: "样式" },
    ],
  });
}
