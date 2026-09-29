import { componentRegistry, lazy } from "../registryCore";
import { choiceValidationSchema, scaleFitField, hAlignField, vAlignField, toggleAppearanceSchemaFields } from "./shared";

// ─── 开关 ───
// ⚠️ enabled:false：与基础开关（ccat_basic "switch"）合并——表单开关的能力（fieldName/必填/
// 帮助文字/禁用）已并入基础开关，组件面板与表单字段选择器不再展示本组件（getEnabled 过滤）。
// 注册/renderer/codegen 全部保留：旧场景已拖出的 form-switch 照常渲染与提交，零破坏。
export function registerFormSwitch(): void {
  componentRegistry.register({
    type: "form-switch",
    name: "开关",
    icon: "toggle_on",
    description: "开关组件，带标签文字，支持尺寸/标签位置/必填校验；可居中并随框等比缩放",
    category: "ccat_form",
    version: "2.0.0",
    builtIn: true,
    enabled: false,
    defaultSize: { width: 200, height: 40 },
    minSize: { width: 80, height: 28 },
    defaultConfig: {
      fieldName: "",
      label: "启用通知",
      checked: false,
      labelPlacement: "right",
      size: "medium",
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
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/FormSwitchRenderer").then(m => ({ default: m.FormSwitchRenderer }))),
    configSchema: [
      { key: "fieldName", label: "字段名", type: "text", group: "内容", placeholder: "如 notify，留空用标签", help: "提交到接口时的字段 key；开关提交布尔值" },
      { key: "label", label: "标签文字", type: "text", group: "内容" },
      { key: "checked", label: "默认开启", type: "toggle", group: "内容" },
      { key: "labelPlacement", label: "标签位置", type: "select", group: "内容", options: [
        { label: "右侧", value: "right" },
        { label: "左侧", value: "left" },
      ] },
      { key: "size", label: "尺寸", type: "select", group: "内容", options: [
        { label: "中", value: "medium" },
        { label: "小", value: "small" },
      ] },
      { key: "helperText", label: "帮助文字", type: "text", group: "内容",
        help: "开关下方常驻说明文字，校验出错时让位于错误提示" },
      // 与复选框同口径：取值恒为 开/关 枚举，邮箱/手机号/数字/正则永不成立 → 只暴露提示与配色
      { key: "required", label: "必填", type: "toggle", group: "内容",
        help: "开启后必须打开开关才能提交（提交时统一拦截并提示）" },
      ...choiceValidationSchema,
      scaleFitField,
      hAlignField,
      vAlignField,
      { key: "disabled", label: "禁用", type: "toggle", group: "状态" },
      { key: "textColor", label: "文字颜色", type: "color", group: "样式" },
      { key: "accentColor", label: "开启颜色", type: "color", group: "样式", help: "开启时滑块与轨道的颜色" },
      { key: "trackOffColor", label: "关闭轨道色", type: "color", group: "样式" },
      { key: "trackOffOpacity", label: "关闭轨道透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      { key: "trackOnOpacity", label: "开启轨道透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "样式" },
      { key: "thumbOffColor", label: "关闭滑块色", type: "color", group: "样式" },
      { key: "fontSize", label: "字号", type: "number", min: 10, max: 30, group: "样式" },
      ...toggleAppearanceSchemaFields,
    ],
  });
}
