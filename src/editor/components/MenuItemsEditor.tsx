import { useMemo, useState, useCallback, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MuiMenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Collapse from "@mui/material/Collapse";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LinkIcon from "@mui/icons-material/Link";
import CloseIcon from "@mui/icons-material/Close";
import Divider from "@mui/material/Divider";

import { useEditorStore } from "../../store/editorStore";
import { parsePanes } from "../utils/panes";
import { useIconStore } from "../../store/iconStore";
import { IconPicker, ICON_CATEGORIES } from "../../components/component";
import { resolveIcon } from "../plugins";
import {
  parseMenuItems,
  serializeMenuItems,
  LINK_TYPE_LABELS,
  type MenuItem,
  type MenuLinkType,
} from "../utils/menuItems";

interface MenuItemsEditorProps {
  value: string;
  onChange: (serialized: string) => void;
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
  nested?: boolean;
}

function mapTree(items: MenuItem[], fn: (item: MenuItem) => MenuItem, key: string): MenuItem[] {
  const path = key.split("-").map(Number);
  const walk = (list: MenuItem[], depth: number): MenuItem[] =>
    list.map((item, i) => {
      if (i !== path[depth]) return item;
      if (depth === path.length - 1) return fn(item);
      return { ...item, children: walk(item.children ?? [], depth + 1) };
    });
  return walk(items, 0);
}

function findItem(items: MenuItem[], key: string): MenuItem | undefined {
  const path = key.split("-").map(Number);
  let list = items;
  let item: MenuItem | undefined;
  for (const idx of path) {
    item = list[idx];
    if (!item) return undefined;
    list = item.children ?? [];
  }
  return item;
}

function describeIcon(icon: string | undefined, customNames: Record<string, string>): string {
  if (!icon) return "未设置，点击选择图标";
  if (icon.startsWith("custom-")) return customNames[icon.slice(7)] ?? "自定义图标";
  if (icon.startsWith("material:")) {
    const key = icon.slice(9);
    return ICON_CATEGORIES.flatMap((c) => c.items).find((i) => i.key === key)?.label ?? key;
  }
  if (/^\p{Emoji}/u.test(icon) && icon.length <= 2) return icon;
  if (icon.startsWith("http")) return "网络图标";
  return icon;
}

function FormLabel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Typography sx={{ width: 50, flexShrink: 0, fontSize: 11, color: "text.secondary", ...(sx ?? {}) }}>
      {children}
    </Typography>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
        {children}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
    </Box>
  );
}

function ColorField({
  value, onChange, placeholder, onClear,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  onClear?: () => void;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
      <input
        type="color"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{ width: 32, height: 24, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", padding: 0, background: "none" }}
      />
      <TextField
        size="small" fullWidth
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
      />
      {value && onClear && (
        <Tooltip title="清除">
          <IconButton size="small" onClick={onClear} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}>
            <CloseIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export function MenuItemsEditor({
  value, onChange, activeKey, onActiveKeyChange, nested = true,
}: MenuItemsEditorProps) {
  const views = useEditorStore((s) => s.views);
  const components = useEditorStore((s) => s.components);
  const customIcons = useIconStore((s) => s.icons);
  const iconsLoaded = useIconStore((s) => s.loaded);
  const iconsLoading = useIconStore((s) => s.loading);
  const fetchIcons = useIconStore((s) => s.fetchAll);

  useEffect(() => {
    if (!iconsLoaded && !iconsLoading) fetchIcons().catch(() => {});
  }, [iconsLoaded, iconsLoading, fetchIcons]);

  const items = useMemo(() => parseMenuItems(value), [value]);
  const customNames = useMemo(
    () => Object.fromEntries(customIcons.map((i) => [i.id, i.name])),
    [customIcons],
  );

  const availablePanes = useMemo(() => {
    const panels = components.filter((c) => c.type === "content-panel");
    const panes: { id: string; name: string; compName: string }[] = [];
    for (const panel of panels) {
      for (const p of parsePanes(panel.config?.panes)) {
        panes.push({ id: p.id, name: p.name || p.id, compName: panel.name });
      }
    }
    return panes;
  }, [components]);

  const availableModals = useMemo(() => {
    const modals = components.filter((c) => c.type === "content-modal");
    const result: { id: string; name: string; compName: string }[] = [];
    for (const comp of modals) {
      const modalsRaw = String(comp.config?.modals ?? "").trim();
      if (!modalsRaw.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(modalsRaw);
        if (Array.isArray(parsed)) {
          for (const m of parsed) {
            const mid = String(m.id ?? "");
            if (mid) result.push({ id: mid, name: String(m.name ?? mid), compName: comp.name });
          }
        }
      } catch { /* skip */ }
    }
    return result;
  }, [components]);

  const availableDrawers = useMemo(() => {
    const drawers = components.filter((c) => c.type === "content-drawer");
    const result: { id: string; name: string; compName: string }[] = [];
    for (const comp of drawers) {
      const drawersRaw = String(comp.config?.modals ?? "").trim();
      if (!drawersRaw.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(drawersRaw);
        if (Array.isArray(parsed)) {
          for (const m of parsed) {
            const mid = String(m.id ?? "");
            if (mid) result.push({ id: mid, name: String(m.name ?? mid), compName: comp.name });
          }
        }
      } catch { /* skip */ }
    }
    return result;
  }, [components]);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [iconOpenKey, setIconOpenKey] = useState<string | null>(null);

  const commit = useCallback((next: MenuItem[]) => {
    onChange(serializeMenuItems(next));
  }, [onChange]);

  const updateItem = useCallback((key: string, patch: Partial<MenuItem>) => {
    commit(mapTree(parseMenuItems(value), (item) => ({ ...item, ...patch }), key));
  }, [value, commit]);

  const removeItem = useCallback((key: string) => {
    const parentKey = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : null;
    const parsed = parseMenuItems(value);
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
  }, [value, commit, editingKey]);

  const addItem = useCallback((parentKey: string | null, isDividerItem = false) => {
    const parsed = parseMenuItems(value);
    const item: MenuItem = isDividerItem
      ? { label: "", linkType: "none", isDivider: true }
      : { label: "新菜单项", linkType: "none" };
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
  }, [value, commit]);

  const moveItem = useCallback((key: string, dir: -1 | 1) => {
    const parsed = parseMenuItems(value);
    const parentKey = key.includes("-") ? key.slice(0, key.lastIndexOf("-")) : null;
    const path = key.split("-").map(Number);
    const last = path[path.length - 1];
    const list = parentKey === null ? parsed : findItem(parsed, parentKey)?.children;
    if (!list) return;
    const target = last + dir;
    if (target < 0 || target >= list.length) return;
    [list[last], list[target]] = [list[target], list[last]];
    commit(parsed);
  }, [value, commit]);

  const toggleActive = useCallback((key: string) => {
    if (!onActiveKeyChange) return;
    onActiveKeyChange(activeKey === key ? "" : key);
  }, [activeKey, onActiveKeyChange]);

  const renderRow = (item: MenuItem, key: string, depth: number, ancestorLast: boolean[], isLast: boolean) => {
    const isEditing = editingKey === key;
    const isActive = activeKey === key;

    // 分割符项特殊渲染
    if (item.isDivider) {
      return (
        <Box key={key}>
          <Box sx={{ display: "flex", alignItems: "stretch" }}>
            {ancestorLast.map((aLast, i) => (
              <Box key={`g${i}`} sx={{ width: 14, flexShrink: 0, borderLeft: aLast ? "none" : "1px solid", borderColor: "divider" }} />
            ))}
            {depth > 0 && <Box sx={{ width: 14, flexShrink: 0 }} />}
            <Box
              onClick={() => setEditingKey(isEditing ? null : key)}
              sx={{
                flex: 1, display: "flex", alignItems: "center", gap: 0.5,
                py: 0.25, pl: 0.5, pr: 0.5, borderRadius: 1, cursor: "pointer",
                backgroundColor: isEditing ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <Divider sx={{ flex: 1 }} />
              {item.groupTitle && (
                <Typography sx={{ fontSize: 10, color: "text.disabled", fontStyle: "italic", whiteSpace: "nowrap" }}>
                  {item.groupTitle}
                </Typography>
              )}
              <Divider sx={{ flex: 1 }} />
              <Box sx={{ display: "flex", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
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
          <Collapse in={isEditing} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 1, pr: 1, pb: 1, pl: (depth + 1) * 1.75 + 1, mt: 0.5, mb: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <FormLabel>标题</FormLabel>
                <TextField
                  size="small" fullWidth placeholder="分组标题（可选）"
                  value={item.groupTitle ?? ""}
                  onChange={(e) => updateItem(key, { groupTitle: e.target.value || undefined })}
                  sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
                />
              </Box>
            </Box>
          </Collapse>
        </Box>
      );
    }

    const linkLabel = item.linkType && item.linkType !== "none"
      ? (item.linkType === "page"
        ? `页面: ${views.find((v) => v.id === item.href)?.name ?? "未选择"}`
        : item.linkType === "pane"
          ? `面板: ${availablePanes.find((p) => p.id === item.href)?.name ?? item.href ?? "未选择"}`
          : item.linkType === "modal"
            ? `弹出框: ${availableModals.find((m) => m.id === item.href)?.name ?? item.href ?? "未选择"}`
            : item.linkType === "drawer"
              ? `抽屉: ${availableDrawers.find((d) => d.id === item.href)?.name ?? item.href ?? "未选择"}`
              : item.linkType === "anchor"
              ? `锚点: ${item.href || "未填"}`
              : item.href || "未填链接")
      : null;
    const contentPad = depth === 0 ? 0 : (depth + 1) * 1.75;

    return (
      <Box key={key}>
        <Box sx={{ display: "flex", alignItems: "stretch" }}>
          {ancestorLast.map((aLast, i) => (
            <Box key={`g${i}`} sx={{ width: 14, flexShrink: 0, borderLeft: aLast ? "none" : "1px solid", borderColor: "divider" }} />
          ))}
          {depth > 0 && (
            <Box sx={{ width: 14, flexShrink: 0, position: "relative" }}>
              <Box sx={{ position: "absolute", left: 0, top: 0, height: "50%", borderLeft: "1px solid", borderColor: "divider" }} />
              {!isLast && <Box sx={{ position: "absolute", left: 0, top: "50%", bottom: 0, borderLeft: "1px solid", borderColor: "divider" }} />}
              <Box sx={{ position: "absolute", left: 0, top: "50%", width: 9, borderTop: "1px solid", borderColor: "divider" }} />
            </Box>
          )}

          {/* 行内容 */}
          <Box
            onClick={() => { setEditingKey(isEditing ? null : key); setIconOpenKey(null); }}
            sx={{
              flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.5,
              py: 0.25, pl: 0.5, pr: 0.5, borderRadius: 1, cursor: "pointer",
              backgroundColor: isEditing ? "action.selected" : "transparent",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {isActive && (
              <Tooltip title="默认高亮项">
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
              </Tooltip>
            )}
            {item.icon && <Box sx={{ display: "inline-flex", flexShrink: 0 }}>{resolveIcon(item.icon, undefined, 14)}</Box>}
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: isActive ? 600 : 400, color: item.disabled ? "text.disabled" : "text.primary", textDecoration: item.disabled ? "line-through" : "none" }}>
              {item.label || "未命名"}
            </Typography>
            {/* 徽标指示器 */}
            {item.badge && (
              <Box sx={{
                px: 0.5, borderRadius: 99, fontSize: 9, fontWeight: 600, lineHeight: "14px",
                bgcolor: item.badgeBg ?? "error.main", color: item.badgeColor ?? "#fff",
                flexShrink: 0, maxWidth: 40, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {item.badge}
              </Box>
            )}
            {/* 快捷键指示器 */}
            {item.shortcut && (
              <Typography sx={{ fontSize: 9, color: "text.disabled", flexShrink: 0, px: 0.25, border: "1px solid", borderColor: "divider", borderRadius: 0.5, lineHeight: "14px" }}>
                {item.shortcut}
              </Typography>
            )}
            {linkLabel && (
              <Tooltip title={linkLabel}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "primary.main", flexShrink: 0 }}>
                  <LinkIcon sx={{ fontSize: 12 }} />
                  <Typography noWrap sx={{ fontSize: 10, maxWidth: 70 }}>{linkLabel}</Typography>
                </Box>
              </Tooltip>
            )}
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
            <ChevronRightIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0, transform: isEditing ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
          </Box>
        </Box>

        {/* 行内编辑表单 */}
        <Collapse in={isEditing} unmountOnExit>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1, pr: 1, pb: 1, pl: contentPad + 1, mt: 0.5, mb: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {/* 基础 */}
            <SectionTitle>基础</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>名称</FormLabel>
              <TextField size="small" fullWidth value={item.label} onChange={(e) => updateItem(key, { label: e.target.value })} sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }} />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>颜色</FormLabel>
              <ColorField value={item.color} onChange={(v) => updateItem(key, { color: v })} placeholder="跟随全局" onClear={() => updateItem(key, { color: undefined })} />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>图标</FormLabel>
              <Box onClick={() => setIconOpenKey(iconOpenKey === key ? null : key)} sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1, pt: 0.5, pb: 0.5, pl: 0.75, pr: 0.5, border: "1px solid", borderColor: iconOpenKey === key ? "primary.main" : "divider", borderRadius: 1, cursor: "pointer", "&:hover": { borderColor: "primary.main", backgroundColor: "action.hover" } }}>
                <Box sx={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover", borderRadius: 0.5, flexShrink: 0, color: "text.secondary" }}>
                  {item.icon ? resolveIcon(item.icon, undefined, 16) : <AddIcon sx={{ fontSize: 14 }} />}
                </Box>
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 11.5, color: item.icon ? "text.primary" : "text.disabled" }}>
                  {describeIcon(item.icon, customNames)}
                </Typography>
                {item.icon && (
                  <Tooltip title="清除图标">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); updateItem(key, { icon: undefined }); }} sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}>
                      <CloseIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <ChevronRightIcon sx={{ fontSize: 14, color: "text.disabled", transform: iconOpenKey === key ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </Box>
            </Box>

            <Collapse in={iconOpenKey === key} unmountOnExit>
              <Box sx={{ pl: "50px" }}>
                <IconPicker hideCaption value={item.icon ?? ""} defaultValue={item.icon ?? ""} onChange={(v) => updateItem(key, { icon: v || undefined })} />
              </Box>
            </Collapse>

            {/* 链接 */}
            <SectionTitle>链接</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>类型</FormLabel>
              <Select size="small" value={item.linkType ?? "none"} onChange={(e) => updateItem(key, { linkType: e.target.value as MenuLinkType })} sx={{ fontSize: 12.5, width: 110, flexShrink: 0 }}>
                {(Object.keys(LINK_TYPE_LABELS) as MenuLinkType[]).map((t) => (
                  <MuiMenuItem key={t} value={t} sx={{ fontSize: 12.5 }}>{LINK_TYPE_LABELS[t]}</MuiMenuItem>
                ))}
              </Select>
              {item.linkType === "page" && (
                <Select size="small" displayEmpty value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                  <MuiMenuItem value="" disabled sx={{ fontSize: 12.5 }}>选择页面…</MuiMenuItem>
                  {views.map((v) => (<MuiMenuItem key={v.id} value={v.id} sx={{ fontSize: 12.5 }}>{v.name}</MuiMenuItem>))}
                </Select>
              )}
              {item.linkType === "pane" && (
                availablePanes.length > 0 ? (
                  <Select size="small" displayEmpty value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                    <MuiMenuItem value="" disabled sx={{ fontSize: 12.5 }}>选择面板…</MuiMenuItem>
                    {availablePanes.map((p) => (<MuiMenuItem key={p.id} value={p.id} sx={{ fontSize: 12.5 }}>{p.name} ({p.compName})</MuiMenuItem>))}
                  </Select>
                ) : (
                  <Typography sx={{ flex: 1, fontSize: 11, color: "warning.main", fontStyle: "italic" }}>当前视图无内容面板组件</Typography>
                )
              )}
              {item.linkType === "modal" && (
                availableModals.length > 0 ? (
                  <Select size="small" displayEmpty value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                    <MuiMenuItem value="" disabled sx={{ fontSize: 12.5 }}>选择弹出框…</MuiMenuItem>
                    {availableModals.map((m) => (<MuiMenuItem key={m.id} value={m.id} sx={{ fontSize: 12.5 }}>{m.name} ({m.compName})</MuiMenuItem>))}
                  </Select>
                ) : (
                  <Typography sx={{ flex: 1, fontSize: 11, color: "warning.main", fontStyle: "italic" }}>当前视图无弹出框组件</Typography>
                )
              )}
              {item.linkType === "drawer" && (
                availableDrawers.length > 0 ? (
                  <Select size="small" displayEmpty value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                    <MuiMenuItem value="" disabled sx={{ fontSize: 12.5 }}>选择抽屉…</MuiMenuItem>
                    {availableDrawers.map((d) => (<MuiMenuItem key={d.id} value={d.id} sx={{ fontSize: 12.5 }}>{d.name} ({d.compName})</MuiMenuItem>))}
                  </Select>
                ) : (
                  <Typography sx={{ flex: 1, fontSize: 11, color: "warning.main", fontStyle: "italic" }}>当前视图无抽屉组件</Typography>
                )
              )}
              {item.linkType === "url" && (
                <TextField size="small" fullWidth placeholder="https://..." value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }} />
              )}
              {item.linkType === "anchor" && (
                <TextField size="small" fullWidth placeholder="元素 ID（如 section-about）" value={item.href ?? ""} onChange={(e) => updateItem(key, { href: e.target.value })} sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }} />
              )}
              {(!item.linkType || item.linkType === "none") && (
                <Typography sx={{ flex: 1, fontSize: 11, color: "text.disabled", fontStyle: "italic" }}>点击不跳转，可作分组标题</Typography>
              )}
            </Box>

            {/* 徽标 */}
            <SectionTitle>徽标</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>文字</FormLabel>
              <TextField
                size="small" fullWidth placeholder="如 3 / New / 99+"
                value={item.badge ?? ""}
                onChange={(e) => updateItem(key, { badge: e.target.value || undefined })}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>背景色</FormLabel>
              <ColorField value={item.badgeBg} onChange={(v) => updateItem(key, { badgeBg: v })} placeholder="徽标背景" onClear={() => updateItem(key, { badgeBg: undefined })} />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>文字色</FormLabel>
              <ColorField value={item.badgeColor} onChange={(v) => updateItem(key, { badgeColor: v })} placeholder="徽标文字" onClear={() => updateItem(key, { badgeColor: undefined })} />
            </Box>

            {/* 交互 */}
            <SectionTitle>交互</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>快捷键</FormLabel>
              <TextField
                size="small" fullWidth placeholder="如 Ctrl+K"
                value={item.shortcut ?? ""}
                onChange={(e) => updateItem(key, { shortcut: e.target.value || undefined })}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>禁用提示</FormLabel>
              <TextField
                size="small" fullWidth placeholder="禁用时 tooltip 文案"
                value={item.description ?? ""}
                onChange={(e) => updateItem(key, { description: e.target.value || undefined })}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>

            {/* 样式 */}
            <SectionTitle>样式</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>字号</FormLabel>
              <TextField
                size="small" type="number" fullWidth placeholder="跟随全局"
                value={item.fontSize ?? ""}
                onChange={(e) => updateItem(key, { fontSize: e.target.value ? Number(e.target.value) : undefined })}
                slotProps={{ htmlInput: { min: 10, max: 40 } }}
                sx={{ "& .MuiInputBase-input": { fontSize: 12.5 } }}
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>图标色</FormLabel>
              <ColorField value={item.iconColor} onChange={(v) => updateItem(key, { iconColor: v })} placeholder="跟随全局" onClear={() => updateItem(key, { iconColor: undefined })} />
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FormLabel>hover底</FormLabel>
              <ColorField value={item.hoverBg} onChange={(v) => updateItem(key, { hoverBg: v })} placeholder="跟随全局" onClear={() => updateItem(key, { hoverBg: undefined })} />
            </Box>

            {/* 选项 */}
            <SectionTitle>选项</SectionTitle>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, pl: "50px" }}>
              {onActiveKeyChange && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Switch size="small" checked={isActive} onChange={() => toggleActive(key)} />
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>默认高亮</Typography>
                </Box>
              )}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Switch size="small" checked={item.disabled === true} onChange={(e) => updateItem(key, { disabled: e.target.checked })} />
                <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>禁用</Typography>
              </Box>
              {item.linkType === "url" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Switch size="small" checked={item.newTab !== false} onChange={(e) => updateItem(key, { newTab: e.target.checked })} />
                  <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>新窗口</Typography>
                </Box>
              )}
            </Box>

            {nested && (
              <Box onClick={() => addItem(key)} sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", pl: "50px", color: "primary.main", "&:hover": { opacity: 0.8 } }}>
                <AddIcon sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: 11.5 }}>添加子菜单项</Typography>
              </Box>
            )}
          </Box>
        </Collapse>

        {/* 子级 */}
        {nested && item.children && item.children.length > 0 && (
          <Box>
            {item.children.map((child, i) =>
              renderRow(child, `${key}-${i}`, depth + 1, [...ancestorLast, isLast], i === (item.children?.length ?? 0) - 1),
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500, mb: 0.25 }}>
        菜单项（点击行展开编辑）
      </Typography>
      {items.length === 0 && (
        <Typography sx={{ fontSize: 11.5, color: "text.disabled", fontStyle: "italic", py: 1, textAlign: "center" }}>
          暂无菜单项
        </Typography>
      )}
      {items.map((item, i) => renderRow(item, String(i), 0, [], i === items.length - 1))}
      <Box sx={{ display: "flex", gap: 0.5, mt: 0.25 }}>
        <Box
          onClick={() => addItem(null)}
          sx={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5,
            cursor: "pointer", py: 0.5,
            border: "1px dashed", borderColor: "divider", borderRadius: 1,
            color: "text.secondary", "&:hover": { borderColor: "primary.main", color: "primary.main" },
          }}
        >
          <AddIcon sx={{ fontSize: 15 }} />
          <Typography sx={{ fontSize: 12 }}>添加菜单项</Typography>
        </Box>
        <Box
          onClick={() => addItem(null, true)}
          sx={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5,
            cursor: "pointer", py: 0.5, px: 1,
            border: "1px dashed", borderColor: "divider", borderRadius: 1,
            color: "text.secondary", "&:hover": { borderColor: "primary.main", color: "primary.main" },
          }}
        >
          <Divider sx={{ width: 15 }} />
          <Typography sx={{ fontSize: 12 }}>分割线</Typography>
        </Box>
      </Box>
    </Box>
  );
}
