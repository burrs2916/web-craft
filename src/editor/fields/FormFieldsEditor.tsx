import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import { useEditorStore } from "../../store/editorStore";
import { componentRegistry } from "../registry";
import type { SceneComponent } from "../../types/editor";

/** 校验类型展示文案 */
function validateLabel(c: Record<string, unknown>): string | null {
  const req = c.required === true;
  const vt = String(c.validateType ?? "none");
  const map: Record<string, string> = {
    email: "邮箱校验",
    phone: "手机号校验",
    number: "数字校验",
    regex: "正则校验",
  };
  const extra = map[vt] ?? (String(c.inputType ?? "") === "email" ? "邮箱校验" : String(c.inputType ?? "") === "number" ? "数字校验" : null);
  if (req && extra) return `必填 · ${extra}`;
  if (req) return "必填";
  return extra;
}

/**
 * 表单容器子元素管理面板（容器配置面板内的"表单字段"分组）。
 * 职责：列出容器内的字段控件，支持排序、删除、点击跳转编辑，以及从面板添加新字段，
 * 并把每个字段的必填/校验状态在容器一处统一总览。
 */
export function FormFieldsEditor() {
  const selectedId = useEditorStore((s) => s.selection.selectedIds[0]);
  const components = useEditorStore((s) => s.components);
  const addComponent = useEditorStore((s) => s.addComponent);
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const selectComponent = useEditorStore((s) => s.selectComponent);

  const container = components.find((c) => c.id === selectedId);
  const children = useMemo<SceneComponent[]>(() => {
    if (!container?.children) return [];
    const map = new Map(components.map((c) => [c.id, c]));
    return container.children
      .map((id) => map.get(id))
      .filter((c): c is SceneComponent => Boolean(c && c.visible !== false));
  }, [container?.children, components]);

  // 可加入表单的控件列表（排除表单容器本身与提交按钮）
  const leafTypes = useMemo(
    () =>
      componentRegistry
        .getByCategory("ccat_form")
        .filter(
          (d) =>
            d.enabled !== false &&
            d.type !== "form-container" &&
            d.type !== "form-button",
        ),
    [],
  );

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (!container) return null;

  const move = (index: number, dir: -1 | 1) => {
    const order = [...(container.children ?? [])];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    updateComponent(container.id, { children: order });
  };

  const addField = (type: string) => {
    setAnchorEl(null);
    const padX = Number(container.config.paddingX ?? 16);
    const padY = Number(container.config.paddingY ?? 12);
    addComponent(type, container.layerId, { x: container.transform.x + padX, y: container.transform.y + padY }, container.id);
  };

  return (
    <Box>
      <Stack direction="row" sx={{ mb: 1, alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary" data-testid="form-fields-count">
          已含 {children.length} 个字段
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          data-testid="form-fields-add"
        >
          添加字段控件
        </Button>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          {leafTypes.map((t) => (
            <MenuItem key={t.type} onClick={() => addField(t.type)}>
              {t.name}
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      {children.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", border: "1px dashed #c3cad6", borderRadius: 1, p: 1.5, textAlign: "center" }}>
          还没有字段。点击上方「添加字段控件」，或将左侧表单控件拖入容器。
        </Typography>
      ) : (
        <List dense disablePadding sx={{ border: "1px solid #e3e7ee", borderRadius: 1 }}>
          {children.map((child, i) => {
            const def = componentRegistry.get(child.type);
            const label = String(child.config.label ?? "") || String(child.config.text ?? "") || (def?.name ?? child.type);
            const vl = validateLabel(child.config);
            const active = child.visible !== false;
            return (
              <ListItemButton
                key={child.id}
                onClick={() => selectComponent(child.id)}
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 0,
                  opacity: active ? 1 : 0.5,
                  "&:hover .fc-field-ops": { visibility: "visible" },
                }}
                data-testid="form-field-row"
              >
                <Stack direction="row" spacing={1} sx={{ width: "100%", minWidth: 0, alignItems: "center" }}>
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {label}
                    <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.75 }}>
                      {def?.name ?? child.type}
                    </Typography>
                  </Typography>
                  {vl && <Chip size="small" label={vl} color={child.config.required === true ? "error" : "default"} variant="outlined" />}
                  <Stack direction="row" className="fc-field-ops" sx={{ visibility: "hidden", flexShrink: 0 }}>
                    <Tooltip title="上移"><IconButton size="small" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, -1); }}><ArrowUpwardIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="下移"><IconButton size="small" disabled={i === children.length - 1} onClick={(e) => { e.stopPropagation(); move(i, 1); }}><ArrowDownwardIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="删除"><IconButton size="small" onClick={(e) => { e.stopPropagation(); removeComponent(child.id); }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                  </Stack>
                </Stack>
              </ListItemButton>
            );
          })}
        </List>
      )}

      {children.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            点击某个字段可选中它，并在本面板下方的配置区编辑其字段名、必填与校验规则。
          </Typography>
        </>
      )}
    </Box>
  );
}