import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import { useEditorStore } from "../../store/editorStore";
import { commitNumberDraft, useClearableNumber } from "../data/numberDraft";
import type { SceneDataSource } from "../../types/scene";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { StaticDataEditor } from "../components/StaticDataEditor";
import { MapEditor } from "../components/MapEditor";

/** 把编辑器输出的 JSON 串转成结构化值存储（与组件自带 staticData 存储一致） */
function storeStatic(raw: string): unknown {
  const t = raw.trim();
  if (!t) return [];
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

/**
 * 定义组件绑定的全局数据源 id（可能指向已删除的源）
 */
function componentSourceId(c: { config?: Record<string, unknown> | null }): string {
  return String(c.config?.dataSourceId ?? "");
}

/**
 * 全局数据源管理面板。
 * 定义场景层"一处数据、多处组件绑定"的数据源，编辑即联动刷新绑定组件。
 * embedded 为 true 时直接渲染内容（用于设置页等页面内嵌），否则以抽屉形式展示。
 */
export function GlobalDataSourcePanel({
  open,
  onClose,
  embedded,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}) {
  const dataSources = useEditorStore((s) => s.dataSources);
  const components = useEditorStore((s) => s.components);
  const addDataSource = useEditorStore((s) => s.addDataSource);
  const removeDataSource = useEditorStore((s) => s.removeDataSource);
  const updateComponentConfig = useEditorStore((s) => s.updateComponentConfig);
  const [selectedId, setSelectedId] = useState<string | null>(dataSources[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 引用了已删除数据源的组件（失效绑定）——集中清理入口
  const orphaned = useMemo(
    () =>
      components.filter((c) => {
        const id = componentSourceId(c);
        return id !== "" && !dataSources.some((d) => d.id === id);
      }),
    [components, dataSources],
  );

  // 当前选中数据源被哪些组件绑定
  const boundComponents = useMemo(
    () => components.filter((c) => componentSourceId(c) === selectedId),
    [selectedId, components],
  );

  const selected = dataSources.find((d) => d.id === selectedId) ?? null;

  const handleAdd = () => {
    const created = addDataSource({ name: `数据源 ${dataSources.length + 1}` });
    setSelectedId(created.id);
  };

  const doRemove = () => {
    if (!selected) return;
    removeDataSource(selected.id);
    setConfirmDelete(false);
    setSelectedId(null);
  };

  const handleRemove = () => {
    if (!selected) return;
    // 有组件绑定 → 先确认，展示爆炸半径；无绑定 → 直接删除
    if (boundComponents.length > 0) setConfirmDelete(true);
    else doRemove();
  };

  const unbindAll = () => {
    for (const c of orphaned) updateComponentConfig(c.id, { dataSourceId: "" });
  };

  const body = (
    <>
      {/* 失效绑定集中清理 */}
      {orphaned.length > 0 && (
        <Box
          sx={{
            m: embedded ? 0 : 1.5,
            mb: embedded ? 1.5 : undefined,
            p: 1,
            borderRadius: 1,
            border: "1px solid rgba(255,160,0,0.5)",
            bgcolor: "rgba(255,180,60,0.08)",
          }}
        >
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 16, color: "#b25f00" }} />
            <Typography variant="caption" sx={{ color: "#b25f00", fontWeight: 600 }}>
              {orphaned.length} 个组件引用了已被删除的数据源，当前回退到各自自带数据
            </Typography>
          </Stack>
          <List dense disablePadding>
            {orphaned.map((c) => (
              <Stack key={c.id} direction="row" spacing={1} sx={{ alignItems: "center", py: 0.25 }}>
                <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                  {c.name}
                </Typography>
                <Button
                  size="small"
                  color="warning"
                  startIcon={<LinkOffIcon sx={{ fontSize: 13 }} />}
                  sx={{ textTransform: "none", fontSize: 11, flexShrink: 0 }}
                  onClick={() => updateComponentConfig(c.id, { dataSourceId: "" })}
                >
                  解除绑定
                </Button>
              </Stack>
            ))}
          </List>
          {orphaned.length > 1 && (
            <Button
              size="small"
              color="warning"
              onClick={unbindAll}
              sx={{ textTransform: "none", fontSize: 11, mt: 0.5 }}
            >
              全部解除绑定
            </Button>
          )}
        </Box>
      )}

      <Stack direction="row" sx={{ flex: 1, minHeight: embedded ? 440 : 0 }}>
        {/* 左侧：数据源列表 */}
        <Box sx={{ width: embedded ? 200 : 190, p: 1, borderRight: "1px solid #e6e9ef", display: "flex", flexDirection: "column" }}>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAdd} sx={{ textTransform: "none", mb: 1 }} data-testid="gds-add">
            新增数据源
          </Button>
          <List dense disablePadding sx={{ flex: 1, overflow: "auto" }}>
            {dataSources.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: "block" }}>
                还没有数据源
              </Typography>
            )}
            {dataSources.map((d) => (
              <ListItemButton
                key={d.id}
                selected={d.id === selectedId}
                onClick={() => setSelectedId(d.id)}
                sx={{ px: 1, py: 0.5, borderRadius: 1 }}
                data-testid="gds-item"
              >
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                  {d.name}
                </Typography>
                <Chip size="small" label={d.dataMode === "api" ? "接口" : "静态"} sx={{ height: 18, fontSize: 10 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* 右侧：编辑、绑定组件清单与预览 */}
        <Box sx={{ flex: 1, minWidth: 0, p: 2, overflow: "auto" }}>
          {!selected ? (
            <Typography variant="caption" color="text.secondary">
              选择或新增一个数据源
            </Typography>
          ) : (
            <>
              <DataSourceEditor
                key={selected.id}
                ds={selected}
                boundCount={boundComponents.length}
                onRemove={handleRemove}
              />
              {boundComponents.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    绑定此数据源的组件（{boundComponents.length}）
                  </Typography>
                  <Box sx={{ mt: 0.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
                    {boundComponents.map((c) => (
                      <Box
                        key={c.id}
                        sx={{
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          border: "1px solid #e6e9ef",
                          bgcolor: "#fafbfc",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                          {c.name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Box>
      </Stack>
    </>
  );

  const deleteDialog = (
    <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>删除数据源「{selected?.name}」？</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: 13, mb: 1 }}>
          有 {boundComponents.length} 个组件绑定了该数据源，删除后它们将失效并回退到本组件自带数据。
        </DialogContentText>
        <List dense disablePadding>
          {boundComponents.map((c) => (
            <Typography key={c.id} variant="caption" component="div" sx={{ py: 0.25 }}>
              · {c.name}
            </Typography>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => setConfirmDelete(false)} sx={{ textTransform: "none" }}>
          取消
        </Button>
        <Button size="small" color="error" variant="contained" onClick={doRemove} startIcon={<DeleteOutlineIcon />} sx={{ textTransform: "none" }}>
          确认删除
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (embedded) {
    return (
      <>
        {body}
        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <Drawer anchor="right" open={open} onClose={onClose} data-testid="global-datasource-panel">
        <Box sx={{ width: 560, display: "flex", flexDirection: "column", height: "100%" }}>
          <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e6e9ef" }}>
            <Typography variant="subtitle2">全局数据源</Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {body}
        </Box>
      </Drawer>
      {deleteDialog}
    </>
  );
}

function DataSourceEditor({
  ds,
  boundCount,
  onRemove,
}: {
  ds: SceneDataSource;
  boundCount: number;
  onRemove: () => void;
}) {
  const updateDataSource = useEditorStore((s) => s.updateDataSource);
  // 可清空草稿层：轮询间隔（0=仅一次 是显式输入值；清空失焦 = 保持原值）
  const apiIntervalDraft = useClearableNumber(ds.apiInterval ?? 0);
  const [name, setName] = useState(ds.name);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TextField
          size="small"
          label="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== ds.name) updateDataSource(ds.id, { name: name.trim() });
            else setName(ds.name);
          }}
          sx={{ flex: 1, mr: 0 }}
        />
        <Button size="small" color="error" variant="outlined" onClick={onRemove} startIcon={<DeleteOutlineIcon />} sx={{ textTransform: "none", flexShrink: 0 }}>
          删除
        </Button>
      </Stack>

      <Box>
        <Typography variant="caption" color="text.secondary">
          数据模式
        </Typography>
        <Select
          size="small"
          fullWidth
          value={ds.dataMode}
          onChange={(e) => updateDataSource(ds.id, { dataMode: e.target.value as "static" | "api", staticData: ds.staticData })}
          data-testid="gds-mode"
        >
          <MenuItem value="static">静态数据</MenuItem>
          <MenuItem value="api">接口读取</MenuItem>
        </Select>
      </Box>

      {ds.dataMode === "static" ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            静态数据（编辑后绑定组件即时联动）
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <StaticDataEditor
              value={ds.staticData}
              onChange={(next) => updateDataSource(ds.id, { staticData: storeStatic(next) }, { silent: true })}
            />
          </Box>
        </Box>
      ) : (
        <>
          <TextField
            size="small"
            label="API 地址"
            placeholder="https://api.example.com/metrics"
            value={String(ds.apiUrl ?? "")}
            onChange={(e) => updateDataSource(ds.id, { apiUrl: e.target.value }, { silent: true })}
            fullWidth
          />
          <TextField
            size="small"
            label="接口路径"
            placeholder="metrics/cpu"
            value={String(ds.apiPath ?? "")}
            onChange={(e) => updateDataSource(ds.id, { apiPath: e.target.value }, { silent: true })}
            fullWidth
          />
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                请求方式
              </Typography>
              <Select
                size="small"
                fullWidth
                value={ds.apiMethod ?? "GET"}
                onChange={(e) => updateDataSource(ds.id, { apiMethod: e.target.value as "GET" | "POST" }, { silent: true })}
              >
                <MenuItem value="GET">GET</MenuItem>
                <MenuItem value="POST">POST</MenuItem>
              </Select>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                轮询间隔（秒）
              </Typography>
              <TextField
                size="small"
                type="number"
                fullWidth
                placeholder="0=仅一次"
                value={apiIntervalDraft.display}
                onChange={(e) => {
                  const n = apiIntervalDraft.change(e.target.value);
                  if (n !== null) updateDataSource(ds.id, { apiInterval: n }, { silent: true });
                }}
                onBlur={() => {
                  const t = apiIntervalDraft.end();
                  if (t === null) return;
                  const c = commitNumberDraft(t, { min: 0, empty: 'keep' });
                  if (c !== null && c !== undefined && c !== (ds.apiInterval ?? 0)) {
                    updateDataSource(ds.id, { apiInterval: c }, { silent: true });
                  }
                }}
              />
            </Box>
          </Stack>
          <TextField
            size="small"
            label="取值路径"
            placeholder="data.items"
            value={String(ds.apiDataPath ?? "")}
            onChange={(e) => updateDataSource(ds.id, { apiDataPath: e.target.value }, { silent: true })}
            fullWidth
          />
          {ds.apiMethod === "POST" && (
            <Box>
              <MapEditor
                label="请求体（键值对）"
                valuePlaceholder="值"
                value={ds.apiBody}
                onChange={(next) => updateDataSource(ds.id, { apiBody: next }, { silent: true })}
              />
            </Box>
          )}
          <Box>
            <MapEditor
              label="请求头（键值对）"
              keyPlaceholder="Header 名"
              valuePlaceholder="值"
              value={ds.apiHeaders}
              onChange={(next) => updateDataSource(ds.id, { apiHeaders: next }, { silent: true })}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              认证方式
            </Typography>
            <Select
              size="small"
              fullWidth
              value={ds.authEnabled === null ? "follow" : ds.authEnabled ? "enabled" : "disabled"}
              onChange={(e) => {
                const v = e.target.value;
                updateDataSource(ds.id, { authEnabled: v === "follow" ? null : v === "enabled" }, { silent: true });
              }}
            >
              <MenuItem value="follow">跟随全局</MenuItem>
              <MenuItem value="enabled">强制认证</MenuItem>
              <MenuItem value="disabled">公开访问</MenuItem>
            </Select>
          </Box>
        </>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip size="small" label={`被 ${boundCount} 个组件绑定`} variant="outlined" />
        {boundCount > 0 && boundCount === 1 && <Chip size="small" label="改动将即时联动刷新" />}
      </Box>

      <Divider />
      <DataSourcePreview ds={ds} />
    </Stack>
  );
}

function DataSourcePreview({ ds }: { ds: SceneDataSource }) {
  const { data, loading, error } = useApiDataFetch<unknown>(ds);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        数据预览
      </Typography>
      <Box sx={{ mt: 0.5, border: "1px solid #e6e9ef", borderRadius: 1, p: 1, maxHeight: 220, overflow: "auto" }}>
        {loading ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", p: 1 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              加载中…
            </Typography>
          </Stack>
        ) : error ? (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        ) : Array.isArray(data) ? (
          <ArrayPreview rows={data} />
        ) : data !== null && typeof data === "object" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
              <Box key={k} sx={{ display: "flex", gap: 1, fontSize: 11 }}>
                <Typography variant="caption" sx={{ color: "text.secondary", minWidth: 90, flexShrink: 0 }}>
                  {k}
                </Typography>
                <Typography variant="caption" noWrap>
                  {v == null ? "null" : Array.isArray(v) ? `数组 · ${v.length} 项` : typeof v === "object" ? "对象" : String(v)}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography variant="caption">{String(data ?? "（无数据）")}</Typography>
        )}
      </Box>
    </Box>
  );
}

function ArrayPreview({ rows }: { rows: unknown[] }) {
  const cols = useMemo(() => {
    const map = new Map<string, number>();
    rows.slice(0, 20).forEach((r) => {
      if (r && typeof r === "object" && !Array.isArray(r)) {
        Object.keys(r as Record<string, unknown>).forEach((k) => map.set(k, map.size));
      }
    });
    return Array.from(map.keys());
  }, [rows]);

  if (cols.length === 0) {
    return <Typography variant="caption">{rows.length > 0 ? `${rows.length} 行` : "（空数组）"}</Typography>;
  }

  const previewRows = rows.slice(0, 20);
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {cols.map((c) => (
            <TableCell key={c} sx={{ p: 0.5, fontSize: 10, fontWeight: 600, borderBottom: "1px solid #e6e9ef" }}>
              {c}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {previewRows.map((row, i) => (
          <TableRow key={i}>
            {cols.map((c) => (
              <TableCell key={c} sx={{ p: 0.5, fontSize: 10, borderBottom: "1px solid #f0f2f5", maxWidth: 140 }}>
                <Typography variant="caption" noWrap>
                  {String((row as Record<string, unknown>)[c] ?? "")}
                </Typography>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}