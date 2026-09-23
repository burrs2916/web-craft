import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

interface Row {
  key: string;
  value: string;
}

interface MapEditorProps {
  value?: unknown;
  onChange: (next: Record<string, string>) => void;
  label?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/** 把对象/JSON字符串解析成可编辑的键值对行 */
function toRows(value: unknown): Row[] {
  if (value == null) return [{ key: "", value: "" }];
  let obj: Record<string, unknown> = {};
  if (typeof value === "object") {
    obj = value as Record<string, unknown>;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      // 非 JSON 文本，忽略
    }
  }
  const keys = Object.keys(obj);
  return keys.length > 0
    ? keys.map((k) => ({ key: k, value: obj[k] == null ? "" : String(obj[k]) }))
    : [{ key: "", value: "" }];
}

/**
 * MapEditor - 可视化键值对编辑器（替代手写 JSON）
 * 用于请求头 / 请求体等扁平对象字段：逐行填键名 + 值，自动组装为对象。
 */
export function MapEditor({ value, onChange, label, keyPlaceholder = "字段名", valuePlaceholder = "值" }: MapEditorProps) {
  const rows = toRows(value);

  const emit = (next: Row[]) => {
    const obj: Record<string, string> = {};
    for (const r of next) {
      if (r.key) obj[r.key] = r.value;
    }
    onChange(obj);
  };

  const setRow = (i: number, patch: Partial<Row>) => {
    emit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const removeRow = (i: number) => {
    if (rows.length === 1) {
      emit([{ key: "", value: "" }]);
      return;
    }
    emit(rows.filter((_, idx) => idx !== i));
  };

  const addRow = () => {
    emit([...rows, { key: "", value: "" }]);
  };

  return (
    <Box>
      {label && (
        <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", display: "block", mb: 0.5 }}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {rows.map((row, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <TextField
              size="small"
              placeholder={keyPlaceholder}
              value={row.key}
              onChange={(e) => setRow(i, { key: e.target.value })}
              sx={{
                flex: 1,
                "& .MuiInputBase-root": { fontSize: 12 },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
              }}
            />
            <TextField
              size="small"
              placeholder={valuePlaceholder}
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              sx={{
                flex: 1,
                "& .MuiInputBase-root": { fontSize: 12 },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
              }}
            />
            <IconButton
              size="small"
              onClick={() => removeRow(i)}
              sx={{ color: "text.disabled", p: 0.5, "&:hover": { color: "error.main" } }}
            >
              <RemoveIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        ))}
      </Box>
      <Button
        size="small"
        startIcon={<AddIcon sx={{ fontSize: 14 }} />}
        onClick={addRow}
        sx={{ mt: 0.75, fontSize: 11, textTransform: "none", minWidth: "auto", p: 0.25 }}
      >
        添加项
      </Button>
    </Box>
  );
}