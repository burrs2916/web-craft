import { Fragment } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import type { EventActionStep, SceneComponent } from "../../../types/editor";
import type { ActionInfo } from "../../utils/eventActionRegistry";
import { StepParamsFields } from "./StepParamsFields";

/**
 * ActionSequenceEditor - 动作序列编辑器（A3 IR 的面板 UI）
 * 独立导出便于复用与测试；触发后步骤按序执行，condition/throttle/debounce 作用于整条序列
 */
export function ActionSequenceEditor({
  steps,
  components,
  allActions,
  groupedActions,
  onChange,
}: {
  steps: EventActionStep[];
  components: SceneComponent[];
  allActions: ActionInfo[];
  groupedActions: [string, ActionInfo[]][];
  onChange: (steps: EventActionStep[]) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {steps.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          暂无步骤，点击下方按钮添加（也可由单动作迁移而来）
        </Typography>
      )}
      {steps.map((step, idx) => {
        const stepComp = components.find((c) => c.id === step.targetComponentId);
        const stepDef = allActions.find((a) => a.name === step.targetAction);
        const updateStep = (patch: Partial<EventActionStep>) =>
          onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
        return (
          <Box
            key={idx}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              p: 1.25,
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: "text.primary" }}>
                步骤 {idx + 1}
              </Typography>
              <IconButton
                size="small"
                onClick={() => onChange(steps.filter((_, i) => i !== idx))}
                aria-label="删除步骤"
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
            <Autocomplete<SceneComponent>
              size="small"
              options={components}
              value={stepComp ?? null}
              getOptionLabel={(opt) => opt.name || opt.type}
              onChange={(_, newValue) =>
                updateStep({ targetComponentId: newValue?.id ?? "", targetAction: "", params: {} })
              }
              renderInput={(inputProps) => (
                <TextField {...inputProps} label="目标组件" placeholder="搜索组件..." />
              )}
              noOptionsText="无匹配组件"
              slotProps={{ paper: { sx: { zIndex: 1500 } } }}
            />
            <TextField
              select
              size="small"
              label="执行动作"
              value={step.targetAction}
              onChange={(e) => updateStep({ targetAction: e.target.value, params: {} })}
              fullWidth
              disabled={!step.targetComponentId}
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
                      {action.label}
                    </MenuItem>
                  ))}
                </Fragment>
              ))}
            </TextField>
            {stepDef?.paramsSchema && stepDef.paramsSchema.length > 0 && (
              <StepParamsFields
                schema={stepDef.paramsSchema}
                params={step.params ?? {}}
                onChange={(p) => updateStep({ params: p })}
              />
            )}
          </Box>
        );
      })}
      <Button
        size="small"
        variant="outlined"
        onClick={() => onChange([...steps, { targetComponentId: "", targetAction: "" }])}
        sx={{ textTransform: "none", alignSelf: "flex-start" }}
      >
        + 添加步骤
      </Button>
      <Typography variant="caption" color="text.secondary">
        触发后按顺序依次执行各步骤；条件/节流/防抖作用于整条序列，各步骤参数中可用 {"{{value}}"} 接收事件值。
      </Typography>
    </Box>
  );
}