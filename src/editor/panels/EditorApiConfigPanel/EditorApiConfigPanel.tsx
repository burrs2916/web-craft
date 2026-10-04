import Box from "@mui/material/Box";
import { SummaryBar } from "./SummaryBar";
import { ComponentApiSection } from "./ComponentApiSection";
import { BasicConfigSection } from "./BasicConfigSection";
import { LoadingFeedbackSection } from "./LoadingFeedbackSection";
import { DefaultHeadersSection } from "./DefaultHeadersSection";
import { UrlRulesSection } from "./UrlRulesSection";

/**
 * 全局 API 配置面板 — 场景级统一数据接入层的配置入口
 *
 * 通过 editorStore 的 apiConfig / setApiConfig 读写以下字段：
 *   - baseUrl:        API 基地址，组件的相对 apiUrl / apiPath 与之拼接（完整 URL 直连不参与拼接）
 *   - authEnabled:    全局认证开关，组件 authEnabled 为 null 时跟随此值
 *   - defaultHeaders: 全局默认请求头，所有 API 请求自动携带（key 为空的行忽略）
 *   - timeout:        请求超时（ms），默认 10000
 *
 * 面板按区块拆分为独立组件，各区块自行订阅 store；本容器仅负责布局与组装。
 */
interface EditorApiConfigPanelProps {
  /** 当前选中组件 id；传给组件级接口面板进行可编辑（需组件存在且匹配） */
  componentId?: string;
  /** 从 API 面板跳转到事件 Tab 并定位指定事件绑定的回调（由 SceneEditor 提供） */
  onNavigateToEvent?: (bindingId: string) => void;
}

export function EditorApiConfigPanel({ componentId, onNavigateToEvent }: EditorApiConfigPanelProps) {
  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* ── 摘要条 ── */}
      <SummaryBar />

      {/* ── 滚动内容 ── */}
      <Box sx={{
        flex: 1, overflow: "auto", px: 1.5, py: 1.5,
        display: "flex", flexDirection: "column", gap: 1,
        "&::-webkit-scrollbar": { width: 6 },
        "&::-webkit-scrollbar-thumb": { borderRadius: 3, backgroundColor: "action.disabled" },
        "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "action.disabledOpacity" },
      }}>
        {/* === 当前组件 · 接口：可编辑视口 === */}
        <ComponentApiSection componentId={componentId} onNavigateToEvent={onNavigateToEvent} />

        {/* === 基础配置 === */}
        <BasicConfigSection />

        {/* === 自动加载反馈 === */}
        <LoadingFeedbackSection />

        {/* === 默认请求头 === */}
        <DefaultHeadersSection />

        {/* === URL 拼接规则说明 === */}
        <UrlRulesSection />
      </Box>
    </Box>
  );
}