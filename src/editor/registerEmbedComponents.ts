import { componentRegistry, lazy } from "./registryCore";
import { dataSourceSchemaFieldsNoStatic } from "./dataSourceFields";

/**
 * 注册外部嵌入组件（外部嵌入组件分类 ccat_embed）。
 *
 * 当前唯一成员：iframe（网页嵌入）。
 * 从媒体组（ccat_media）拆出，理由：iframe 承载的是网页/第三方内容容器，
 * 而非供直接消费的原生多媒体（图片/视频/音频），职责边界不同。
 */
export function registerEmbedComponents(): void {
  // ─── 网页嵌入（iframe，外部嵌入组） ───
  componentRegistry.register({
    type: "iframe",
    name: "网页嵌入",
    icon: "web",
    description: "网页嵌入组件：嵌入外部网页/表单/地图/在线视频，支持全屏、沙箱策略、懒加载与接口动态地址",
    category: "ccat_embed",
    version: "1.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 480, height: 320 },
    minSize: { width: 120, height: 80 },
    defaultConfig: {
      // —— 内容 ——
      src: "",
      title: "",
      ariaLabel: "",
      caption: "",
      emptyText: "未设置嵌入地址",
      // —— 链接 ——
      link: "",
      linkTarget: "_self",
      // —— 嵌入 ——
      allowFullscreen: false,
      loading: "lazy",
      referrerPolicy: "no-referrer-when-downgrade",
      sandbox: "",
      allow: "",
      autoHeight: false,
      loadTimeoutSec: 0,
      // —— 数据源（接口动态取嵌入地址） ——
      dataSourceId: "",
      dataMode: "static",
      apiUrl: "",
      apiMethod: "GET",
      apiInterval: 0,
      apiDataPath: "",
      authEnabled: false,
      apiSrcField: "",
      // —— 样式 ——
      bgColor: "transparent",
      borderWidth: 0,
      borderColor: "#d0d0d8",
      borderStyle: "solid",
      borderRadius: 0,
      boxShadow: "",
      opacity: 1,
      hoverScale: 1,
      hoverDuration: 0.3,
      captionColor: "rgba(255,255,255,0.92)",
      captionBg: "linear-gradient(transparent, rgba(0,0,0,0.62))",
      captionFontSize: 13,
      emptyBg: "",
      emptyColor: "",
      // —— P3-2 响应式缩放：容器级 transform:scale() 自适应嵌入页宽度 ——
      responsiveScale: false,
    },
    renderer: lazy(() => import("./renderers/IframeRenderer").then(m => ({ default: m.IframeRenderer }))),
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    configSchema: [
      // ─── 内容 ───
      { key: "src", label: "嵌入地址", type: "text", group: "内容", placeholder: "如 https://example.com/form 或 /embed",
        hidden: (c) => (c.dataMode ?? "static") === "api",
        help: "支持完整地址/相对路径；接口模式下由数据源提供" },
      { key: "title", label: "无障碍标题", type: "text", group: "内容", placeholder: "如 产品介绍表单",
        help: "读屏软件朗读的嵌入内容说明；留空回退「嵌入式内容」" },
      { key: "ariaLabel", label: "ARIA 标签", type: "text", group: "内容", placeholder: "如 用户报名表单区域",
        help: "辅助技术（读屏软件）朗读的精确标签；留空回退「无障碍标题」" },
      { key: "caption", label: "题注", type: "text", group: "内容", placeholder: "留空不显示",
        help: "叠在嵌入内容底部的说明文字" },
      { key: "emptyText", label: "空态提示", type: "text", group: "内容", help: "未设置嵌入地址时显示" },
      // ─── 链接 ───
      { key: "link", label: "跳转链接", type: "text", group: "链接", placeholder: "如 /product 或 https://…",
        help: "填写后 iframe 组件整体变为可点击链接" },
      { key: "linkTarget", label: "打开方式", type: "select", group: "链接", hidden: (c) => !String(c.link ?? "").trim(), options: [
        { label: "当前窗口", value: "_self" },
        { label: "新窗口", value: "_blank" },
      ] },
      // ─── 嵌入 ───
      { key: "allowFullscreen", label: "允许全屏", type: "toggle", group: "嵌入",
        help: "嵌入内容可进入全屏（在线视频/地图/PPT 等需要）" },
      { key: "loading", label: "加载方式", type: "select", group: "嵌入", options: [
        { label: "进入视口加载（懒加载）", value: "lazy" },
        { label: "立即加载", value: "eager" },
      ], help: "懒加载减少首屏负担；需要立即生效的嵌入（如问卷统计）选立即加载" },
      { key: "sandbox", label: "沙箱策略", type: "select", group: "嵌入", options: [
        { label: "🔓 开放（无限制）", value: "" },
        { label: "🔒 锁定（脚本+同源）", value: "allow-scripts allow-same-origin" },
        { label: "⚠️ 交互（脚本+同源+表单+弹窗）", value: "allow-scripts allow-same-origin allow-forms allow-popups" },
      ], help: "限制嵌入内容的权限等级：🔓 开放=无限制（仅信任网站），🔒 锁定=仅脚本+同源，⚠️ 交互=额外开放表单和弹窗" },
      { key: "allow", label: "功能权限", type: "text", group: "嵌入", placeholder: "如 clipboard-write; camera; microphone",
        help: "透传 Feature Policy：允许嵌入页使用的能力（分号分隔）；留空不加限制" },
      { key: "autoHeight", label: "自适应高度", type: "toggle", group: "嵌入",
        help: "开启后嵌入页按内容实际高度自动撑开，不再裁切在画布固定高度内。同源场景自动测量内容高度；跨域场景需内容页向父页发送 postMessage({ type: 'auto-height', height }) 回传。编辑画布内不生效（编辑态沙箱收窄，无法读取同源文档高度），预览态与发布端生效" },
      { key: "responsiveScale", label: "响应式缩放", type: "toggle", group: "嵌入",
        help: "开启后容器级 transform:scale() 按画布实际宽度自适应缩放嵌入内容，防止固定宽度嵌入页在窄容器内出现横向滚动条。打印态自动关闭以保正文清晰" },
      { key: "loadTimeoutSec", label: "加载超时", type: "number", min: 0, max: 120, group: "嵌入",
        help: "秒数；超过该时长仍未加载完成则显示「加载超时」提示（跨域嵌入没有可用的失败事件，定时器是唯一可靠兜底）。0 = 关闭，保持一直显示加载中" },
      { key: "referrerPolicy", label: "来源标识", type: "select", group: "嵌入", options: [
        { label: "同源完整引用（默认）", value: "no-referrer-when-downgrade" },
        { label: "不发送来源信息", value: "no-referrer" },
        { label: "仅发送来源站点", value: "origin" },
      ], help: "嵌入请求携带的来源信息；涉及隐私或防盗链时可选不发送" },
      // ─── 数据源（接口动态取嵌入地址，与图片/视频/音频同构） ───
      ...dataSourceSchemaFieldsNoStatic,
      { key: "apiSrcField", label: "嵌入地址字段", type: "text", group: "数据源", placeholder: "如 data.url",
        hidden: (c) => Boolean(c.dataSourceId) || (c.dataMode ?? "static") !== "api",
        help: "从响应中取嵌入地址的字段（支持 data.x.y 点路径）；留空依次尝试 url → src → iframe → embed → path" },
      // ─── 样式 ——
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, group: "样式",
        help: "面板值 × 主题圆角基数（10）——与表单/媒体族全组同一口径" },
      { key: "bgColor", label: "背景色", type: "color", group: "样式", help: "嵌入内容未铺满时露出的底色" },
      { key: "borderWidth", label: "边框粗细", type: "number", min: 0, max: 20, group: "样式" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "样式", hidden: (c) => !(Number(c.borderWidth) > 0) },
      { key: "borderStyle", label: "边框样式", type: "select", group: "样式", hidden: (c) => !(Number(c.borderWidth) > 0), options: [
        { label: "实线", value: "solid" },
        { label: "虚线", value: "dashed" },
        { label: "点线", value: "dotted" },
      ] },
      { key: "boxShadow", label: "阴影", type: "text", group: "样式", placeholder: "如 0 8px 24px rgba(0,0,0,.25)",
        help: "完整 CSS box-shadow 值；留空无阴影" },
      { key: "opacity", label: "不透明度", type: "number", min: 0, max: 1, step: 0.05, group: "样式" },
      { key: "hoverScale", label: "悬浮放大倍数", type: "number", min: 1, max: 2, step: 0.01, group: "样式",
        help: "1 表示不放大；1.05 表示指针悬浮时放大 5%" },
      { key: "hoverDuration", label: "悬浮动画时长", type: "number", min: 0, max: 3, step: 0.05, group: "样式",
        hidden: (c) => !(Number(c.hoverScale) > 1), help: "秒" },
      { key: "captionFontSize", label: "题注字号", type: "number", min: 8, max: 32, group: "样式", hidden: (c) => !String(c.caption ?? "").trim() },
      { key: "captionColor", label: "题注文字色", type: "color", group: "样式", hidden: (c) => !String(c.caption ?? "").trim() },
      { key: "captionBg", label: "题注背景", type: "text", group: "样式", hidden: (c) => !String(c.caption ?? "").trim(),
        help: "任意 CSS background 值（支持渐变）；留空为纯色兜底" },
      { key: "emptyBg", label: "空态底色", type: "color", group: "样式" },
      { key: "emptyColor", label: "空态文字色", type: "color", group: "样式" },
    ],
  });
}
