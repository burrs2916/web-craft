/**
 * ObjectListEditor — 通用对象数组可视化编辑器
 *
 * 用于 ConfigField.type === "list-editor"，替代 JSON 文本编辑。
 * 支持增删、折叠展开、逐字段编辑（text/select/toggle）。
 */
import { useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  FormControlLabel,
  Switch,
  Typography,
  Collapse,
  Paper,
  Stack,
  InputLabel,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from "@mui/icons-material";
import { IconPicker } from "../../components/component";
import { resolveSelectValue, selectDisplayValue } from "../data/fieldSelect";
import { resolveIcon } from "../plugins";
import type { ConfigField } from "../../types/editor";

interface ObjectListEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  field: ConfigField;
}

export function ObjectListEditor({ value, onChange, field }: ObjectListEditorProps) {
  const items = Array.isArray(value)
    ? value as Record<string, unknown>[]
    : (typeof value === "string" ? _tryParseArray(value) : []);
  const itemFields = field.itemFields ?? [];
  const maxItems = field.maxItems ?? 0;
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const updateItem = useCallback((index: number, key: string, val: unknown) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, [key]: val } : item
    );
    onChange(next);
  }, [items, onChange]);

  const addItem = useCallback(() => {
    const newItem: Record<string, unknown> = {};
    itemFields.forEach((f) => {
      newItem[f.key] = f.defaultValue ?? _typeDefault(f);
    });
    // Generate a unique id if the schema has an "id" field
    if (itemFields.some((f) => f.key === "id") && !newItem.id) {
      newItem.id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    }
    onChange([...items, newItem]);
    setExpandedIdx(items.length);
  }, [items, itemFields, onChange]);

  const deleteItem = useCallback((index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
    setExpandedIdx(null);
  }, [items, onChange]);

  const moveItem = useCallback((index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setExpandedIdx(target);
  }, [items, onChange]);

  const labelKey = field.itemLabelKey ?? itemFields[0]?.key ?? "key";
  const canAdd = maxItems === 0 || items.length < maxItems;

  return (
    <Box sx={{ width: "100%" }}>
      <Stack spacing={1}>
        {items.map((item, idx) => {
          const expanded = expandedIdx === idx;
          const summary = String(item[labelKey] ?? `条目 ${idx + 1}`);
          return (
            <Paper key={idx} variant="outlined" sx={{ overflow: "hidden" }}>
              {/* Row header */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  pr: 0.5,
                  pl: 0.5,
                  minHeight: 36,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
                onClick={() => setExpandedIdx(expanded ? null : idx)}
              >
                <IconButton size="small" sx={{ p: 0.25 }}>
                  {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                </IconButton>
                {(() => {
                  const iconField = itemFields.find((f) => f.type === "icon-picker" && f.key === "icon");
                  if (!iconField) return null;
                  const iconVal = String(item[iconField.key] ?? "");
                  if (!iconVal) return null;
                  return <Box sx={{ display: "inline-flex", flexShrink: 0, mr: 0.5 }}>{resolveIcon(iconVal, undefined, 14)}</Box>;
                })()}
                <Typography
                  variant="body2"
                  sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}
                >
                  {summary || <span style={{ opacity: 0.5 }}>(空)</span>}
                </Typography>
                <IconButton
                  size="small"
                  sx={{ p: 0.25 }}
                  disabled={idx === 0}
                  onClick={(e) => { e.stopPropagation(); moveItem(idx, -1); }}
                >
                  <ArrowUpIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  sx={{ p: 0.25 }}
                  disabled={idx === items.length - 1}
                  onClick={(e) => { e.stopPropagation(); moveItem(idx, 1); }}
                >
                  <ArrowDownIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  sx={{ p: 0.25, color: "error.main" }}
                  onClick={(e) => { e.stopPropagation(); deleteItem(idx); }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              {/* Expanded fields */}
              <Collapse in={expanded}>
                <Box sx={{ p: 1, pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Stack spacing={1}>
                    {itemFields.map((f) => {
                      const val = item[f.key];
                      return (
                        <Box key={f.key} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                          {f.type === "toggle" ? (
                            <FormControlLabel
                              label={f.label}
                              labelPlacement="start"
                              sx={{ margin: 0, "& .MuiFormControlLabel-label": { fontSize: 12 } }}
                              control={
                                <Switch
                                  size="small"
                                  checked={Boolean(val)}
                                  onChange={(e) => updateItem(idx, f.key, e.target.checked)}
                                />
                              }
                            />
                          ) : f.type === "number" ? (
                            <TextField
                              label={f.label}
                              type="number"
                              value={val == null ? "" : String(val)}
                              size="small"
                              placeholder={f.placeholder}
                              slotProps={{
                                inputLabel: { shrink: true },
                                htmlInput: { step: f.step ?? 1 },
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const num = raw === "" ? undefined : Number(raw);
                                updateItem(idx, f.key, Number.isNaN(num) ? undefined : num);
                              }}
                              sx={{ flex: 1, minWidth: 90, "& .MuiInputBase-input": { fontSize: 12 } }}
                            />
                          ) : f.type === "icon-picker" ? (
                            <Box sx={{ flex: 1, minWidth: 120 }}>
                              <IconPicker
                                defaultValue={String(f.defaultValue ?? "folder")}
                                value={typeof val === "string" ? val : ""}
                                onChange={(v) => updateItem(idx, f.key, v || "")}
                              />
                            </Box>
                          ) : f.type === "color" ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1, minWidth: 120 }}>
                              <Box
                                sx={{
                                  position: "relative",
                                  width: 26,
                                  height: 26,
                                  borderRadius: 0.75,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  overflow: "hidden",
                                  flexShrink: 0,
                                }}
                              >
                                <input
                                  type="color"
                                  value={typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val) ? val : "#000000"}
                                  onInput={(e) => updateItem(idx, f.key, (e.target as HTMLInputElement).value)}
                                  onChange={(e) => updateItem(idx, f.key, e.target.value)}
                                  style={{
                                    position: "absolute",
                                    inset: -4,
                                    width: "calc(100% + 8px)",
                                    height: "calc(100% + 8px)",
                                    cursor: "pointer",
                                    border: "none",
                                    padding: 0,
                                  }}
                                />
                              </Box>
                              <TextField
                                label={f.label}
                                value={val == null ? "" : String(val)}
                                size="small"
                                placeholder={f.placeholder ?? "#000000"}
                                slotProps={{ inputLabel: { shrink: true } }}
                                onChange={(e) => updateItem(idx, f.key, e.target.value)}
                                sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 12, fontFamily: "monospace" } }}
                              />
                            </Box>
                          ) : f.type === "select" ? (
                            <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
                              <InputLabel sx={{ fontSize: 12 }}>{f.label}</InputLabel>
                              <Select
                                value={selectDisplayValue(f, val)}
                                label={f.label}
                                onChange={(e) => updateItem(idx, f.key, resolveSelectValue(f, e.target.value))}
                                sx={{ fontSize: 12 }}
                              >
                                {f.options?.map((opt) => (
                                  <MenuItem key={String(opt.value)} value={String(opt.value)} sx={{ fontSize: 12 }}>
                                    {opt.label}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : (
                            <TextField
                              label={f.label}
                              value={String(val ?? "")}
                              size="small"
                              placeholder={f.placeholder}
                              slotProps={{ inputLabel: { shrink: true } }}
                              onChange={(e) => updateItem(idx, f.key, e.target.value)}
                              sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 12 } }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Collapse>
            </Paper>
          );
        })}

        {items.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic", fontSize: 12, py: 1 }}>
            暂无条目，点击下方按钮添加
          </Typography>
        )}

        {canAdd && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addItem}
            variant="outlined"
            sx={{ alignSelf: "flex-start", textTransform: "none", fontSize: 12 }}
          >
            {field.addItemLabel ?? "添加条目"}
          </Button>
        )}
      </Stack>
    </Box>
  );
}

// 兼容历史数据：部分字段以 JSON 字符串形式存储对象数组（如骨架屏 rows）
function _tryParseArray(s: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(s.trim());
    if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  } catch { /* ignore */ }
  return [];
}

function _typeDefault(f: ConfigField): unknown {
  switch (f.type) {
    case "toggle": return false;
    case "number": return f.defaultValue ?? 0;
    case "select": return f.defaultValue ?? (f.options?.[0]?.value ?? "");
    default: return f.defaultValue ?? "";
  }
}
