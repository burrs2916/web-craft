/**
 * action 字段：纯触发器按钮，通过 editorStore.actionHandlers 触发。
 * 从 legacyIotWidgets.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useEditorStore } from '../../../../store/editorStore';
import type { ConfigField } from '../../../../types/editor';

export function ActionField({
  field,
  value,
  onChange,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
}) {
  // action 字段是纯触发器，不读写 value，void 标记使用避免 ts6133
  void value;
  const [busy, setBusy] = useState(false);
  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 通过 editorStore 的 actionHandlers 触发
      // 约定：handler 接受 (config, onChange) 并可写回 config
      const handlers = useEditorStore.getState().actionHandlers;
      if (handlers && field.action && handlers[field.action]) {
        await handlers[field.action](config, onChange);
      } else {
        console.warn("[ActionField] no handler for action:", field.action);
      }
    } catch (e) {
      console.error("[ActionField] error:", e);
    } finally {
      setBusy(false);
    }
  }, [busy, field.action, config, onChange]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Typography sx={{ fontSize: 10.5, color: "text.secondary", flex: 1 }}>{field.label}</Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={handleClick}
        sx={{ fontSize: 10.5, py: 0.25, px: 1, minWidth: 0 }}
        startIcon={busy ? <CircularProgress size={10} /> : undefined}
      >
        {field.buttonLabel ?? field.label}
      </Button>
    </Box>
  );
}
