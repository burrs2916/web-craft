import { componentRegistry, lazy } from "../registryCore";
import { dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";
import { isLocalApiHiddenLocal, scaleFitField, hAlignField, vAlignField } from "./shared";

// ─── 标签 ───
export function registerFormLabel(): void {
  componentRegistry.register({
    type: "form-label",
    name: "标签",
    icon: "label",
    description: "表单标签文字，支持必填标记；可居中摆放并随拖动框等比缩放",
    category: "ccat_form",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 32, height: 22 },
    minSize: { width: 20, height: 18 },
    defaultConfig: {
      text: "标签",
      suffix: "",
      required: false,
      textColor: "#333333",
      fontSize: 14,
      fontWeight: "normal",
      textDecoration: "none",
      lineHeight: 1.4375,
      letterSpacing: 0,
      align: "center",
      vAlign: "center",
      scaleFit: true,
      errorColor: "#f44336",
      bgColor: "",
      paddingX: 0,
      paddingY: 0,
      borderRadius: 0,
      opacity: 1,
      // 动态文案（认证 / 非认证同源）：与图片/音频/视频同一条取数骨架
      //
      // `authEnabled: false`：本组件默认「不注入 Token」（公开文案接口的常见形态）。
      // 注意它**不是**为绕开面板表达缺口而写的兜底 —— 现在本字段是真正的三态 select
      // （跟随站点全局 / 强制注入 / 不注入，见 data/authMode.ts），面板如实渲染这个 false；
      // 若哪天真要走「跟随全局」，把这里改成 null 即可，两端语义一致。
      dataSourceId: "",
      dataMode: "static",
      apiUrl: "",
      apiMethod: "GET",
      apiInterval: 0,
      apiDataPath: "",
      authEnabled: false,
      apiTextField: "",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("../renderers/FormLabelRenderer").then(m => ({ default: m.FormLabelRenderer }))),
    configSchema: [
      { key: "text", label: "文字", type: "text", group: "内容", placeholder: "留空则不显示文字",
        help: "接口模式下作为数据到达前的占位文案" },
      { key: "suffix", label: "后缀文字", type: "text", group: "内容", placeholder: "如 ：",
        help: "排在必填星号之前；留空不显示" },
      { key: "required", label: "必填标记", type: "toggle", group: "内容", help: "在文字后追加星号 *" },
      // ── 动态文案（与媒体组/表格组同一条取数骨架，支持认证与非认证两种接入） ──
      ...dataSourceSchemaFieldsNoStatic,
      { key: "apiTextField", label: "文字取值字段", type: "text", group: "数据源", hidden: isLocalApiHiddenLocal,
        placeholder: "如 data.name", help: "从接口响应中取该字段作为标签文字；留空依次回退 text → label → name → value → title" },
      scaleFitField,
      // 标签是纯文字，"文字对齐"比通用的"水平对齐"更贴合（选项仍取自同一份受控枚举）
      { ...hAlignField, label: "文字对齐", help: "文字（自然尺寸）在拖动框内的水平位置" },
      vAlignField,
      { key: "textColor", label: "文字颜色", type: "color", group: "样式" },
      { key: "fontSize", label: "字号", type: "number", min: 10, max: 30, group: "样式" },
      { key: "fontWeight", label: "文字字重", type: "select", group: "样式", options: [
        { label: "常规", value: "normal" },
        { label: "中等", value: "500" },
        { label: "加粗", value: "bold" },
      ] },
      { key: "lineHeight", label: "行高", type: "number", min: 1, max: 3, step: 0.05, group: "样式",
        help: "倍数；默认 1.4375（对齐 MUI FormLabel 约定与发布端）" },
      { key: "letterSpacing", label: "字间距", type: "number", min: 0, max: 10, step: 0.5, group: "样式",
        help: "单位 px；0 表示不调整间距" },
      { key: "textDecoration", label: "文字装饰", type: "select", group: "样式", options: [
        { label: "无", value: "none" },
        { label: "下划线", value: "underline" },
        { label: "删除线", value: "line-through" },
      ] },
      { key: "errorColor", label: "必填星号色", type: "color", group: "样式",
        hidden: (c) => c.required !== true, help: "仅开启必填标记时生效" },
      // ── 外观：让标签能当「小节标题 / 胶囊标签」用（随内容一起等比缩放） ──
      { key: "bgColor", label: "背景色", type: "color", group: "外观", help: "留空为透明" },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 60, group: "外观",
        hidden: (c) => !c.bgColor, help: "有底色时给出左右留白；0 表示不额外留白" },
      { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 60, group: "外观",
        hidden: (c) => !c.bgColor, help: "有底色时给出上下留白；0 表示不额外留白" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 4, group: "外观",
        hidden: (c) => !c.bgColor, help: "档位 ×10 px；4 约为胶囊形" },
      { key: "opacity", label: "不透明度", type: "number", min: 0, max: 1, step: 0.05, group: "外观",
        help: "0 完全透明、1 完全不透明" },
    ],
  });
}
