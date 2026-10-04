import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { createDefaultApiConfig } from "../../../types/scene";
import type { SceneLoadingFeedback } from "../../../types/scene";
import { SectionHeader, SettingRow, inputSx } from "../apiPanelShared";

/** 全局加载反馈：发布端请求进行中自动显示全屏加载指示 */
export function LoadingFeedbackSection() {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const setApiConfig = useEditorStore((s) => s.setApiConfig);
  const config = apiConfig ?? createDefaultApiConfig();

  const [expanded, setExpanded] = useState(true);

  const LF_DEFAULT = createDefaultApiConfig().loadingFeedback!;
  const lf = config.loadingFeedback ?? LF_DEFAULT;
  const setLF = useCallback(
    (patch: Partial<SceneLoadingFeedback>) => {
      setApiConfig({ loadingFeedback: { ...(config.loadingFeedback ?? LF_DEFAULT), ...patch } });
    },
    [config.loadingFeedback, setApiConfig],
  );

  const [loadingSizeInput, setLoadingSizeInput] = useState(String(lf.size ?? 36));
  useEffect(() => setLoadingSizeInput(String(lf.size ?? 36)), [lf.size]);
  const commitLoadingSize = () => {
    const n = parseInt(loadingSizeInput, 10);
    const v = isNaN(n) ? 36 : Math.min(Math.max(Math.round(n), 16), 120);
    setLoadingSizeInput(String(v));
    if (v !== (lf.size ?? 36)) setLF({ size: v });
  };
  const [loadingSpeedInput, setLoadingSpeedInput] = useState(String(lf.speed ?? 1));
  useEffect(() => setLoadingSpeedInput(String(lf.speed ?? 1)), [lf.speed]);
  const commitLoadingSpeed = () => {
    const n = parseFloat(loadingSpeedInput);
    const v = isNaN(n) ? 1 : Math.min(Math.max(n, 0.3), 3);
    setLoadingSpeedInput(String(v));
    if (v !== (lf.speed ?? 1)) setLF({ speed: v });
  };
  const [loadingStrokeInput, setLoadingStrokeInput] = useState(String(lf.strokeWidth ?? 4));
  useEffect(() => setLoadingStrokeInput(String(lf.strokeWidth ?? 4)), [lf.strokeWidth]);
  const commitLoadingStroke = () => {
    const n = parseInt(loadingStrokeInput, 10);
    const v = isNaN(n) ? 4 : Math.min(Math.max(Math.round(n), 2), 8);
    setLoadingStrokeInput(String(v));
    if (v !== (lf.strokeWidth ?? 4)) setLF({ strokeWidth: v });
  };

  return (
    <Box>
      <SectionHeader title="全局加载反馈" icon={<AutorenewRoundedIcon sx={{ fontSize: 16 }} />} expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5, pt: 0.5 }}>
          <SettingRow label="启用">
            <Switch
              size="small"
              checked={lf.enabled}
              onChange={(e) => setLF({ enabled: e.target.checked })}
            />
            <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
              发布端一旦有进行中的网络请求，自动显示全屏加载指示；请求全部完成自动隐藏。无需在画布摆放加载组件。
            </Typography>
          </SettingRow>

          {lf.enabled && (
            <>
              <SettingRow label="动画色">
                <Box
                  sx={{
                    width: 30, height: 30, borderRadius: 1, border: "1px solid",
                    borderColor: "divider", flexShrink: 0, p: 2, background: lf.color ?? "#0D9488",
                  }}
                />
                <input
                  type="color"
                  value={lf.color ?? "#0D9488"}
                  onChange={(e) => setLF({ color: e.target.value })}
                  style={{ width: 44, height: 30, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled" }}>{lf.color ?? "#0D9488"}</Typography>
              </SettingRow>

              <SettingRow label="尺寸">
                <TextField
                  type="number"
                  size="small"
                  value={loadingSizeInput}
                  onChange={(e) => setLoadingSizeInput(e.target.value)}
                  onBlur={commitLoadingSize}
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  slotProps={{ htmlInput: { min: 16, max: 120 } }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>px</Typography>
              </SettingRow>

              <SettingRow label="粗细">
                <TextField
                  type="number"
                  size="small"
                  value={loadingStrokeInput}
                  onChange={(e) => setLoadingStrokeInput(e.target.value)}
                  onBlur={commitLoadingStroke}
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  slotProps={{ htmlInput: { min: 2, max: 8 } }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>px</Typography>
              </SettingRow>

              <SettingRow label="转速">
                <TextField
                  type="number"
                  size="small"
                  value={loadingSpeedInput}
                  onChange={(e) => setLoadingSpeedInput(e.target.value)}
                  onBlur={commitLoadingSpeed}
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  slotProps={{ htmlInput: { min: 0.3, max: 3, step: 0.1 } }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>秒/圈</Typography>
              </SettingRow>

              <SettingRow label="遮罩">
                <Switch
                  size="small"
                  checked={lf.masked ?? true}
                  onChange={(e) => setLF({ masked: e.target.checked })}
                />
                <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
                  开启后覆盖层带半透明背景，弱化当前内容；关闭则仅在中央显示动画、不遮挡页面。
                </Typography>
              </SettingRow>
            </>
          )}
        </Box>
      </Collapse>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}