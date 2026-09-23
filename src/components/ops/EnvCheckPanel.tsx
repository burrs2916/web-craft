import { Box, Typography, CircularProgress, Button, Chip, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  Warning,
  XCircle,
  Info,
  ArrowClockwise,
  Monitor,
  Globe,
  Database,
  Gauge,
  Network,
  ShieldCheck,
  House,
  MagicWand,
  Rocket,
} from '@phosphor-icons/react';
import type { EnvCheckResult, EnvCheckStatus, EnvCheckGroup } from '../../proto/env-check';

const STATUS_COLORS: Record<EnvCheckStatus, string> = {
  pass: '#4CAF50',
  warning: '#FF9800',
  fail: '#EF5350',
  info: '#2196F3',
};

const STATUS_ICONS: Record<EnvCheckStatus, typeof CheckCircle> = {
  pass: CheckCircle,
  warning: Warning,
  fail: XCircle,
  info: Info,
};

const GROUP_ICONS: Record<string, typeof Monitor> = {
  system: Monitor,
  web: Globe,
  database: Database,
  cache: Gauge,
  ports: Network,
  ssl: ShieldCheck,
  site: House,
};

const GROUP_COLORS: Record<string, { bg: string; fg: string }> = {
  system:   { bg: '#E3F2FD', fg: '#1565C0' },
  web:      { bg: '#E8F5E9', fg: '#2E7D32' },
  database: { bg: '#FFF3E0', fg: '#E65100' },
  cache:    { bg: '#F3E5F5', fg: '#7B1FA2' },
  ports:    { bg: '#E0F7FA', fg: '#00838F' },
  ssl:      { bg: '#E8EAF6', fg: '#3949AB' },
  site:     { bg: '#FCE4EC', fg: '#C2185B' },
};

interface EnvCheckPanelProps {
  result: EnvCheckResult | null;
  loading: boolean;
  error: string;
  connectionId: string;
  onRefresh: () => void;
  /** 站点名称，用于显示 */
  siteName?: string;
  /** 检测时间 */
  checkedAt?: number;
  /** SSH 会话 ID，用于 AI 修复助手 */
  sessionId?: string;
  /** 服务器主机地址 */
  host?: string;
  /** SSH 用户名 */
  username?: string;
  /** 站点域名 */
  domain?: string;
  /** 部署路径 */
  deployPath?: string;
  /** AI 修复按钮点击回调，由父组件处理会话创建和窗口打开 */
  onAiFix?: () => void;
  /** 修复前的检测结果，用于展示前后对比 */
  preFixResult?: EnvCheckResult | null;
  /** 去部署按钮点击回调（环境检测通过时显示） */
  onDeploy?: () => void;
}

export default function EnvCheckPanel({
  result,
  loading,
  error,
  connectionId,
  onRefresh,
  siteName,
  checkedAt,
  onAiFix,
  preFixResult,
  onDeploy,
}: EnvCheckPanelProps) {
  const { t } = useTranslation('ops');

  const needCheck = !loading && !result && !error && connectionId;
  const hasIssues = result && (result.summary.failed > 0 || result.summary.warning > 0);

  // 计算修复前后对比
  const scoreDiff = preFixResult && result
    ? result.summary.score - preFixResult.summary.score
    : 0;
  const hasComparison = !!preFixResult && !!result && preFixResult !== result;

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.5 }}>
      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 2 }}>
          <CircularProgress size={48} />
          <Typography variant="body2" color="text.secondary">
            {t('envCheck.checking')}
          </Typography>
        </Box>
      )}

      {/* Error */}
      {!loading && error && (
        <Box sx={{ p: 3 }}>
          <Alert severity="error" action={
            <Button size="small" onClick={onRefresh} startIcon={<ArrowClockwise size={14} />}>
              {t('envCheck.retry')}
            </Button>
          }>
            {error}
          </Alert>
        </Box>
      )}

      {/* No connection */}
      {!loading && !connectionId && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 1.5 }}>
          <Monitor size={48} color="text.secondary" weight="light" />
          <Typography variant="body2" color="text.secondary">
            {t('envCheck.noConnection')}
          </Typography>
        </Box>
      )}

      {/* Empty / need check */}
      {needCheck && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 2 }}>
          <Monitor size={48} color="text.secondary" weight="light" />
          <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600 }}>
            {t('envCheck.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 360 }}>
            {t('envCheck.description')}
          </Typography>
          <Button
            variant="contained"
            size="medium"
            startIcon={<ArrowClockwise size={16} />}
            onClick={onRefresh}
          >
            {t('envCheck.startCheck')}
          </Button>
        </Box>
      )}

      {/* Result */}
      {!loading && result && connectionId && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header: Score + Stats */}
          <Box
            sx={{
              p: 2.5,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
              {/* Score Circle */}
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  fontWeight: 700,
                  color: getScoreColor(result.summary.score),
                  border: '3px solid',
                  borderColor: getScoreColor(result.summary.score),
                }}
              >
                {result.summary.score}
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {t('envCheck.title')}
                </Typography>
                {siteName && (
                  <Typography variant="body2" color="text.secondary">
                    {siteName}
                  </Typography>
                )}
                {checkedAt && (
                  <Typography variant="caption" color="text.secondary">
                    {t('envCheck.checkedAt', { time: formatTime(checkedAt) })}
                  </Typography>
                )}
                {/* 修复前后对比 */}
                {hasComparison && (
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="small"
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <span style={{ color: 'text.secondary', fontSize: 11 }}>
                            {preFixResult?.summary.score} → {result.summary.score}
                          </span>
                          <span style={{
                            color: scoreDiff > 0 ? '#4CAF50' : scoreDiff < 0 ? '#EF5350' : 'text.secondary',
                            fontWeight: 600,
                            fontSize: 11,
                          }}>
                            {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff}
                          </span>
                        </Box>
                      }
                      sx={{
                        height: 20,
                        bgcolor: scoreDiff > 0 ? 'rgba(76, 175, 80, 0.1)' : scoreDiff < 0 ? 'rgba(239, 83, 80, 0.1)' : 'action.hover',
                        border: '1px solid',
                        borderColor: scoreDiff > 0 ? 'rgba(76, 175, 80, 0.3)' : scoreDiff < 0 ? 'rgba(239, 83, 80, 0.3)' : 'divider',
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      修复后对比
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatChip status="pass" count={result.summary.passed} label={t('envCheck.passed')} />
              <StatChip status="warning" count={result.summary.warning} label={t('envCheck.warning')} />
              <StatChip status="fail" count={result.summary.failed} label={t('envCheck.failed')} />
              <StatChip status="info" count={result.summary.info} label={t('envCheck.info')} />
              {result.summary.check_mode === 'bash' && (
                <Chip
                  size="small"
                  label="Bash 降级版"
                  sx={{
                    bgcolor: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    fontSize: 11,
                  }}
                />
              )}
              {hasIssues && onAiFix && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<MagicWand size={14} />}
                  onClick={onAiFix}
                  sx={{
                    bgcolor: 'secondary.main',
                    '&:hover': { bgcolor: 'secondary.dark' },
                  }}
                >
                  {t('envCheck.aiFix', 'AI 智能修复')}
                </Button>
              )}
              {!hasIssues && onDeploy && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Rocket size={14} />}
                  onClick={onDeploy}
                  sx={{
                    bgcolor: 'success.main',
                    '&:hover': { bgcolor: 'success.dark' },
                  }}
                >
                  去部署
                </Button>
              )}
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowClockwise size={14} />}
                onClick={onRefresh}
              >
                {t('envCheck.refresh')}
              </Button>
            </Box>
          </Box>

          {/* Groups */}
          {result.groups.map((group) => (
            <EnvGroupCard key={group.id} group={group} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ========== Sub Components ==========

function StatChip({ status, count, label }: { status: EnvCheckStatus; count: number; label: string }) {
  const Icon = STATUS_ICONS[status];
  const color = STATUS_COLORS[status];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Icon size={18} color={color} weight="fill" />
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>{count}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </Box>
    </Box>
  );
}

function EnvGroupCard({ group }: { group: EnvCheckGroup }) {
  const Icon = GROUP_ICONS[group.id] ?? Monitor;
  const color = GROUP_COLORS[group.id] ?? { bg: '#F5F5F5', fg: '#616161' };

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Group Header */}
      <Box
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'action.hover',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: color.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={18} weight="bold" color={color.fg} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {group.name}
        </Typography>
        <Chip
          label={`${group.items.length} 项`}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: 10, ml: 'auto' }}
        />
      </Box>

      {/* Group Items */}
      <Box sx={{ p: 0.5 }}>
        {group.items.map((item, idx) => {
          const IconComp = STATUS_ICONS[item.status];
          const color = STATUS_COLORS[item.status];
          return (
            <Box
              key={`${item.name}-${idx}`}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
                px: 1.5,
                py: 1,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <IconComp size={18} color={color} weight="fill" style={{ marginTop: 2, flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 100 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="body2" color="text.primary">
                    {item.value}
                  </Typography>
                </Box>
                {item.detail && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                    {item.detail}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ========== Helpers ==========

function getScoreColor(score: number): string {
  if (score >= 80) return STATUS_COLORS.pass;
  if (score >= 60) return STATUS_COLORS.warning;
  return STATUS_COLORS.fail;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
