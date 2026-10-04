import { Fragment } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import type { SceneComponent } from "../../../types/editor";
import type { EventBindingForm } from "./useEventBindingForm";

/** 动作类型为「目标组件动作」时的表单分区（选择目标组件 + 执行动作）。 */
export function TargetActionFields({ form }: { form: EventBindingForm }) {
  const {
    components,
    targetComponent,
    targetComponentId,
    setTargetComponentId,
    targetAction,
    setTargetAction,
    setParams,
    groupedActions,
  } = form;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Autocomplete<SceneComponent>
        size="small"
        options={components}
        value={targetComponent ?? null}
        getOptionLabel={(opt) => opt.name || opt.type}
        onChange={(_, newValue) => {
          setTargetComponentId(newValue?.id ?? "");
          setTargetAction(""); // 切换目标时重置动作
          setParams({});
        }}
        renderInput={(inputProps) => (
          <TextField
            {...inputProps}
            label="目标组件"
            required
            placeholder="搜索组件..."
          />
        )}
        noOptionsText="无匹配组件"
        slotProps={{
          paper: {
            sx: { zIndex: 1500 },
          },
        }}
      />

      <TextField
        select
        size="small"
        label="执行动作"
        value={targetAction}
        onChange={(e) => {
          setTargetAction(e.target.value);
          setParams({});
        }}
        fullWidth
        required
        disabled={!targetComponentId}
      >
        {groupedActions.map(([cat, list]) => (
          <Fragment key={cat}>
            <MenuItem disabled sx={{ opacity: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                {cat}
              </Typography>
            </MenuItem>
            {list.map((action) => (
              <MenuItem key={action.name} value={action.name}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {action.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {action.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Fragment>
        ))}
      </TextField>
    </Box>
  );
}