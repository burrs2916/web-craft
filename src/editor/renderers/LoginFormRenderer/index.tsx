import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../../types/editor";
import { useWebsiteAuthStore, RESPONSE_MAPPING_TEMPLATES } from "../../../store/websiteAuthStore";
import { AUTH_PRESETS, getAllAuthPresets } from "../../registerAuthComponents";
import { extractLoginFormConfig, parseSuccessCodes } from "./config";
import { SHADOW_MAP } from "./shared";
import { useLoginFormState } from "./useLoginFormState";
import { useLoginActions } from "./useLoginActions";
import { HeaderSection } from "./HeaderSection";
import { CredentialSection } from "./CredentialSection";
import { FooterSection } from "./FooterSection";

/**
 * 登录表单渲染器 v2
 *
 * 每个元素（标题 / 副标题 / 用户名输入框 / 密码输入框 / 按钮 / 记住我 / 忘记密码）
 * 均可独立配置颜色、字体、边框、圆角、高度等样式。
 * 编辑区显示修复：
 * - 移除 justifyContent: center（避免内容超出容器时顶部被裁切）
 * - 编辑模式 overflow: visible（画布外框 hidden 不会裁切编辑态）
 * - 预览模式 overflow: auto（内容溢出时可滚动）
 *
 * 拆分说明：配置提取见 `config.ts`，样式与图标见 `shared.tsx`，
 * 本地状态见 `useLoginFormState.ts`，登录动作见 `useLoginActions.ts`，
 * 视图分区见 `HeaderSection.tsx` / `CredentialSection.tsx` / `FooterSection.tsx`。
 */
export function LoginFormRenderer({ config, mode, onConfigChange }: ComponentRendererProps) {
  const isEdit = mode === "edit";

  const cfg = extractLoginFormConfig(config);

  // ─── 预设模板（v3） ───
  const lastAppliedPreset = useRef<string>("custom");

  // ─── 响应映射模板（v4） ───
  const applyMappingTemplate = useWebsiteAuthStore((s) => s.applyMappingTemplate);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);

  const st = useLoginFormState(cfg);
  const actions = useLoginActions(cfg, st, isEdit);

  // ─── 同步配置到 authStore（v4 端点编排 + 配置驱动） ───
  // 将组件 config 中的 token/refresh/header/endpoints 配置写入 websiteAuthStore
  // 使 HttpAdapter.buildAuthHeaders() 和 tryRefreshToken() 能读取到配置
  // v4: 优先使用 endpoints 数组，同时从散落字段补齐兼容
  useEffect(() => {
    // 构建端点列表：优先使用 endpoints 数组，补充 responseMapping
    const defaultMapping = [
      { sourcePath: cfg.tokenField, targetKey: cfg.tokenKey, saveToCache: true },
      { sourcePath: cfg.refreshTokenField, targetKey: "refreshToken", saveToCache: true },
      { sourcePath: cfg.expiresInField, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
    ];

    // 如果 endpoints 数组有内容，使用它；否则从散落字段构建兼容端点
    const effectiveEndpoints = cfg.endpoints.length > 0
      ? cfg.endpoints.map(ep => ({
          id: ep.id,
          name: ep.name,
          path: ep.path,
          method: ep.method,
          endpointType: (ep.endpointType || "other") as "login" | "logout" | "refresh" | "userInfo" | "register" | "other",
          responseMapping: ep.responseMapping?.length ? ep.responseMapping : defaultMapping,
        }))
      : cfg.refreshEnabled && cfg.refreshEndpointPath
        ? [{
            id: "refresh",
            name: "refresh",
            path: cfg.refreshEndpointPath,
            method: cfg.refreshEndpointMethod,
            endpointType: "refresh" as const,
            responseMapping: defaultMapping,
          }]
        : [];

    setAuthConfig({
      token: {
        storage: cfg.tokenStorage,
        key: cfg.tokenKey,
        header: cfg.tokenHeader,
        prefix: cfg.tokenPrefix,
      },
      refresh: {
        enabled: cfg.refreshEnabled,
        threshold: cfg.refreshThreshold,
      },
      headerConfigs: cfg.headerConfigs,
      endpoints: effectiveEndpoints,
      validation: {
        codePath: String(config.codeField ?? ""),
        msgPath: String(config.msgField ?? "msg"),
        successCodes: parseSuccessCodes(config.successCodes),
        msgFallback: String(config.msgFallback ?? "请求失败"),
      },
      responseMappings: [
        { sourcePath: cfg.tokenField, targetKey: cfg.tokenKey, saveToCache: true },
        { sourcePath: cfg.refreshTokenField, targetKey: "refreshToken", saveToCache: true },
        { sourcePath: cfg.expiresInField, targetKey: "expiresIn", saveToCache: true, isExpirationTime: true },
        { sourcePath: cfg.userField, targetKey: "user", saveToCache: false },
      ],
      authParams: cfg.authParams.length > 0 ? cfg.authParams : undefined,
    });
  }, [
    cfg.tokenStorage, cfg.tokenKey, cfg.tokenHeader, cfg.tokenPrefix,
    cfg.refreshEnabled, cfg.refreshThreshold, cfg.refreshEndpointPath, cfg.refreshEndpointMethod,
    cfg.headerConfigs, cfg.tokenField, cfg.refreshTokenField, cfg.expiresInField, cfg.userField,
    cfg.endpoints, setAuthConfig,
  ]);

  // ─── v3 预设模板：选择预设后自动填充各字段 ───
  useEffect(() => {
    if (cfg.authPreset === lastAppliedPreset.current) return;
    lastAppliedPreset.current = cfg.authPreset;
    if (cfg.authPreset === "custom") return;
    const allPresets = getAllAuthPresets();
    const preset = allPresets[cfg.authPreset] || AUTH_PRESETS[cfg.authPreset];
    if (!preset || !onConfigChange) return;
    // 选预设后自动折叠高级选项
    onConfigChange("showAdvanced", false);
    // 逐字段应用预设值
    for (const [key, value] of Object.entries(preset.config)) {
      onConfigChange(key, value);
    }
  }, [cfg.authPreset, onConfigChange]);

  // ─── v4 响应映射模板：选择模板后自动同步到 store ───
  useEffect(() => {
    if (cfg.mappingTemplate === "custom") return;
    const tpl = RESPONSE_MAPPING_TEMPLATES.find(t => t.id === cfg.mappingTemplate);
    if (!tpl) return;
    // 同步模板的 mappings 到 store 的 config.responseMappings
    // 同时通过 onConfigChange 同步到组件 config 的 responseMappings
    if (onConfigChange && tpl.mappings.length > 0) {
      onConfigChange("responseMappings", tpl.mappings);
      // 同步派生字段到 tokenField/refreshTokenField/expiresInField/userField
      const tokenMapping = tpl.mappings.find(m => m.targetKey.includes("token") || m.targetKey.includes("Token"));
      if (tokenMapping) onConfigChange("tokenField", tokenMapping.sourcePath);
      const refreshMapping = tpl.mappings.find(m => m.targetKey === "refreshToken");
      if (refreshMapping) onConfigChange("refreshTokenField", refreshMapping.sourcePath);
      const expMapping = tpl.mappings.find(m => m.isExpirationTime);
      if (expMapping) onConfigChange("expiresInField", expMapping.sourcePath);
      const userMapping = tpl.mappings.find(m => m.targetKey === "user" || m.targetKey === "userId");
      if (userMapping) onConfigChange("userField", userMapping.sourcePath);
    }
    applyMappingTemplate(cfg.mappingTemplate);
  }, [cfg.mappingTemplate, onConfigChange, applyMappingTemplate]);

  // ─── 阴影 / 间隙 ───
  const shadowValue = SHADOW_MAP[cfg.containerShadow] || "none";
  const gapStr = `${cfg.fieldGap}px`;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: st.visible ? "flex" : "none",
        flexDirection: "column",
        // 修复：移除 justifyContent: center，避免内容超出容器时顶部被裁切
        justifyContent: "flex-start",
        background: cfg.containerBgColor,
        border: `1px solid ${cfg.containerBorderColor}`,
        borderRadius: `${cfg.containerBorderRadius}px`,
        padding: `${cfg.containerPadding}px`,
        boxSizing: "border-box",
        boxShadow: shadowValue,
        // 修复：编辑模式 visible 防止裁切；预览模式 auto 可滚动
        overflow: isEdit ? "visible" : "auto",
        gap: gapStr,
      }}
    >
      <HeaderSection cfg={cfg} st={st} isEdit={isEdit} />
      <CredentialSection cfg={cfg} st={st} actions={actions} isEdit={isEdit} />
      <FooterSection cfg={cfg} st={st} actions={actions} isEdit={isEdit} />
    </Box>
  );
}