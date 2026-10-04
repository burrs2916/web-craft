import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";
import type { EventBinding } from "../../../types/editor";
import { SectionLabel } from "./SectionLabel";
import { useEventBindingForm } from "./useEventBindingForm";
import { CallApiFields } from "./CallApiFields";
import { TargetActionFields } from "./TargetActionFields";
import { ActionParamsFields } from "./ActionParamsFields";
import { ActionSequenceEditor } from "./ActionSequenceEditor";

export { ActionSequenceEditor } from "./ActionSequenceEditor";

interface EventBindingEditorProps {
  binding: EventBinding;
  onSave: (binding: EventBinding) => void;
  onCancel: () => void;
}

/**
 * EventBindingEditor - 事件绑定编辑对话框
 * 提供完整的事件绑定配置表单
 */
export function EventBindingEditor({ binding, onSave, onCancel }: EventBindingEditorProps) {
  const form = useEventBindingForm(binding, onSave);
  const {
    triggerSource, setTriggerSource,
    sourceEvent, setSourceEvent,
    events,
    actionType, setActionType,
    steps, setSteps,
    condition, setCondition,
    enabled, setEnabled,
    throttle, setThrottle,
    debounce, setDebounce,
    handleSave,
    isValid,
  } = form;

  return (
    <Dialog
      open
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            maxHeight: "80vh",
          },
        },
      }}
    >
      {/* 标题栏 */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          fontSize: 15,
          fontWeight: 600,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        编辑事件绑定
        <IconButton size="small" onClick={onCancel} sx={{ ml: 1 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      {/* 表单内容 */}
      <DialogContent
        dividers
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          px: 2.5,
          py: 2,
        }}
      >
        {/* 第零部分：触发源类型 */}
        <Box>
          <SectionLabel>触发源</SectionLabel>
          <TextField
            select
            size="small"
            label="触发类型"
            value={triggerSource}
            onChange={(e) => {
              setTriggerSource(e.target.value);
              setSourceEvent(''); // 切换触发源时重置事件
            }}
            fullWidth
          >
            <MenuItem value="interaction">用户交互（点击/悬停）</MenuItem>
            <MenuItem value="data">数据变化</MenuItem>
            <MenuItem value="threshold">阈值越限</MenuItem>
            <MenuItem value="timer">定时触发</MenuItem>
          </TextField>
        </Box>

        {/* 第一部分：触发事件 */}
        <Box>
          <SectionLabel>触发条件</SectionLabel>
          <TextField
            select
            size="small"
            label="触发事件"
            value={sourceEvent}
            onChange={(e) => setSourceEvent(e.target.value)}
            fullWidth
            required
          >
            {events.map((event) => (
              <MenuItem key={event.name} value={event.name}>
                {event.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* 第二部分：动作类型（目标组件动作 / 调用接口） */}
        <Box>
          <SectionLabel>动作设置</SectionLabel>
          <TextField
            select
            size="small"
            label="动作类型"
            value={actionType}
            onChange={(e) => {
              const v = e.target.value as "target" | "callApi" | "sequence";
              setActionType(v);
              // 切到序列时，把当前单动作预填为第一步（引导式迁移）
              if (v === "sequence" && steps.length === 0 && binding.targetAction && binding.targetComponentId) {
                setSteps([{
                  targetComponentId: binding.targetComponentId,
                  targetAction: binding.targetAction,
                  params: binding.params ? { ...binding.params } : undefined,
                }]);
              }
            }}
            fullWidth
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="target">目标组件动作</MenuItem>
            <MenuItem value="callApi">调用接口（事件触发请求）</MenuItem>
            <MenuItem value="sequence">动作序列（依次执行多步）</MenuItem>
          </TextField>

          {actionType === "callApi" ? (
            <CallApiFields form={form} />
          ) : actionType === "sequence" ? (
            <ActionSequenceEditor
              steps={steps}
              components={form.components}
              allActions={form.allActions}
              groupedActions={form.groupedActions}
              onChange={setSteps}
            />
          ) : (
            <TargetActionFields form={form} />
          )}
        </Box>

        {/* 第三部分：动作参数 */}
        <ActionParamsFields form={form} />

        {/* 第四部分：条件表达式 */}
        <Box>
          <SectionLabel>条件表达式（可选）</SectionLabel>
          <TextField
            size="small"
            multiline
            minRows={1}
            maxRows={4}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="payload.value > 100"
            fullWidth
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: "monospace",
                fontSize: "0.8rem",
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            可用变量: payload（事件携带的数据）
          </Typography>
        </Box>

        {/* 第五部分：运行时控制 */}
        <Box>
          <SectionLabel>运行时控制</SectionLabel>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <TextField
              select
              size="small"
              label="启用状态"
              value={enabled ? '1' : '0'}
              onChange={(e) => setEnabled(e.target.value === '1')}
              sx={{ flex: '1 1 120px' }}
            >
              <MenuItem value="1">启用</MenuItem>
              <MenuItem value="0">禁用</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="节流(ms)"
              value={throttle}
              onChange={(e) => setThrottle(e.target.value)}
              placeholder="0"
              type="number"
              sx={{ flex: '1 1 100px' }}
            />
            <TextField
              size="small"
              label="防抖(ms)"
              value={debounce}
              onChange={(e) => setDebounce(e.target.value)}
              placeholder="0"
              type="number"
              sx={{ flex: '1 1 100px' }}
            />
          </Box>
        </Box>
      </DialogContent>

      {/* 底部按钮 */}
      <DialogActions
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Button onClick={onCancel} size="small" sx={{ textTransform: "none" }}>
          取消
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          size="small"
          disabled={!isValid}
          sx={{ textTransform: "none", minWidth: 72 }}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}