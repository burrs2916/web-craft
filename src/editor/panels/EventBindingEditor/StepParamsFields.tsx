import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { ParamField } from "../../utils/eventActionRegistry";

/** 序列步骤参数字段渲染（A3）：text/number/select/boolean/json；scene/view 类型退化为 ID 文本输入 */
export function StepParamsFields({
  schema,
  params,
  onChange,
}: {
  schema: ParamField[];
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <>
      {schema.map((field) => {
        if (field.type === "boolean") {
          return (
            <Box key={field.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", flex: 1 }}>
                {field.label}
              </Typography>
              <input
                type="checkbox"
                style={{ accentColor: "#1976d2", width: 16, height: 16, cursor: "pointer" }}
                checked={Boolean(params[field.key])}
                onChange={(e) => onChange({ ...params, [field.key]: e.target.checked })}
              />
            </Box>
          );
        }
        if (field.type === "select") {
          return (
            <TextField
              key={field.key}
              select
              size="small"
              label={field.label}
              value={String(params[field.key] ?? "")}
              onChange={(e) => onChange({ ...params, [field.key]: e.target.value })}
              fullWidth
            >
              {(field.options ?? []).map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          );
        }
        const isJson = field.type === "json";
        const rawVal = params[field.key];
        const display =
          isJson && rawVal != null && typeof rawVal === "object"
            ? JSON.stringify(rawVal)
            : String(rawVal ?? "");
        const isRef = field.type === "scene" || field.type === "view";
        return (
          <TextField
            key={field.key}
            size="small"
            label={isRef ? `${field.label} (ID)` : field.label}
            type={field.type === "number" ? "number" : "text"}
            value={display}
            onChange={(e) => {
              let v: unknown = e.target.value;
              if (field.type === "number") v = e.target.value === "" ? undefined : Number(e.target.value);
              onChange({ ...params, [field.key]: v });
            }}
            placeholder={field.placeholder}
            required={field.required}
            multiline={isJson}
            minRows={isJson ? 1 : undefined}
            fullWidth
            helperText={field.type === "scene" ? "填场景 ID" : field.type === "view" ? "填视图 ID" : undefined}
          />
        );
      })}
    </>
  );
}