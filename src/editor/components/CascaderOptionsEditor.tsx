import { useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import {
  parseCascaderStaticOptions,
  serializeCascaderTree,
  type CascaderOption,
} from "../data/cascaderOptions";

/**
 * 级联选择（form-cascader）「选项数据」的**树形结构化编辑器**。
 *
 * 为什么存在：此前该字段是 textarea 让用户手写 JSON 树/逐行文本——同项目的选项型组件
 * （select/radio 的 list-editor）与导航菜单（MenuItemsEditor）都是字段化结构编辑，
 * 只有级联要用户背 JSON 语法，且写错了全靠 diagnose 事后补救。本组件对齐 MenuItemsEditor
 * 的树形范式：缩进参考线、点击行展开行内编辑、添加子级、上下移、删除；
 * 旧配置（JSON 树 / 逐行「显示名|提交值」）经 parseCascaderStaticOptions 自动解析进面板，
 * 每次改动经 serializeCascaderTree 序列化回 JSON 字符串——存储格式不变，
 * 渲染器与 codegen 的解析口径零改动。
 */

interface CascaderOptionsEditorProps {
  /** 原始配置值（JSON 字符串 / 数组 / 逐行文本；空 = 内置示例） */
  value: unknown;
  /** 回写序列化后的 JSON 字符串 */
  onChange: (serialized: string) => void;
}

function mapTree(
  items: CascaderOption[],
  fn: (item: CascaderOption) => CascaderOption,
  key: string,
): CascaderOption[] {
  const path = key.split("-").map(Number);
  const walk = (list: CascaderOption[], depth: number): CascaderOption[] =>
    list.map((item, i) => {
      if (i !== path[depth]) return item;
      if (depth === path.length - 1) return fn(item);
      return { ...item, children: walk(item.children ?? [], depth + 1) };
    });
  return walk(items, 0);
}

function findItem(items: CascaderOption[], key: string): CascaderOption | undefined {
  const path = key.split("-").map(Number);
  let list = items;
  let item: CascaderOption | undefined;
  for (const idx of path) {
    item = list[idx];
    if (!item) return undefined;
    list = item.children ?? [];
  }
  return item;
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ width: 42, flexShrink: 0, fontSize: 11, color: "text.secondary" }}>
      {children}
    </Typography>
  );
}

export function CascaderOptionsEditor({ value, onChange }: CascaderOptionsEditorProps) {
  const tree = useMemo(() => parseCascaderStaticOptions(value), [value]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const commit = useCallback(
    (next: CascaderOption[]) => {
      onChange(serializeCascaderTree(next));
    },
    [onChange],
  );

  const updateItem = useCallback(
    (key: string, patch: Partial<CascaderOption>) => {
      commit(mapTree(tree, (item) => ({ ...item, ...patch }), key));
    },
    [tree, commit],
  );

  const removeItem = useCallback(
    (key: string) => {
      const parsed = parseCascaderStaticOptions(value);
      const parentKey = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : null;
      const path = key.split("-").map(Number);
      const last = path[path.length - 1];
      if (parentKey === null) {
        parsed.splice(last, 1);
      } else {
        const parent = findItem(parsed, parentKey);
        if (parent?.children) {
          parent.children.splice(last, 1);
          if (parent.children.length === 0) delete parent.children;
        }
      }
      commit(parsed);
      if (editingKey === key) setEditingKey(null);
    },
    [value, commit, editingKey],
  );

  const addItem = useCallback(
    (parentKey: string | null) => {
      const parsed = parseCascaderStaticOptions(value);
      const item: CascaderOption = { label: "新选项", value: "new" };
      if (parentKey === null) {
        parsed.push(item);
        commit(parsed);
        setEditingKey(String(parsed.length - 1));
      } else {
        const parent = findItem(parsed, parentKey);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(item);
          commit(parsed);
          setEditingKey(`${parentKey}-${parent.children.length - 1}`);
        }
      }
    },
    [value, commit],
  );

  const moveItem = useCallback(
    (key: string, dir: -1 | 1) => {
      const parsed = parseCascaderStaticOptions(value);
      const parentKey = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : null;
      const path = key.split("-").map(Number);
      const last = path[path.length - 1];
      const list = parentKey === null ? parsed : findItem(parsed, parentKey)?.children;
      if (!list) return;
      const target = last + dir;
      if (target < 0 || target >= list.length) return;
      [list[last], list[target]] = [list[target], list[last]];
      commit(parsed);
    },
    [value, commit],
  );

  const renderRow = (
    item: CascaderOption,
    key: string,
    depth: number,
    ancestorLast: boolean[],
    isLast: boolean,
  ) => {
    const isEditing = editingKey === key;
    const hasKids = (item.children ?? []).length > 0;
    const contentPad = depth === 0 ? 0 : (depth + 1) * 1.75;

    return (
      <Box key={key}>
        <Box sx={{ display: "flex", alignItems: "stretch" }}>
          {ancestorLast.map((aLast, i) => (
            <Box
              key={`g${i}`}
              sx={{ width: 14, flexShrink: 0, borderLeft: aLast ? "none" : "1px solid", borderColor: "divider" }}
            />
          ))}
          {depth > 0 && (
            <Box sx={{ width: 14, flexShrink: 0, position: "relative" }}>
              <Box sx={{ position: "absolute", left: 0, top: 0, height: "50%", borderLeft: "1px solid", borderColor: "divider" }} />
              {!isLast && <Box sx={{ position: "absolute", left: 0, top: "50%", bottom: 0, borderLeft: "1px solid", borderColor: "divider" }} />}
              <Box sx={{ position: "absolute", left: 0, top: "50%", width: 9, borderTop: "1px solid", borderColor: "divider" }} />
            </Box>
          )}

          <Box
            onClick={() => setEditingKey(isEditing ? null : key)}
            sx={{
              flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.5,
              py: 0.25, pl: 0.5, pr: 0.5, borderRadius: 1, cursor: "pointer",
              backgroundColor: isEditing ? "action.selected" : "transparent",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {hasKids ? (
              <Tooltip title={isEditing ? "收起下级" : `${item.children?.length} 个下级`}>
                <Box sx={{ display: "flex", flexShrink: 0 }}>
                  <ChevronRightIcon
                    sx={{ fontSize: 13, color: "text.disabled", transform: isEditing ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
                  />
                </Box>
              </Tooltip>
            ) : (
              <Box sx={{ width: 13, flexShrink: 0 }} />
            )}
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
              {item.label || item.value || "未命名"}
            </Typography>
            <Typography noWrap sx={{ fontSize: 10.5, color: "text.disabled", flexShrink: 0, maxWidth: "45%" }}>
              {item.value || item.label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
              <IconButton size="small" onClick={() => moveItem(key, -1)} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "text.primary" } }}>
                <ArrowUpwardIcon sx={{ fontSize: 13 }} />
              </IconButton>
              <IconButton size="small" onClick={() => moveItem(key, 1)} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "text.primary" } }}>
                <ArrowDownwardIcon sx={{ fontSize: 13 }} />
              </IconButton>
              <IconButton size="small" onClick={() => removeItem(key)} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}>
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {/* 行内编辑表单 */}
        <Collapse in={isEditing} unmountOnExit>
          <Box
            sx={{
              display: "flex", flexDirection: "column", gap: 1,
              pt: 1, pr: 1, pb: 1, pl: contentPad + 1, mt: 0.5, mb: 0.5,
              border: "1px solid", borderColor: "divider", borderRadius: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>显示名</FormLabel>
              <TextField
                size="small" fullWidth
                placeholder="如 浙江"
                value={item.label}
                onChange={(e) => updateItem(key, { label: e.target.value })}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>提交值</FormLabel>
              <TextField
                size="small" fullWidth
                placeholder="留空跟随显示名"
                value={item.value}
                onChange={(e) => updateItem(key, { value: e.target.value })}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>
            <Box
              onClick={() => addItem(key)}
              sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", pl: "50px", color: "primary.main", "&:hover": { opacity: 0.8 } }}
            >
              <AddIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 11.5 }}>添加下级选项</Typography>
            </Box>
          </Box>
        </Collapse>

        {/* 子级 */}
        {item.children && item.children.length > 0 && (
          <Box>
            {item.children.map((child, i) =>
              renderRow(child, `${key}-${i}`, depth + 1, [...ancestorLast, isLast], i === item.children!.length - 1),
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500, mb: 0.25 }}>
        选项树（点击行展开编辑，可加下级）
      </Typography>
      {tree.map((item, i) => renderRow(item, String(i), 0, [], i === tree.length - 1))}
      <Box
        onClick={() => addItem(null)}
        sx={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5,
          cursor: "pointer", py: 0.5, mt: 0.25,
          border: "1px dashed", borderColor: "divider", borderRadius: 1,
          color: "text.secondary", "&:hover": { borderColor: "primary.main", color: "primary.main" },
        }}
      >
        <AddIcon sx={{ fontSize: 15 }} />
        <Typography sx={{ fontSize: 12 }}>添加首级选项</Typography>
      </Box>
    </Box>
  );
}
