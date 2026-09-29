import { componentRegistry, lazy } from "../registryCore";
import { RATE_ICON_OPTIONS, RATE_SIZE_OPTIONS } from "../data/rateStyle";
import { hAlignField, scaleFitField, vAlignField, validationSchema } from "./shared";

// ─── 评分 ───
export function registerFormRate(): void {
  componentRegistry.register({
    type: "form-rate",
    name: "评分",
    icon: "star_rate",
    description: "评分组件，支持星/心/赞图标、半星、只读、文字提示",
    category: "ccat_form",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 220, height: 40 },
    minSize: { width: 120, height: 28 },
    defaultConfig: {
      fieldName: "",
      label: "",
      labelPlacement: "none",
      value: 3,
      max: 5,
      allowHalf: false,
      required: false,
      helperText: "",
      icon: "star",
      color: "#FF9800",
      inactiveColor: "rgba(148,163,184,0.45)",
      size: "medium",
      customSize: 0,
      gap: 4,
      // 「居中 + 随拖动框等比缩放」：与表单组其他成员同一套三层骨架（默认居中，见 STAGE_ALIGN_DEFAULT）
      scaleFit: true,
      align: "center",
      vAlign: "center",
      showText: false,
      fontSize: 13,
      textColor: "#94A3B8",
      bgColor: "",
      paddingX: 0,
      paddingY: 0,
      borderRadius: 0,
      opacity: 1,
      disabled: false,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("../renderers/RateRenderer").then(m => ({ default: m.RateRenderer }))),
    configSchema: [
      { key: "fieldName", label: "字段名", type: "text", group: "内容", placeholder: "如 score，留空用标签", help: "提交到接口时的字段 key" },
      { key: "label", label: "标签", type: "text", group: "内容", help: "仅当「标签位置」不为「无」时显示；也用于推导表单字段名与无障碍名称" },
      // 标签位置不暴露 → `label` 永远不显示（默认 none 且面板改不动）← P2-6/P2-1
      { key: "labelPlacement", label: "标签位置", type: "select", group: "内容", options: [
        { label: "无", value: "none" },
        { label: "悬浮框内", value: "inside" },
        { label: "上方", value: "top" },
      ] },
      { key: "value", label: "默认分值", type: "number", min: 0, max: 10, group: "内容",
        help: "0 = 未评分（必填校验视为未填）；超过「最大星数」时按最大星数计" },
      { key: "max", label: "最大星数", type: "number", min: 1, max: 10, group: "内容" },
      { key: "allowHalf", label: "允许半星", type: "toggle", group: "内容",
        help: "开启后：鼠标点星的左半格取半星，方向键按 0.5 步进" },
      // 选项与口袋表同源（RATE_ICON_OPTIONS / RATE_SIZE_OPTIONS），面板不再各写一份字面量
      { key: "icon", label: "图标", type: "select", group: "内容", options: RATE_ICON_OPTIONS },
      { key: "showText", label: "显示文字", type: "toggle", group: "内容",
        help: "开启后在星条右侧显示分值文案（如「满意」）；关闭时下方「文字字号/文字颜色」不生效" },
      { key: "required", label: "必填", type: "toggle", group: "内容", help: "「必填」语义为必须给出评分（0 分视为未评分）" },
      { key: "helperText", label: "帮助文字", type: "text", group: "内容", help: "控件下方常驻说明文字，校验出错时让位" },
      ...validationSchema,
      { key: "color", label: "激活颜色", type: "color", group: "样式" },
      { key: "inactiveColor", label: "未激活颜色", type: "color", group: "样式" },
      { key: "size", label: "尺寸", type: "select", group: "样式", options: RATE_SIZE_OPTIONS },
      { key: "customSize", label: "自定义大小", type: "number", min: 0, max: 60, group: "样式", help: "0 表示按尺寸档位" },
      { key: "gap", label: "间距", type: "number", min: 0, max: 20, group: "样式" },
      // 「显示文字」未开时文字根本不渲染，字号/颜色改不动画面 → 与 showText 联动显隐 ← P2-2
      { key: "fontSize", label: "文字字号", type: "number", min: 10, max: 24, group: "样式",
        hidden: (c) => !c.showText, help: "分值文案的字号；开启「显示文字」后生效" },
      { key: "textColor", label: "文字颜色", type: "color", group: "样式",
        hidden: (c) => !c.showText, help: "分值文案的颜色；开启「显示文字」后生效" },
      // ── 居中 + 随拖动框等比缩放（与表单组其他成员同一份面板片段，勿另写字面量） ──
      scaleFitField,
      { ...hAlignField, help: "星条（自然尺寸）在拖动框内的水平位置" },
      vAlignField,
      // ── 外观：整条星条的底衬（随内容一起等比缩放，挂缩放内层） ──
      { key: "bgColor", label: "背景色", type: "color", group: "外观", help: "留空为透明" },
      { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 60, group: "外观",
        hidden: (c) => !c.bgColor, help: "有底色时给出左右留白；0 表示不额外留白" },
      { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 60, group: "外观",
        hidden: (c) => !c.bgColor, help: "有底色时给出上下留白；0 表示不额外留白" },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 4, group: "外观",
        hidden: (c) => !c.bgColor, help: "档位 ×10 px；4 约为胶囊形" },
      { key: "opacity", label: "不透明度", type: "number", min: 0, max: 1, step: 0.05, group: "外观",
        help: "0 完全透明、1 完全不透明；只读态在此基础上再压暗一半" },
      { key: "disabled", label: "只读", type: "toggle", group: "状态" },
    ],
  });
}
