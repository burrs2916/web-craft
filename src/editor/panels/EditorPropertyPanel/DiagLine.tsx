import Typography from '@mui/material/Typography';

import type { FieldDiag } from '../../data/fieldDiagnose';
import { DIAG_COLORS, DIAG_MARKS } from './shared';

/**
 * 诊断条的**唯一渲染点**。
 *
 * 两种来源共用它，保证外观永远一致：
 *   1. 字段级 —— `ConfigField.diagnose`（组件 schema 逐个声明，SchemaFieldRow 调用）；
 *   2. 类型级 —— `editor/data/fieldDiagnose`（面板按 `type` 统一判定，color / number 等分支调用）。
 * 只靠颜色传达状态对色觉障碍不友好，故同时给一个符号前缀（`✓ / ! / ✕ / i`）。
 */
export function DiagLine({ diag }: { diag: FieldDiag | null }) {
  if (!diag) return null;
  return (
    <>
      <Typography
        sx={{
          fontSize: 9,
          lineHeight: 1.5,
          mt: 0.4,
          px: 0.25,
          color: DIAG_COLORS[diag.level] ?? 'text.secondary',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {`${DIAG_MARKS[diag.level] ?? '·'} ${diag.text}`}
      </Typography>
      {diag.detail && (
        <Typography
          sx={{ fontSize: 9, lineHeight: 1.45, mt: 0.15, px: 0.25, color: 'text.disabled', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {diag.detail}
        </Typography>
      )}
    </>
  );
}