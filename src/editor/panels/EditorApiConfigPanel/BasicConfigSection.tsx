import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import MenuItem from "@mui/material/MenuItem";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import TuneIcon from "@mui/icons-material/Tune";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { createDefaultApiConfig } from "../../../types/scene";
import { SectionHeader, SettingRow, inputSx } from "../apiPanelShared";

/** 基础配置：站点模式 / 基地址 / 自动认证 / 超时时间 */
export function BasicConfigSection() {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const setApiConfig = useEditorStore((s) => s.setApiConfig);
  const config = apiConfig ?? createDefaultApiConfig();

  const [expanded, setExpanded] = useState(true);

  // 本地暂存：onChange 只改本地 state，onBlur 才提交 store（避免每按键 pushHistory）
  const [baseUrlInput, setBaseUrlInput] = useState(config.baseUrl);
  useEffect(() => setBaseUrlInput(config.baseUrl), [config.baseUrl]);
  const handleBaseUrlBlur = useCallback(() => {
    const v = baseUrlInput.trim();
    if (v !== config.baseUrl) setApiConfig({ baseUrl: v });
  }, [baseUrlInput, config.baseUrl, setApiConfig]);

  const [timeoutInput, setTimeoutInput] = useState(String(config.timeout ?? 10000));
  useEffect(() => setTimeoutInput(String(config.timeout ?? 10000)), [config.timeout]);
  const handleTimeoutBlur = useCallback(() => {
    const n = parseInt(timeoutInput, 10);
    const v = isNaN(n) || n <= 0 ? 10000 : Math.round(n);
    setTimeoutInput(String(v));
    if (v !== (config.timeout ?? 10000)) setApiConfig({ timeout: v });
  }, [timeoutInput, config.timeout, setApiConfig]);

  // 站点运行模式：显式配置优先，缺省 auto（按组件动态判定）
  const siteMode: "static" | "dynamic" | "auto" = config.siteMode ?? "auto";

  return (
    <Box>
      <SectionHeader title="基础配置" icon={<TuneIcon sx={{ fontSize: 16 }} />} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5, pt: 0.5 }}>
          {/* 站点运行模式：静态 / 动态 / 自动 */}
          <SettingRow label="站点模式">
            <TextField
              select
              size="small"
              value={siteMode}
              onChange={(e) => setApiConfig({ siteMode: e.target.value as "static" | "dynamic" | "auto" })}
              sx={{ flex: 1, minWidth: 0, ...inputSx }}
            >
              <MenuItem value="auto">自动（按组件判定）</MenuItem>
              <MenuItem value="dynamic">动态（依赖 API）</MenuItem>
              <MenuItem value="static">静态（离线内联数据）</MenuItem>
            </TextField>
          </SettingRow>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
            <HelpOutlineOutlinedIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
              {siteMode === "static"
                ? "纯静态站点：数据内联，可离线发布，无运行时请求。"
                : siteMode === "dynamic"
                  ? "动态站点：数据通过 API 拉取，需网络与接口运行环境。"
                  : "自动模式：系统按组件是否存在动态数据源自动判定（见右上角站点标识）。"}
            </Typography>
          </Box>

          <Tooltip title="所有数据组件的 API 请求默认基于此地址。组件 apiUrl 为完整 URL 时不受影响" arrow placement="top-start">
            <SettingRow label="基地址">
              <TextField
                size="small"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                onBlur={handleBaseUrlBlur}
                placeholder="https://api.example.com/v1"
                sx={{ flex: 1, minWidth: 0, ...inputSx }}
              />
            </SettingRow>
          </Tooltip>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
            <HelpOutlineOutlinedIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
              组件配置相对 apiUrl / apiPath 时自动与此地址拼接；全部留空时作为请求基线兜底。
            </Typography>
          </Box>

          <SettingRow label="自动认证">
            <Switch
              size="small"
              checked={config.authEnabled}
              onChange={(e) => setApiConfig({ authEnabled: e.target.checked })}
            />
            <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
              开启后，数据组件请求自动注入认证 Token（来自登录组件）。组件层面可单独覆盖。
            </Typography>
          </SettingRow>

          <SettingRow label="超时时间">
            <TextField
              type="number"
              size="small"
              value={timeoutInput}
              onChange={(e) => setTimeoutInput(e.target.value)}
              onBlur={handleTimeoutBlur}
              sx={{ flex: 1, minWidth: 0, ...inputSx }}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>ms</Typography>
          </SettingRow>
        </Box>
      </Collapse>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}