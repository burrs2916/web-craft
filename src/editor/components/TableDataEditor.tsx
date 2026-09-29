import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import EditIcon from "@mui/icons-material/Edit";
import {
  type ColumnDef,
  csvToTableModel,
  tableModelToCSV,
  parseColumnDefs,
} from "../data/tableData";

/** 字段名是否被占用（空或与已存在列重复）——编辑器内唯一性校验的单一口径 */
export function isFieldTaken(columns: ColumnDef[], idx: number, field: string): boolean {
  const f = field.trim();
  if (f === "") return true;
  return columns.some((c, i) => i !== idx && (c.field ?? "") === f);
}

interface TableDataModel {
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
}

interface TableDataEditorProps {
  value?: unknown;
  onChange: (next: string) => void;
  help?: string;
}

export function TableDataEditor({ value, onChange, help }: TableDataEditorProps) {
  const model = useMemo<TableDataModel>(() => {
    const fallback: TableDataModel = { columns: [], rows: [] };
    if (value == null) return fallback;
    if (typeof value === "string") {
      try { return parseModel(JSON.parse(value)); } catch { return fallback; }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return parseModel(value as Record<string, unknown>);
    }
    return fallback;
  }, [value]);

  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);
  // 字段名编辑态：保留用户输入以便显示重复/空错误，未通过校验前不写入 model
  const [fieldDraft, setFieldDraft] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  useEffect(() => { setFieldDraft(null); setFieldError(null); }, [editingCol]);

  // ── CSV 导入 / 导出 ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importHasHeader, setImportHasHeader] = useState(true);

  const handleExportCSV = () => {
    const csv = tableModelToCSV({ columns: model.columns, rows: model.rows });
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "table.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = () => {
    const parsed = csvToTableModel(importText, importHasHeader);
    if (parsed.columns.length === 0) return;
    // 导入整体替换现有列与数据
    updateModel({ columns: parsed.columns, rows: parsed.rows });
    setImportOpen(false);
    setImportText("");
  };

  const updateModel = (next: TableDataModel) => {
    onChange(JSON.stringify(next));
  };

  // ── 列操作 ──
  const addColumn = () => {
    let colNo = model.columns.length + 1;
    let field = `col${colNo}`;
    while (model.columns.some((c) => (c.field ?? "") === field)) { colNo += 1; field = `col${colNo}`; }
    const newCol: ColumnDef = {
      field,
      header: `列${colNo}`,
      type: "text",
      align: "left",
      sortable: true,
      visible: true,
    };
    const newColumns = [...model.columns, newCol];
    const newRows = model.rows.map((row) => ({ ...row, [field]: "" }));
    updateModel({ columns: newColumns, rows: newRows });
  };

  const removeColumn = (idx: number) => {
    const col = model.columns[idx];
    if (!col) return;
    const newColumns = model.columns.filter((_, i) => i !== idx);
    const newRows = model.rows.map((row) => {
      const next = { ...row };
      delete next[col.field];
      return next;
    });
    updateModel({ columns: newColumns, rows: newRows });
    if (editingCol === idx) setEditingCol(null);
    else if (editingCol !== null && editingCol > idx) setEditingCol(editingCol - 1);
  };

  const updateColumn = (idx: number, patch: Partial<ColumnDef>) => {
    const oldCol = model.columns[idx];
    if (!oldCol) return;
    // 防御：字段名唯一性（空或与已有列重复则忽略），防止经 updateColumn 静默覆盖数据
    if (patch.field !== undefined) {
      if (isFieldTaken(model.columns, idx, patch.field)) return;
      patch = { ...patch, field: String(patch.field).trim() };
    }
    const newCol = { ...oldCol, ...patch };
    const newColumns = model.columns.map((c, i) => (i === idx ? newCol : c));
    // field 变化时同步更新所有行的键名
    let newRows = model.rows;
    if (patch.field !== undefined && patch.field !== oldCol.field) {
      newRows = model.rows.map((row) => {
        const next = { ...row };
        next[patch.field!] = next[oldCol.field];
        delete next[oldCol.field];
        return next;
      });
    }
    updateModel({ columns: newColumns, rows: newRows });
  };

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= model.columns.length) return;
    const cols = [...model.columns];
    [cols[idx], cols[target]] = [cols[target], cols[idx]];
    updateModel({ columns: cols, rows: model.rows });
  };

  // ── 行操作 ──
  const addRow = () => {
    const newRow: Record<string, unknown> = {};
    model.columns.forEach((col) => { newRow[col.field] = ""; });
    updateModel({ columns: model.columns, rows: [...model.rows, newRow] });
  };

  const removeRow = (idx: number) => {
    updateModel({ columns: model.columns, rows: model.rows.filter((_, i) => i !== idx) });
  };

  const updateCell = (rowIdx: number, field: string, val: string) => {
    const newRows = model.rows.map((row, i) =>
      i === rowIdx ? { ...row, [field]: coerceCell(val) } : row
    );
    updateModel({ columns: model.columns, rows: newRows });
  };

  // ── 高级模式 ──
  if (advanced) {
    return (
      <Box sx={{ width: "100%" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 0.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setAdvanced(false)}
            sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "text.secondary" }}
            startIcon={<EditIcon sx={{ fontSize: 13 }} />}
          >
            返回可视化编辑
          </Button>
        </Box>
        <TextField
          size="small"
          fullWidth
          multiline
          rows={8}
          value={JSON.stringify(model, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(JSON.stringify(parsed));
            } catch {
              onChange(e.target.value);
            }
          }}
          sx={{ "& .MuiInputBase-input": { fontSize: 11, fontFamily: "monospace" } }}
        />
        {help && (
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
            {help}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 0.5 }}>
        <Button
          size="small"
          variant="text"
          onClick={() => setAdvanced(true)}
          sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "text.secondary" }}
          startIcon={<EditIcon sx={{ fontSize: 13 }} />}
        >
          高级模式（JSON）
        </Button>
      </Box>

      {/* 列定义区域 */}
      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>列定义</Typography>
          <Button
            size="small"
            variant="text"
            onClick={addColumn}
            sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "#0D9488" }}
            startIcon={<AddIcon sx={{ fontSize: 13 }} />}
          >
            添加列
          </Button>
        </Box>

        {model.columns.length === 0 && (
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mb: 0.5 }}>
            暂无列，点击「添加列」开始配置
          </Typography>
        )}

        {model.columns.map((col, idx) => (
          <Box
            key={col.field + idx}
            sx={{
              border: "1px solid",
              borderColor: editingCol === idx ? "primary.main" : "rgba(128,128,128,0.2)",
              borderRadius: 1,
              mb: 0.5,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                p: 0.5,
                bgcolor: editingCol === idx ? "rgba(13,148,136,0.06)" : "rgba(128,128,128,0.04)",
                cursor: "pointer",
              }}
              onClick={() => setEditingCol(editingCol === idx ? null : idx)}
            >
              <Typography
                variant="caption"
                sx={{ flex: 1, fontWeight: 600, color: "text.primary", fontSize: 11 }}
              >
                {col.header || col.field}
                <Typography component="span" variant="caption" sx={{ color: "text.disabled", ml: 0.5, fontSize: 10 }}>
                  ({col.field})
                </Typography>
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); moveColumn(idx, -1); }}
                disabled={idx === 0}
                sx={{ p: 0.1, color: "text.disabled", "&:hover": { color: "text.primary" } }}
              >
                <ArrowUpwardIcon sx={{ fontSize: 11 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); moveColumn(idx, 1); }}
                disabled={idx === model.columns.length - 1}
                sx={{ p: 0.1, color: "text.disabled", "&:hover": { color: "text.primary" } }}
              >
                <ArrowDownwardIcon sx={{ fontSize: 11 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); removeColumn(idx); }}
                sx={{ p: 0.1, color: "text.disabled", "&:hover": { color: "error.main" } }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 11 }} />
              </IconButton>
            </Box>

            {editingCol === idx && (
              <Box sx={{ p: 0.75, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                <TextField
                  size="small"
                  label="字段名"
                  value={fieldDraft ?? col.field}
                  error={!!fieldError}
                  helperText={fieldError}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFieldDraft(v);
                    if (isFieldTaken(model.columns, idx, v)) {
                      setFieldError(v.trim() === "" ? "字段名不能为空" : "字段名重复，请换一个");
                      return;
                    }
                    setFieldError(null);
                    setFieldDraft(null);
                    updateColumn(idx, { field: v });
                  }}
                  sx={{ width: "45%", "& .MuiInputBase-input": { fontSize: 11 } }}
                />
                <TextField
                  size="small"
                  label="列标题"
                  value={col.header || ""}
                  onChange={(e) => updateColumn(idx, { header: e.target.value })}
                  sx={{ width: "45%", "& .MuiInputBase-input": { fontSize: 11 } }}
                />
                <FormControl size="small" sx={{ width: "45%", minWidth: 100 }}>
                  <InputLabel sx={{ fontSize: 11 }}>数据类型</InputLabel>
                  <Select
                    value={col.type || "text"}
                    label="数据类型"
                    onChange={(e) => updateColumn(idx, { type: e.target.value as ColumnDef["type"] })}
                    sx={{ fontSize: 11 }}
                  >
                    <MenuItem value="text">文本</MenuItem>
                    <MenuItem value="number">数字</MenuItem>
                    <MenuItem value="date">日期</MenuItem>
                    <MenuItem value="boolean">布尔</MenuItem>
                    <MenuItem value="status">状态</MenuItem>
                    <MenuItem value="link">链接</MenuItem>
                    <MenuItem value="image">图片</MenuItem>
                    <MenuItem value="select">下拉</MenuItem>
                  </Select>
                </FormControl>
                {col.type === "select" && (
                  <TextField
                    size="small"
                    label="选项（逗号分隔）"
                    value={Array.isArray(col.options) ? col.options.join(",") : ""}
                    placeholder="如 高,中,低"
                    onChange={(e) =>
                      updateColumn(idx, {
                        options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    sx={{ width: "45%", "& .MuiInputBase-input": { fontSize: 11 } }}
                  />
                )}
                <TextField
                  size="small"
                  label="列宽"
                  value={col.width || ""}
                  placeholder="如 120px / 20%"
                  onChange={(e) => updateColumn(idx, { width: e.target.value })}
                  sx={{ width: "45%", "& .MuiInputBase-input": { fontSize: 11 } }}
                />
                <FormControl size="small" sx={{ width: "45%", minWidth: 100 }}>
                  <InputLabel sx={{ fontSize: 11 }}>对齐</InputLabel>
                  <Select
                    value={col.align || "left"}
                    label="对齐"
                    onChange={(e) => updateColumn(idx, { align: e.target.value as ColumnDef["align"] })}
                    sx={{ fontSize: 11 }}
                  >
                    <MenuItem value="left">左对齐</MenuItem>
                    <MenuItem value="center">居中</MenuItem>
                    <MenuItem value="right">右对齐</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="格式化"
                  value={col.format || ""}
                  placeholder="如 YYYY-MM-DD"
                  onChange={(e) => updateColumn(idx, { format: e.target.value })}
                  sx={{ width: "45%", "& .MuiInputBase-input": { fontSize: 11 } }}
                />
                <Box sx={{ width: "45%", display: "flex", gap: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={col.sortable !== false}
                        onChange={(e) => updateColumn(idx, { sortable: e.target.checked })}
                      />
                    }
                    label="排序"
                    sx={{ "& .MuiTypography-root": { fontSize: 11 } }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={col.visible !== false}
                        onChange={(e) => updateColumn(idx, { visible: e.target.checked })}
                      />
                    }
                    label="显示"
                    sx={{ "& .MuiTypography-root": { fontSize: 11 } }}
                  />
                </Box>
                <Box sx={{ width: "45%" }}>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={col.editable !== false}
                        onChange={(e) => updateColumn(idx, { editable: e.target.checked })}
                      />
                    }
                    label="可编辑（文本/数字/日期/布尔/下拉）"
                    sx={{ "& .MuiTypography-root": { fontSize: 11 } }}
                  />
                </Box>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* 数据区域 */}
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
            数据
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {model.rows.length} 行 / {model.columns.length} 列
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={() => { setImportOpen((v) => !v); setImportText(""); }}
              sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "#0D9488" }}
            >
              导入 CSV
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={handleExportCSV}
              disabled={model.columns.length === 0 || model.rows.length === 0}
              sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "#0D9488" }}
            >
              导出 CSV
            </Button>
          </Box>
        </Box>

        {importOpen && (
          <Box sx={{ mb: 1, p: 1, border: "1px dashed rgba(13,148,136,0.4)", borderRadius: 1, bgcolor: "rgba(13,148,136,0.04)" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
              粘贴 CSV 文本（导入将替换当前全部列与数据）
            </Typography>
            <TextField
              size="small"
              fullWidth
              multiline
              rows={4}
              placeholder={"姓名,年龄,注册日期\n张三,28,2026-01-15\n李四,32,2026-02-20"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              sx={{ "& .MuiInputBase-input": { fontSize: 11, fontFamily: "monospace" } }}
            />
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
              <FormControlLabel
                control={
                  <Switch size="small" checked={importHasHeader} onChange={(e) => setImportHasHeader(e.target.checked)} />
                }
                label="首行作为列标题"
                sx={{ "& .MuiTypography-root": { fontSize: 11 } }}
              />
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Button size="small" variant="text" onClick={() => { setImportOpen(false); setImportText(""); }} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: 0.25, color: "text.secondary" }}>
                  取消
                </Button>
                <Button size="small" variant="contained" onClick={handleImportCSV} disabled={importText.trim() === ""} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, p: "2px 10px", bgcolor: "#0D9488" }}>
                  导入
                </Button>
              </Box>
            </Box>
          </Box>
        )}

        {model.columns.length > 0 ? (
          <TableContainer sx={{ maxHeight: 240, border: "1px solid rgba(128,128,128,0.2)", borderRadius: 1 }}>
            <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
              <TableHead>
                <TableRow>
                  {model.columns.map((col) => (
                    <TableCell
                      key={col.field}
                      sx={{
                        p: 0.4,
                        borderBottom: "1px solid rgba(128,128,128,0.25)",
                        backgroundColor: "rgba(128,128,128,0.08)",
                        minWidth: 80,
                      }}
                    >
                      <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 600, color: "text.secondary" }}>
                        {col.header || col.field}
                      </Typography>
                    </TableCell>
                  ))}
                  <TableCell sx={{ p: 0.4, width: 36, borderBottom: "1px solid rgba(128,128,128,0.25)", backgroundColor: "rgba(128,128,128,0.08)" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {model.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={model.columns.length + 1} sx={{ p: 1, textAlign: "center", borderBottom: "none" }}>
                      <Typography variant="caption" sx={{ color: "text.disabled" }}>
                        暂无数据，点击下方「添加行」填充
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {model.rows.map((row, rIdx) => (
                  <TableRow key={rIdx}>
                    {model.columns.map((col) => (
                      <TableCell
                        key={col.field}
                        sx={{ p: 0.25, borderBottom: "1px solid rgba(128,128,128,0.12)" }}
                      >
                        <CellInput
                          value={row[col.field]}
                          onCommit={(v) => updateCell(rIdx, col.field, v)}
                        />
                      </TableCell>
                    ))}
                    <TableCell sx={{ p: 0.25, width: 36, textAlign: "center", borderBottom: "1px solid rgba(128,128,128,0.12)" }}>
                      <IconButton
                        size="small"
                        onClick={() => removeRow(rIdx)}
                        sx={{ p: 0.2, color: "text.disabled", "&:hover": { color: "error.main" } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: 1, textAlign: "center", border: "1px dashed rgba(128,128,128,0.3)", borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              请先添加列再编辑数据
            </Typography>
          </Box>
        )}

        <Button
          size="small"
          variant="text"
          onClick={addRow}
          disabled={model.columns.length === 0}
          sx={{ textTransform: "none", minWidth: 0, p: 0.25, mt: 0.5, fontSize: 11, color: "#0D9488" }}
          startIcon={<AddIcon sx={{ fontSize: 13 }} />}
        >
          添加行
        </Button>
      </Box>

      {help && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          {help}
        </Typography>
      )}
    </Box>
  );
}

function CellInput({ value, onCommit }: { value: unknown; onCommit: (v: string) => void }) {
  const display = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return (
    <TextField
      size="small"
      fullWidth
      value={display}
      onChange={(e) => onCommit(e.target.value)}
      sx={{
        "& .MuiInputBase-input": { p: "4px 6px", fontSize: 11, lineHeight: 1.4 },
        "& .MuiOutlinedInput-root fieldset": { display: "none" },
        "& .MuiOutlinedInput-root:hover fieldset": { display: "block", borderWidth: 1 },
      }}
    />
  );
}

function coerceCell(s: string): unknown {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  try { return JSON.parse(t); } catch { return s; }
}

function parseModel(raw: Record<string, unknown>): TableDataModel {
  const fallback: TableDataModel = { columns: [], rows: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const columns = Array.isArray(raw.columns)
    // 口径收口：列解析复用 tableData.parseColumnDefs（select/options/editable 等新字段
    // 不再被本地副本吞掉，避免编辑器往返丢失配置）
    ? parseColumnDefs(raw.columns)
    : [];

  const rows = Array.isArray(raw.rows)
    ? (raw.rows as unknown[]).filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<string, unknown>[]
    : [];

  return { columns, rows };
}
