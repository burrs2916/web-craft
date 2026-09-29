import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import LinearProgress from '@mui/material/LinearProgress';
import {
  LockKeyIcon,
  CheckCircleIcon,
  WarningIcon,
  XCircleIcon,
  CertificateIcon,
  ArrowCounterClockwiseIcon,
  PlayIcon,
} from '@phosphor-icons/react';

import type { CertInfo } from '../../../proto/ops';
import { InfoRow } from './primitives';
import { formatDate } from './shared';

interface CertViewProps {
  certInfo: CertInfo | null;
  certLoading: boolean;
  siteDomain?: string;
  onRefresh: () => void;
  onCopy: (text: string) => void;
  onRenew: () => void;
}

export function CertView({ certInfo, certLoading, siteDomain, onRefresh, onCopy, onRenew }: CertViewProps) {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
      {certLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : certInfo && certInfo.exists ? (
        <Card variant="outlined" sx={{ maxWidth: 640 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5 }}>
              <Box sx={{
                width: 48, height: 48, borderRadius: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                bgcolor: 'success.lighter',
              }}>
                <LockKeyIcon size={24} color="#66BB6A" weight="fill" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" sx={{ fontSize: 17, fontWeight: 600, mb: 0.5 }}>
                  SSL 证书状态
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip
                    label={certInfo.daysRemaining > 30 ? '有效' : certInfo.daysRemaining > 7 ? '即将过期' : '已过期'}
                    size="small"
                    color={certInfo.daysRemaining > 30 ? 'success' : certInfo.daysRemaining > 7 ? 'warning' : 'error'}
                    icon={certInfo.daysRemaining > 30
                      ? <CheckCircleIcon style={{ width: 14, height: 14 }} />
                      : certInfo.daysRemaining > 7
                        ? <WarningIcon style={{ width: 14, height: 14 }} />
                        : <XCircleIcon style={{ width: 14, height: 14 }} />
                    }
                  />
                  <Typography variant="caption" color="text.secondary">
                    还剩 <b>{certInfo.daysRemaining}</b> 天
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* 有效期进度条 */}
            <Box sx={{ mb: 3 }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, (certInfo.daysRemaining / 90) * 100))}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  bgcolor: '#e5e7eb',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: certInfo.daysRemaining > 30 ? '#66BB6A' : certInfo.daysRemaining > 7 ? '#FFA726' : '#ef4444',
                  },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  颁发: {formatDate(certInfo.notBefore)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  到期: {formatDate(certInfo.notAfter)}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <InfoRow
                label="证书路径"
                value={certInfo.certPath}
                mono
                copyable
                onCopy={() => onCopy(certInfo.certPath)}
              />
              <InfoRow
                label="私钥路径"
                value={certInfo.keyPath}
                mono
                copyable
                onCopy={() => onCopy(certInfo.keyPath)}
              />
              <InfoRow
                label="证书链"
                value={certInfo.chainPath}
                mono
                copyable
                onCopy={() => onCopy(certInfo.chainPath)}
              />
              <InfoRow label="颁发给" value={certInfo.subject} />
              <InfoRow label="颁发者" value={certInfo.issuer} />
              <InfoRow
                label="域名"
                value={certInfo.domains.length > 0 ? certInfo.domains.join(', ') : '—'}
              />
              <InfoRow
                label="SHA256 指纹"
                value={certInfo.fingerprint || '—'}
                mono
                small
                copyable
                onCopy={() => onCopy(certInfo.fingerprint)}
              />
            </Box>
          </CardContent>
          <CardActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button
              size="small"
              startIcon={<ArrowCounterClockwiseIcon size={14} />}
              onClick={onRefresh}
            >
              刷新
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<PlayIcon size={14} />}
              onClick={onRenew}
            >
              续期证书
            </Button>
          </CardActions>
        </Card>
      ) : (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            mb: 2,
          }}>
            <CertificateIcon size={32} weight="light" color="#999" />
          </Box>
          <Typography variant="body1" color="text.primary" sx={{ fontWeight: 500 }}>
            未找到证书文件
        </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            路径：/etc/letsencrypt/live/{siteDomain || 'your-domain'}/fullchain.pem
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            如果你的证书在其他位置，请使用左侧"部署文件"浏览到对应目录
          </Typography>
        </Box>
      )}
    </Box>
  );
}