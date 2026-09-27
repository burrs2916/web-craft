import { useState, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { IconPicker } from "../../components/component";
import { resolveIcon } from "../plugins/IconResolver";
import {
  type TabItem,
  parseTabs,
  serializeTabs,
  genTabId,
  getActiveTabId,
} from "../utils/tabsConfig";

interface TabEditorProps {
  /** config.tabs 原始值（JSON 字符串或旧换行格式） */
  value: unknown;
  /** 序列化后的 tabs JSON 字符串 */
  onChange: (serialized: string) => void;
  /** 当前激活标签 ID（config.activeTabId） */
  activeTabId?: string;
  /** 切换激活标签 */
  onActiveTabIdChange?: (tabId: string) => void;
  /** 父组件的 config（用于读取 activeTabId 回退值） */
  parentConfig?: Record<string, unknown>;
}

export function TabEditor({
  value,
  onChange,
  activeTabId,
  onActiveTabIdChange,
  parentConfig,
}: TabEditorProps) {
  const tabs = useMemo(() => parseTabs({ tabs: value }), [value]);
  // 确定当前激活标签：优先用 props.activeTabId，回退到 parentConfig
  const currentActiveId = activeTabId ?? getActiveTabId(parentConfig ?? {}, tabs);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const commit = useCallback(
    (next: TabItem[]) => {
      onChange(serializeTabs(next));
    },
    [onChange],
  );

  const addTab = useCallback(() => {
    const newTab: TabItem = {
      id: genTabId(),
      label: `标签 ${tabs.length + 1}`,
    };
    const next = [...tabs, newTab];
    commit(next);
    setExpandedKey(String(next.length - 1));
    // 如果是第一个标签，设为激活
    if (tabs.length === 0) {
      onActiveTabIdChange?.(newTab.id);
    }
  }, [tabs, commit, onActiveTabIdChange]);

  const updateTab = useCallback(
    (index: number, patch: Partial<TabItem>) => {
      const next = tabs.map((t, i) => (i === index ? { ...t, ...patch } : t));
      commit(next);
      // 如果修改的是当前激活标签的 id，同步更新 activeTabId
      if (patch.id && tabs[index]?.id === currentActiveId) {
        onActiveTabIdChange?.(patch.id);
      }
    },
    [tabs, commit, currentActiveId, onActiveTabIdChange],
  );

  const removeTab = useCallback(
    (index: number) => {
      const removedId = tabs[index]?.id;
      const next = tabs.filter((_, i) => i !== index);
      commit(next);
      if (expandedKey === String(index)) setExpandedKey(null);
      // 如果删除的是当前激活标签，切到第一个
      if (removedId === currentActiveId && next.length > 0) {
        onActiveTabIdChange?.(next[0].id);
      }
    },
    [tabs, commit, expandedKey, currentActiveId, onActiveTabIdChange],
  );

  const moveTab = useCallback(
    (index: number, dir: "up" | "down") => {
      const target = dir === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= tabs.length) return;
      const next = [...tabs];
      [next[index], next[target]] = [next[target], next[index]];
      commit(next);
    },
    [tabs, commit],
  );

  const toggleExpand = useCallback(
    (key: string, tabId: string) => {
      setExpandedKey((prev) => (prev === key ? null : key));
      onActiveTabIdChange?.(tabId);
    },
    [onActiveTabIdChange],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500, mb: 0.25 }}>
        标签列表（点击行展开编辑，切换画布显示）
      </Typography>
      {tabs.length === 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.disabled", fontStyle: "italic", py: 1, textAlign: "center" }}>
          暂无标签
        </Typography>
      )}
      {tabs.map((tab, i) => {
        const key = String(i);
        const isExpanded = expandedKey === key;
        const isLast = i === tabs.length - 1;
        const isActiveTab = currentActiveId === tab.id;
        return (
          <Paper
            key={key}
            variant="outlined"
            sx={{
              borderRadius: 1,
              overflow: "hidden",
              border: "1px solid",
              borderColor: isExpanded ? "primary.main" : isActiveTab ? "info.main" : "divider",
              transition: "border-color 0.15s",
            }}
          >
            {/* 行头：标签名称 + 操作按钮 */}
            <Box
              onClick={() => toggleExpand(key, tab.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.5,
                cursor: "pointer",
                bgcolor: isActiveTab ? "action.selected" : "transparent",
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
                {tab.label || "（未命名标签）"}
              </Typography>
              {!isExpanded && (
                <Box sx={{ display: "flex", gap: 0.25 }}>
                  <IconButton
                    size="small"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveTab(i, "up");
                    }}
                    sx={{ width: 20, height: 20, p: 0 }}
                  >
                    <ArrowUpwardIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={isLast}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveTab(i, "down");
                    }}
                    sx={{ width: 20, height: 20, p: 0 }}
                  >
                    <ArrowDownwardIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Box>
              )}
            </Box>

            <Collapse in={isExpanded}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1, pt: 0.5 }}>
                {/* 标签名称 */}
                <TextField
                  size="small"
                  label="标签名称"
                  value={tab.label}
                  onChange={(e) => updateTab(i, { label: e.target.value })}
                  sx={{
                    '& .MuiInputBase-input': { fontSize: 11.5 },
                    '& .MuiOutlinedInput-root': { borderRadius: 0.75 },
                    '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': { height: 32 },
                  }}
                />
                {/* 标签图标 */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {tab.icon && resolveIcon(tab.icon, "widgets", 16)}
                    <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}>
                      标签图标
                    </Typography>
                  </Box>
                  <IconPicker
                    hideCaption
                    value={tab.icon ?? ""}
                    defaultValue=""
                    onChange={(v) => updateTab(i, { icon: v || undefined })}
                  />
                </Box>
                {/* 内容区独立背景 */}
                <FormControlLabel
                  label="内容区独立背景"
                  labelPlacement="start"
                  control={
                    <Switch
                      size="small"
                      checked={tab.contentBg != null}
                      onChange={(e) => {
                        if (e.target.checked) {
                          updateTab(i, { contentBg: "rgba(255,255,255,0.02)" });
                        } else {
                          updateTab(i, { contentBg: null });
                        }
                      }}
                    />
                  }
                  sx={{
                    m: 0,
                    "& .MuiFormControlLabel-label": { fontSize: 11.5, color: "text.secondary" },
                    "& .MuiSwitch-root": { ml: "auto" },
                  }}
                />
                {tab.contentBg != null && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      component="input"
                      type="color"
                      value={tab.contentBg.startsWith("#") ? tab.contentBg : "#ffffff"}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateTab(i, { contentBg: e.target.value });
                      }}
                      sx={{
                        width: 32,
                        height: 24,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 0.5,
                        cursor: "pointer",
                        p: 0,
                        flexShrink: 0,
                      }}
                    />
                    <TextField
                      size="small"
                      value={tab.contentBg}
                      onChange={(e) => updateTab(i, { contentBg: e.target.value })}
                      placeholder="rgba(255,255,255,0.02)"
                      sx={{
                        flex: 1,
                        '& .MuiInputBase-input': { fontSize: 11.5, fontFamily: 'monospace' },
                        '& .MuiOutlinedInput-root': { borderRadius: 0.75 },
                        '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': { height: 32 },
                      }}
                    />
                  </Box>
                )}
                {/* 标签 ID（只读） */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>标签 ID:</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", fontFamily: "monospace" }}>
                    {tab.id}
                  </Typography>
                </Box>
                {/* 操作栏 */}
                <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                  <Tooltip title="上移">
                    <IconButton
                      size="small"
                      disabled={i === 0}
                      onClick={() => moveTab(i, "up")}
                      sx={{ width: 24, height: 24 }}
                    >
                      <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="下移">
                    <IconButton
                      size="small"
                      disabled={isLast}
                      onClick={() => moveTab(i, "down")}
                      sx={{ width: 24, height: 24 }}
                    >
                      <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除标签">
                    <IconButton
                      size="small"
                      onClick={() => removeTab(i)}
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
        onClick={addTab}
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
        <Typography sx={{ fontSize: 12 }}>添加标签</Typography>
      </Box>
    </Box>
  );
}
