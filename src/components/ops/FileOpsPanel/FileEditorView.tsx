import { useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import {
  ArrowLeftIcon,
  CheckSquareIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  FloppyDiskIcon,
  CopyIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';

import type { RemoteFileContent } from '../../../proto/ops';
import { formatSize, formatDate } from './shared';

interface FileEditorViewProps {
  file: RemoteFileContent;
  editing: boolean;
  editContent: string;
  saving: boolean;
  isDirty: boolean;
  onBack: () => void;
  onChangeContent: (value: string) => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCopyPath: (path: string) => void;
  onRefresh: () => void;
  onOpenScriptById: (scriptId: string) => void;
}

export function FileEditorView({
  file,
  editing,
  editContent,
  saving,
  isDirty,
  onBack,
  onChangeContent,
  onCancelEdit,
  onStartEdit,
  onSave,
  onCopyPath,
  onRefresh,
  onOpenScriptById,
}: FileEditorViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 计算行号
  const lineCount = useMemo(() => editContent.split('\n').length, [editContent]);

  const showNginxActions = file.path.includes('nginx') && file.path.endsWith('.conf');

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 顶部工具栏 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}>
        <Tooltip title="返回">
          <IconButton size="small" onClick={onBack}>
            <ArrowLeftIcon size={16} />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
          <Typography variant="subtitle2" sx={{
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}>
            {isDirty && (
              <Chip
                label="未保存"
                size="small"
                color="warning"
                sx={{ height: 18, '& .MuiChip-label': { px: 1, py: 0, fontSize: 10 } }}
              />
            )}
            {file.path}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {formatSize(file.size)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              权限 {file.permissions || '---'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              修改于 {formatDate(file.modifiedAt)}
            </Typography>
          </Box>
        </Box>

        {editing ? (
          <>
            {/* Nginx 配置快捷操作 */}
            {showNginxActions && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<CheckSquareIcon size={13} />}
                  onClick={() => onOpenScriptById('ops-web-nginx-test')}
                >
                  测试配置
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<ArrowClockwiseIcon size={13} />}
                  onClick={() => onOpenScriptById('ops-web-nginx-reload')}
                >
                  重载 Nginx
                </Button>
              </>
            )}
            <Button
              size="small"
              onClick={onCancelEdit}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={onSave}
              disabled={saving || !isDirty}
              startIcon={saving ? <CircularProgress size={14} /> : <FloppyDiskIcon size={14} />}
            >
              保存
            </Button>
          </>
        ) : (
          <>
            {/* Nginx 配置快捷操作 */}
            {showNginxActions && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  startIcon={<CheckSquareIcon size={13} />}
                  onClick={() => onOpenScriptById('ops-web-nginx-test')}
                >
                  测试配置
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<ArrowClockwiseIcon size={13} />}
                  onClick={() => onOpenScriptById('ops-web-nginx-reload')}
                >
                  重载 Nginx
                </Button>
              </>
            )}
            <Tooltip title="复制路径">
              <IconButton size="small" onClick={() => onCopyPath(file.path)}>
                <CopyIcon size={15} />
              </IconButton>
            </Tooltip>
            <Tooltip title="刷新">
              <IconButton size="small" onClick={onRefresh}>
                <ArrowCounterClockwiseIcon size={15} />
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              onClick={onStartEdit}
              disabled={!file.isText}
              startIcon={<PencilSimpleIcon size={14} />}
            >
              {file.isText ? '编辑' : '二进制文件'}
            </Button>
          </>
        )}
      </Box>

      {/* 代码编辑区 */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#1e1e1e', display: 'flex' }}>
        {/* 行号 */}
        <Box
          sx={{
            flexShrink: 0,
            width: 48,
            py: 2,
            pr: 1,
            textAlign: 'right',
            fontFamily: 'Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#858585',
            bgcolor: '#1e1e1e',
            userSelect: 'none',
            overflow: 'hidden',
            borderRight: '1px solid #2d2d2d',
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </Box>

        {/* 代码内容 */}
        {editing ? (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => onChangeContent(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              color: '#d4d4d4',
              border: 'none',
              outline: 'none',
              padding: '16px',
              fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
              resize: 'none',
              whiteSpace: 'pre',
              overflow: 'auto',
            }}
          />
        ) : (
          <pre
            style={{
              margin: 0,
              padding: 16,
              color: '#d4d4d4',
              fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              overflow: 'auto',
              flex: 1,
            }}
          >
            {file.isText ? file.content : '[ 二进制文件，无法显示 ]'}
          </pre>
        )}
      </Box>
    </Box>
  );
}