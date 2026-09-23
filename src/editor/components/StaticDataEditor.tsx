import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

/**
 * 通用静态数据编辑器（全可视化，不向用户暴露 JSON）：
 * - 数组 → 表格逐行/格编辑（自动推断列）
 * - 对象 → 键值对表单
 * - 标量 → 单值输入
 * 内部仍以 JSON 序列化存取（与既有 staticData 存储兼容），但界面全程可视化。
 */
export function StaticDataEditor({
  value,
  onChange,
  help,
}: {
  value?: unknown;
  onChange: (next: string) => void;
  help?: string;
}) {
  const raw = useMemo(() => {
    if (typeof value === "string") return value;
    if (value == null) return "";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }, [value]);

  const parsed = useMemo<{ ok: boolean; data?: unknown }>(() => {
    if (!raw.trim()) return { ok: true };
    try {
      return { ok: true, data: JSON.parse(raw) };
    } catch {
      return { ok: false };
    }
  }, [raw]);

  // 空数据按空数组处理，便于直接进入表格逐行添加
  const data = parsed.ok && parsed.data !== undefined ? parsed.data : [];
  const isArray = parsed.ok && Array.isArray(data);
  const isObject = parsed.ok && !Array.isArray(data) && data !== null && typeof data === "object";

  return (
    <Box sx={{ width: "100%" }}>
      {!parsed.ok ? (
        <FormatError onChange={() => onChange("[]")} />
      ) : isArray ? (
        <TableEditor rows={data as unknown[]} onChange={(next) => onChange(JSON.stringify(next))} />
      ) : isObject ? (
        <ObjectEditor obj={data as Record<string, unknown>} onChange={(next) => onChange(JSON.stringify(next))} />
      ) : (
        <ScalarEditor
          v={data as string | number | boolean}
          onChange={(next) => onChange(String(next))}
        />
      )}

      {help && (
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          {help}
        </Typography>
      )}
    </Box>
  );
}

function FormatError({ onChange }: { onChange: () => void }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        p: 1,
        border: "1px solid rgba(211,47,47,0.4)",
        borderRadius: 1,
        bgcolor: "rgba(211,47,47,0.05)",
      }}
    >
      <WarningAmberIcon sx={{ fontSize: 16, color: "error.main", flexShrink: 0 }} />
      <Typography variant="caption" sx={{ flex: 1, color: "text.secondary" }}>
        已有数据无法解析，无法可视化编辑。清空后重新逐条添加。
      </Typography>
      <Button size="small" onClick={onChange} sx={{ textTransform: "none", minWidth: 0, p: 0.5, color: "error.main", fontSize: 11 }}>
        清空重建
      </Button>
    </Box>
  );
}

function ScalarEditor({ v, onChange }: { v: string | number | boolean; onChange: (next: string) => void }) {
  return (
    <TextField
      size="small"
      fullWidth
      value={String(v ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder="输入数值 / 文本"
    />
  );
}

function TableEditor({ rows, onChange }: { rows: unknown[]; onChange: (next: unknown[]) => void }) {
  const allCols = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        Object.keys(row as Record<string, unknown>).forEach((k) => map.set(k, map.size));
      }
    });
    return Array.from(map.keys());
  }, [rows]);

  const updateRow = (i: number, key: string, cell: string) => {
    onChange(rows.map((row, r) => (r !== i ? row : { ...struct(row), [key]: coerceCell(cell) })));
  };
  const addRow = () => {
    // 无列时自动建立首个字段列，保证新行立即可编辑
    if (allCols.length === 0) {
      const first = { 字段1: "" };
      onChange([...(rows.map((r) => ({ ...struct(r), 字段1: "" }))), first]);
    } else {
      onChange([...rows, {}]);
    }
  };
  const removeRow = (i: number) => onChange(rows.filter((_, r) => r !== i));
  const addCol = () => {
    const name = window.prompt("新列名", `字段${allCols.length + 1}`);
    if (!name) return;
    onChange(rows.map((row) => ({ ...struct(row), [name]: "" })));
  };

  return (
    <Box sx={{ width: "100%" }}>
      <TableContainer sx={{ maxHeight: 240, border: "1px solid rgba(128,128,128,0.2)", borderRadius: 1 }}>
        <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              {allCols.map((c) => (
                <TableCell key={c} sx={{ p: 0.25, borderBottom: "1px solid rgba(128,128,128,0.25)", minWidth: 90, backgroundColor: "rgba(128,128,128,0.08)" }}>
                  <Typography noWrap sx={{ fontSize: 10.5, color: "text.secondary", fontWeight: 600 }}>{c || "(空列)"}</Typography>
                </TableCell>
              ))}
              <TableCell sx={{ p: 0.25, width: 30, borderBottom: "1px solid rgba(128,128,128,0.25)", backgroundColor: "rgba(128,128,128,0.08)" }}>
                <Tooltip title="新增列">
                  <IconButton size="small" onClick={addCol} sx={{ p: 0.2 }}><AddIcon sx={{ fontSize: 13 }} /></IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={allCols.length + 1} sx={{ p: 1, textAlign: "center", borderBottom: "none" }}>
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>暂无数据，点击下方"添加行"填充</Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, r) => {
              const o = struct(row);
              return (
                <TableRow key={r}>
                  {allCols.map((c) => (
                    <TableCell key={c} sx={{ p: 0.25, borderBottom: "1px solid rgba(128,128,128,0.12)" }}>
                      <CellInput value={o[c]} onCommit={(v) => updateRow(r, c, v)} />
                    </TableCell>
                  ))}
                  <TableCell sx={{ p: 0.25, width: 30, textAlign: "center", borderBottom: "1px solid rgba(128,128,128,0.12)" }}>
                    <IconButton size="small" onClick={() => removeRow(r)} sx={{ p: 0.2, color: "text.disabled", "&:hover": { color: "error.main" } }}>
                      <RemoveIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
        <Button size="small" variant="text" onClick={addRow} sx={{ textTransform: "none", minWidth: 0, p: 0.25, fontSize: 11, color: "#0D9488" }} startIcon={<AddIcon sx={{ fontSize: 13 }} />}>
          添加行
        </Button>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: "text.disabled" }}>{rows.length} 行 / {allCols.length} 列</Typography>
      </Box>
    </Box>
  );
}

function ObjectEditor({ obj, onChange }: { obj: Record<string, unknown>; onChange: (next: Record<string, unknown>) => void }) {
  const entries = useMemo(() => Object.entries(obj), [obj]);
  const set = (next: Record<string, unknown>) => onChange(next);

  const updateKey = (oldK: string, newK: string) => {
    if (!newK || newK === oldK) return;
    const next: Record<string, unknown> = {};
    Object.entries(obj).forEach(([k, v]) => { next[k === oldK ? newK : k] = v; });
    set(next);
  };
  const updateVal = (k: string, v: string) => set({ ...obj, [k]: coerceCell(v) });
  const remove = (k: string) => { const next = { ...obj }; delete next[k]; set(next); };
  const add = () => {
    const name = window.prompt("新字段名", `字段${entries.length + 1}`);
    if (!name) return;
    set({ ...obj, [name]: "" });
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ border: "1px solid rgba(128,128,128,0.2)", borderRadius: 1 }}>
        {entries.length === 0 && (
          <Typography variant="caption" sx={{ display: "block", p: 1, textAlign: "center", color: "text.disabled" }}>
            暂无字段，点击"添加字段"填充
          </Typography>
        )}
        {entries.map(([k, v]) => (
          <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 0.5, p: 0.5, borderBottom: "1px solid rgba(128,128,128,0.12)" }}>
            <TextField
              size="small"
              defaultValue={k}
              onBlur={(e) => updateKey(k, e.target.value.trim())}
              sx={{
                width: "32%",
                "& .MuiInputBase-input": { fontSize: 11, fontWeight: 600 },
                "& .MuiOutlinedInput-root fieldset": { display: "none" },
                "& .MuiOutlinedInput-root:hover fieldset": { display: "block", borderWidth: 1 },
              }}
            />
            <Box sx={{ width: "4%" }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {isNested(v) ? <NestedValueHint v={v} /> : <CellInput value={v} onCommit={(val) => updateVal(k, val)} />}
            </Box>
            <IconButton size="small" onClick={() => remove(k)} sx={{ p: 0.2, color: "text.disabled", "&:hover": { color: "error.main" } }}>
              <DeleteOutlineIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Box>
        ))}
      </Box>
      <Button size="small" variant="text" onClick={add} sx={{ textTransform: "none", minWidth: 0, mt: 0.25, p: 0.25, fontSize: 11, color: "#0D9488" }} startIcon={<AddIcon sx={{ fontSize: 13 }} />}>
        添加字段
      </Button>
    </Box>
  );
}

function NestedValueHint({ v }: { v: unknown }) {
  const isArr = Array.isArray(v);
  const label = isArr ? `数组 · ${(v as unknown[]).length} 项` : `对象 · ${Object.keys(v as Record<string, unknown>).length} 字段`;
  return (
    <Box sx={{ p: 0.5, borderRadius: 0.5, bgcolor: "rgba(128,128,128,0.1)", mr: 0.25 }}>
      <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>▸ {label}（只读）</Typography>
    </Box>
  );
}

function struct(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isNested(v: unknown): boolean {
  return v !== null && typeof v === "object";
}

function coerceCell(s: string): unknown {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  try {
    return JSON.parse(t);
  } catch {
    return s;
  }
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