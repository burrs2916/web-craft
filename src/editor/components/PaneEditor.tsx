import { useState, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  parsePanes,
  serializePanes,
  genPaneId,
  normalizeActivePaneId,
  colorToHex,
  type PaneItem,
} from "../utils/panes";

interface PaneEditorProps {
  /** config.panes 原始字符串（JSON） */
  value: string;
  /** 序列化后的 panes JSON 字符串 */
  onChange: (serialized: string) => void;
  /** 当前画布上显示的面板 id（config.activePaneId） */
  activePaneId?: string;
  /** 切换画布上显示的面板 */
  onActivePaneChange?: (paneId: string) => void;
}

export function PaneEditor({ value, onChange, activePaneId, onActivePaneChange }: PaneEditorProps) {
  const panes = useMemo(() => parsePanes(value), [value]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const commit = useCallback(
    (next: PaneItem[]) => {
      onChange(serializePanes(next));
      // 面板列表变化后纠正悬空的 activePaneId（面板被删/ID 失效时回退到第一个）
      const normalized = normalizeActivePaneId(next, activePaneId);
      if (normalized !== (activePaneId ?? "") && onActivePaneChange) {
        onActivePaneChange(normalized);
      }
    },
    [onChange, activePaneId, onActivePaneChange],
  );

  const addPane = useCallback(() => {
    const newPane: PaneItem = {
      id: genPaneId(),
      name: `面板 ${panes.length + 1}`,
      content: "",
      bgColor: null,
    };
    const next = [...panes, newPane];
    commit(next);
    setExpandedId(newPane.id);
  }, [panes, commit]);

  const updatePane = useCallback(
    (id: string, patch: Partial<PaneItem>) => {
      commit(panes.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    [panes, commit],
  );

  const removePane = useCallback(
    (id: string) => {
      commit(panes.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    },
    [panes, commit, expandedId],
  );

  const movePane = useCallback(
    (id: string, dir: "up" | "down") => {
      const index = panes.findIndex((p) => p.id === id);
      const target = dir === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= panes.length) return;
      const next = [...panes];
      [next[index], next[target]] = [next[target], next[index]];
      commit(next);
    },
    [panes, commit],
  );

  const toggleExpand = useCallback((paneId: string) => {
    setExpandedId((prev) => (prev === paneId ? null : paneId));
    onActivePaneChange?.(paneId);
  }, [onActivePaneChange]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500, mb: 0.25 }}>
        面板列表（点击行：展开编辑 + 画布切换到该面板）
      </Typography>
      {panes.length === 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.disabled", fontStyle: "italic", py: 1, textAlign: "center" }}>
          暂无面板，点击下方添加
        </Typography>
      )}
      {panes.map((pane, i) => {
        const isExpanded = expandedId === pane.id;
        const isLast = i === panes.length - 1;
        const isActivePane = activePaneId === pane.id;
        return (
          <Paper
            key={pane.id}
            variant="outlined"
            sx={{
              borderRadius: 1,
              overflow: "hidden",
              border: "1px solid",
              borderColor: isExpanded ? "primary.main" : isActivePane ? "info.main" : "divider",
              transition: "border-color 0.15s",
            }}
          >
            {/* 行头：面板名称（hover 显示绑定用 ID） */}
            <Tooltip
              title={`面板 ID（菜单绑定用）：${pane.id}`}
              placement="top"
              disableInteractive
            >
              <Box
                onClick={() => toggleExpand(pane.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  cursor: "pointer",
                  bgcolor: isActivePane ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <ChevronRightIcon
                  sx={{
                    fontSize: 16,
                    color: "text.secondary",
                    transition: "transform 0.2s",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                />
                {isActivePane && (
                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "info.main", flexShrink: 0 }} />
                )}
                <Typography
                  sx={{
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: isExpanded ? 600 : 400,
                    color: "text.primary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pane.name || "（未命名面板）"}
                </Typography>
              </Box>
            </Tooltip>

            <Collapse in={isExpanded}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1, pt: 0.5 }}>
                {/* 面板名称 */}
                <TextField
                  size="small"
                  label="面板名称"
                  value={pane.name}
                  onChange={(e) => updatePane(pane.id, { name: e.target.value })}
                  sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
                />
                {/* 面板 ID（只读，供菜单项绑定时引用） */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>面板 ID:</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", fontFamily: "monospace" }}>
                    {pane.id}
                  </Typography>
                </Box>
                {/* 面板内容 */}
                <TextField
                  size="small"
                  label="面板内容"
                  value={pane.content}
                  onChange={(e) => updatePane(pane.id, { content: e.target.value })}
                  multiline
                  rows={4}
                  placeholder="输入面板内容，API 模式下支持 {字段名} 插值"
                  sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
                />
                {/* 面板独立背景色 */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, pl: 0.5 }}>
                  <Switch
                    size="small"
                    checked={!!pane.bgColor}
                    onChange={(e) => updatePane(pane.id, { bgColor: e.target.checked ? "rgba(30,30,50,0.6)" : null })}
                  />
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary", flexShrink: 0 }}>
                    面板背景色
                  </Typography>
                  {pane.bgColor && (
                    <>
                      <Box
                        component="input"
                        type="color"
                        value={colorToHex(pane.bgColor)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePane(pane.id, { bgColor: e.target.value })}
                        sx={{ width: 28, height: 20, border: "1px solid", borderColor: "divider", borderRadius: 0.5, cursor: "pointer", padding: 0 }}
                      />
                      <TextField
                        size="small"
                        value={pane.bgColor}
                        onChange={(e) => updatePane(pane.id, { bgColor: e.target.value })}
                        sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 11, fontFamily: "monospace" } }}
                      />
                    </>
                  )}
                </Box>
                {/* 操作栏（唯一的移动/删除入口） */}
                <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                  <Tooltip title="上移">
                    <span>
                      <IconButton
                        size="small"
                        disabled={i === 0}
                        onClick={() => movePane(pane.id, "up")}
                        sx={{ width: 24, height: 24 }}
                      >
                        <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="下移">
                    <span>
                      <IconButton
                        size="small"
                        disabled={isLast}
                        onClick={() => movePane(pane.id, "down")}
                        sx={{ width: 24, height: 24 }}
                      >
                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="删除面板">
                    <IconButton
                      size="small"
                      onClick={() => removePane(pane.id)}
                      sx={{ width: 24, height: 24, color: "error.main" }}
                    >
                      <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Collapse>
          </Paper>
        );
      })}
      <Box
        onClick={addPane}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          cursor: "pointer",
          py: 0.5,
          mt: 0.25,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          color: "text.secondary",
          "&:hover": { borderColor: "primary.main", color: "primary.main" },
        }}
      >
        <AddIcon sx={{ fontSize: 15 }} />
        <Typography sx={{ fontSize: 12 }}>添加面板</Typography>
      </Box>
    </Box>
  );
}
