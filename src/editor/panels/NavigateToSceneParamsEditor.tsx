import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useSceneStore } from "../../store/sceneStore";

interface NavigateToSceneParamsEditorProps {
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

/**
 * NavigateToSceneParamsEditor - 场景跳转参数编辑器
 * 专用于 navigateToScene 动作的参数配置表单
 */
export function NavigateToSceneParamsEditor({ params, onChange }: NavigateToSceneParamsEditorProps) {
  const scenes = useSceneStore((s) => s.scenes);
  const isLoading = useSceneStore((s) => s.isLoading);
  const initialized = useSceneStore((s) => s.initialized);
  // 触发场景库加载（空库自动创建默认），保证场景/视图下拉有数据
  useEffect(() => {
    useSceneStore.getState().init().catch(() => {});
  }, []);
  const [sceneId, setSceneId] = useState<string>((params.sceneId as string) ?? "");
  const [viewId, setViewId] = useState<string>((params.viewId as string) ?? "");
  const [openMode, setOpenMode] = useState<string>((params.openMode as string) ?? "replace");
  const [variablesStr, setVariablesStr] = useState<string>(() => {
    if (params.variables && typeof params.variables === "object") {
      return JSON.stringify(params.variables, null, 2);
    }
    return "{}";
  });
  const [variablesError, setVariablesError] = useState<string>("");

  // 获取选中场景的视图列表
  const selectedScene = scenes.find((s) => s.id === sceneId);
  const views = selectedScene?.views ?? [];

  useEffect(() => {
    const updated: Record<string, unknown> = {
      sceneId,
      openMode,
    };
    if (viewId) updated.viewId = viewId;
    try {
      const vars = JSON.parse(variablesStr);
      if (Object.keys(vars).length > 0) {
        updated.variables = vars;
      }
      setVariablesError("");
    } catch {
      setVariablesError("JSON 格式错误");
    }
    onChange(updated);
  }, [sceneId, viewId, openMode, variablesStr]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* 场景选择器 */}
      <TextField
        select
        size="small"
        label="目标场景"
        value={sceneId}
        onChange={(e) => {
          setSceneId(e.target.value);
          setViewId(""); // 重置视图选择
        }}
        fullWidth
        required
      >
        {scenes.map((scene) => (
          <MenuItem key={scene.id} value={scene.id}>
            {scene.name}
          </MenuItem>
        ))}
        {scenes.length === 0 && (
          <MenuItem disabled value="">
            {isLoading ? "场景加载中…" : initialized ? "暂无可用场景" : "场景加载中…"}
          </MenuItem>
        )}
      </TextField>

      {/* 视图选择器 */}
      {views.length > 0 && (
        <TextField
          select
          size="small"
          label="目标视图"
          value={viewId}
          onChange={(e) => setViewId(e.target.value)}
          fullWidth
        >
          <MenuItem value="">主监控大屏</MenuItem>
          {views.map((view) => (
            <MenuItem key={view.id} value={view.id}>
              {view.name}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* 打开方式 */}
      <TextField
        select
        size="small"
        label="打开方式"
        value={openMode}
        onChange={(e) => setOpenMode(e.target.value)}
        fullWidth
      >
        <MenuItem value="replace">替换当前窗口</MenuItem>
        <MenuItem value="newWindow">新窗口</MenuItem>
        <MenuItem value="dialog">弹窗</MenuItem>
      </TextField>

      {/* 变量映射 */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          传递变量 (JSON 格式)
        </Typography>
        <TextField
          size="small"
          multiline
          minRows={2}
          maxRows={6}
          value={variablesStr}
          onChange={(e) => setVariablesStr(e.target.value)}
          error={!!variablesError}
          helperText={variablesError}
          placeholder='{"deviceId": "123", "mode": "detail"}'
          fullWidth
          sx={{
            "& .MuiInputBase-input": {
              fontFamily: "monospace",
              fontSize: "0.8rem",
            },
          }}
        />
      </Box>
    </Box>
  );
}
