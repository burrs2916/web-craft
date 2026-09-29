/**
 * 远程桌面（VNC）与服务器环境（nginx）安装确认/就绪提示卡。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */
import { Box, Typography, Button } from '@mui/material';
import type { TFunction } from 'i18next';

export function ContextInstallCards({
  t,
  agentColor,
  mutedBorder,
  isDark,
  loading,
  sessionDead,
  hasRdContext,
  isSrvEnvScene,
  rdStatus,
  srvEnvStatus,
  onAgreeInstall,
  onDeclineInstall,
  onAgreeEnvInstall,
  onDeclineEnvInstall,
}: {
  t: TFunction;
  agentColor: string;
  mutedBorder: string;
  isDark: boolean;
  loading: boolean;
  sessionDead: boolean;
  hasRdContext: boolean;
  isSrvEnvScene: boolean;
  rdStatus: null | 'installed' | 'not_installed';
  srvEnvStatus: null | 'ready' | 'partial' | 'missing';
  onAgreeInstall: () => void;
  onDeclineInstall: () => void;
  onAgreeEnvInstall: () => void;
  onDeclineEnvInstall: () => void;
}) {
  return (
    <>
      {hasRdContext && !isSrvEnvScene && !loading && rdStatus === 'not_installed' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${agentColor}55`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            {t('copilot.rd_install_confirm_title', '检测到远程服务器尚未安装 VNC 远程桌面')}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.rd_install_confirm_desc', '是否让 AI 助手辅助安装并配置？安装过程会修改远程服务器（非交互式安装 TigerVNC 与桌面环境）。')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" variant="text" onClick={onDeclineInstall} disabled={sessionDead}>
              {t('copilot.rd_install_decline', '暂不安装')}
            </Button>
            <Button size="small" variant="contained" onClick={onAgreeInstall} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
              {t('copilot.rd_install_agree', '同意，开始安装')}
            </Button>
          </Box>
        </Box>
      )}
      {hasRdContext && !isSrvEnvScene && !loading && rdStatus === 'installed' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${mutedBorder}`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('copilot.rd_already_installed', '已检测到 VNC 远程桌面，可直接连接使用。')}
          </Typography>
        </Box>
      )}
      {hasRdContext && isSrvEnvScene && !loading && (srvEnvStatus === 'missing' || srvEnvStatus === 'partial') && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${agentColor}55`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            {srvEnvStatus === 'missing'
              ? t('copilot.srv_missing_title', '服务器尚未安装 nginx')
              : t('copilot.srv_partial_title', 'nginx 已安装但尚未就绪（未运行或端口未监听）')}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.srv_install_confirm_desc', '是否让 AI 助手安装并配置部署环境（nginx + systemd 自启 + 防火墙放行 80/443）？过程会修改远程服务器。')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" variant="text" onClick={onDeclineEnvInstall} disabled={sessionDead}>
              {t('copilot.srv_install_decline', '暂不安装')}
            </Button>
            <Button size="small" variant="contained" onClick={onAgreeEnvInstall} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
              {t('copilot.srv_install_agree', '同意，开始安装')}
            </Button>
          </Box>
        </Box>
      )}
      {hasRdContext && isSrvEnvScene && !loading && srvEnvStatus === 'ready' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${mutedBorder}`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('copilot.srv_already_ready', '部署环境已就绪（nginx 运行中），可以开始部署站点。')}
          </Typography>
        </Box>
      )}
    </>
  );
}