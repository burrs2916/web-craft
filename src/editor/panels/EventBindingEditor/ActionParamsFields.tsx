import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { NavigateToSceneParamsEditor } from "../NavigateToSceneParamsEditor";
import { SectionLabel } from "./SectionLabel";
import type { EventBindingForm } from "./useEventBindingForm";

/** 单动作参数区（按动作类型渲染专用编辑器或通用参数字段）。 */
export function ActionParamsFields({ form }: { form: EventBindingForm }) {
  const { targetAction, params, setParams, currentActionDef } = form;

  if (!currentActionDef?.paramsSchema || currentActionDef.paramsSchema.length === 0) return null;

  return (
    <Box>
      <SectionLabel>动作参数</SectionLabel>
      {targetAction === "navigateToScene" ? (
        <NavigateToSceneParamsEditor params={params} onChange={setParams} />
      ) : targetAction === "navigate" ? (
        <TextField
          size="small"
          label="URL 地址"
          value={(params.url as string) ?? ""}
          onChange={(e) => setParams({ ...params, url: e.target.value })}
          placeholder="https://..."
          fullWidth
          required
        />
      ) : targetAction === "setData" ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <TextField
            size="small"
            label="属性名"
            value={(params.property as string) ?? ""}
            onChange={(e) => setParams({ ...params, property: e.target.value })}
            fullWidth
            required
          />
          <TextField
            size="small"
            label="值"
            value={(params.value as string) ?? ""}
            onChange={(e) => setParams({ ...params, value: e.target.value })}
            fullWidth
            required
          />
        </Box>
      ) : (
        currentActionDef.paramsSchema.map((field, i) => (
          <TextField
            key={field.key}
            size="small"
            label={field.label}
            value={(params[field.key] as string) ?? ""}
            onChange={(e) =>
              setParams({ ...params, [field.key]: e.target.value })
            }
            placeholder={field.placeholder}
            required={field.required}
            fullWidth
            sx={i > 0 ? { mt: 1.5 } : undefined}
          />
        ))
      )}
    </Box>
  );
}