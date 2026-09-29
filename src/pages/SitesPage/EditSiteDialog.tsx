import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  Tooltip,
  IconButton,
  Divider,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  GlobeHemisphereWestIcon,
  PlusIcon,
  FileTextIcon,
  CloudIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { listSiteDomains, addSiteDomain, removeSiteDomain, checkDomainDns } from '../../core/services/cms.service';
import type { Site, SiteSummary, SiteDomain, DomainDnsStatus, ConnectionConfig } from '../../proto';
import { ServerInfoCard } from './ServerInfoCard';
import { QuickConnDialog } from './QuickConnDialog';

export interface EditSiteDialogProps {
  open: boolean;
  site: SiteSummary | null;
  connections: ConnectionConfig[];
  saving: boolean;
  onClose: () => void;
  onSave: (site: Site) => void;
  onConnectionsChanged?: () => void;
}

/* —— 编辑站点对话框 —— */
export function EditSiteDialog({
  open,
  site,
  connections,
  saving,
  onClose,
  onSave,
  onConnectionsChanged,
}: EditSiteDialogProps) {
  const { t } = useTranslation('cms');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [remotePath, setRemotePath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [quickConnOpen, setQuickConnOpen] = useState(false);
  // 域名管理
  const [domains, setDomains] = useState<SiteDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [dnsResults, setDnsResults] = useState<DomainDnsStatus[]>([]);
  const [dnsLoading, setDnsLoading] = useState(false);

  const sshConnections = useMemo(
    () => connections.filter((c) => c.connection_type === 'ssh'),
    [connections],
  );

  // 打开时初始化表单
  useEffect(() => {
    if (!open || !site) return;
    setName(site.name);
    setDomain(site.domain);
    setConnectionId(site.connection_id || '');
    setFormError(null);
    try {
      const deploy = JSON.parse(site.deploy_config_json || '{}');
      setRemotePath(deploy.remote_path || '');
    } catch {
      setRemotePath('');
    }
  }, [open, site]);

  // 加载域名列表
  useEffect(() => {
    if (!open || !site) return;
    setDomains([]);
    setDnsResults([]);
    setNewDomain('');
    let cancelled = false;
    void (async () => {
      try {
        const list = await listSiteDomains(site.id);
        if (!cancelled) setDomains(list);
      } catch (e) {
        console.error('加载域名列表失败:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, site]);

  const handleAddDomain = useCallback(async () => {
    if (!site || !newDomain.trim()) return;
    setDomainLoading(true);
    try {
      const added = await addSiteDomain(site.id, newDomain.trim(), false);
      setDomains(prev => [...prev, added]);
      setNewDomain('');
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDomainLoading(false);
    }
  }, [site, newDomain]);

  const handleRemoveDomain = useCallback(async (domainId: string) => {
    if (!site) return;
    setDomainLoading(true);
    try {
      await removeSiteDomain(domainId);
      // 后端 delete_with_fallback 已自动同步 sites.domain，无需前端再调 updateSite
      // 重新从服务器加载域名列表，确保与后端状态一致
      const updated = await listSiteDomains(site.id);
      setDomains(updated);
      // 更新主域名输入框：若主域名被删，后端已自动晋升新主域名
      const newPrimary = updated.find(d => d.is_primary);
      setDomain(newPrimary?.domain || '');
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDomainLoading(false);
    }
  }, [site]);

  const handleDnsCheck = useCallback(async () => {
    if (!site) return;
    setDnsLoading(true);
    try {
      const results = await checkDomainDns(site.id);
      setDnsResults(results);
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDnsLoading(false);
    }
  }, [site]);

  const openQuickConn = () => {
    setQuickConnOpen(true);
  };

  /// 与新建保持一致：站点必须绑定远程服务器，工作目录绑定网站时自动同步
  const canSubmit = name.trim().length > 0 && !!connectionId && !saving;

  const handleSubmit = useCallback(() => {
    if (!site) return;
    if (!connectionId) {
      setFormError(t('sites.no_server_required'));
      return;
    }
    setFormError(null);
    try {
      let deployConfig: Record<string, unknown> = {};
      try {
        deployConfig = JSON.parse(site.deploy_config_json || '{}');
      } catch {}
      deployConfig.remote_path = remotePath;
      onSave({
        ...site,
        name: name.trim(),
        domain: domain.trim(),
        connection_id: connectionId,
        deploy_config_json: JSON.stringify(deployConfig),
      });
    } catch (e) {
      setFormError(String(e));
    }
  }, [site, name, domain, connectionId, remotePath, onSave, t]);

  if (!site) return null;

  return (
    <>
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sites.edit_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {/* —— 分组一：基本信息 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <FileTextIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_basic')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
            <TextField
              label={t('sites.form_name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t('sites.form_domain')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              size="small"
              helperText="主域名（保存后生效）。附加域名可在下方管理"
            />
            {/* 域名管理 */}
            {domains.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  域名列表 ({domains.length})
                </Typography>
                {domains.map((d) => {
                  const dns = dnsResults.find(r => r.domain === d.domain);
                  const dnsColor = dns?.status === 'matched' ? 'success' : dns?.status === 'mismatch' ? 'warning' : dns?.status === 'unresolved' ? 'error' : 'default';
                  return (
                    <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                      {d.is_primary && (
                        <Tooltip title="主域名">
                          <CheckCircleIcon size={14} weight="fill" color="#4caf50" />
                        </Tooltip>
                      )}
                      <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace' }}>
                        {d.domain}
                      </Typography>
                      {dns && (
                        <Chip
                          size="small"
                          label={dns.status === 'matched' ? 'DNS 匹配' : dns.status === 'mismatch' ? 'IP 不匹配' : dns.status === 'unresolved' ? '未解析' : '未检测'}
                          color={dnsColor as any}
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                      )}
                      <IconButton size="small" onClick={() => handleRemoveDomain(d.id)} disabled={domainLoading} sx={{ p: 0.25 }}>
                        <TrashIcon size={14} />
                      </IconButton>
                    </Box>
                  );
                })}
              </Box>
            )}
            {/* 添加域名 + DNS 检测 */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="添加域名..."
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }}
                sx={{ flex: 1 }}
              />
              <Button size="small" onClick={handleAddDomain} disabled={domainLoading || !newDomain.trim()} startIcon={<PlusIcon size={14} />}>
                添加
              </Button>
              <Button size="small" variant="outlined" onClick={handleDnsCheck} disabled={dnsLoading || domains.length === 0} startIcon={dnsLoading ? <CircularProgress size={14} /> : <GlobeHemisphereWestIcon size={14} />}>
                DNS
              </Button>
            </Box>
            {dnsResults.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {dnsResults.filter(r => r.domain).map((r) => (
                  <Typography key={r.domain} variant="caption" color="text.secondary">
                    {r.domain}: {r.resolved_ip || '未解析'} {r.server_ip ? `→ ${r.server_ip}` : ''} — {r.detail}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        <Divider sx={{ mx: -1 }} />

        {/* —— 分组二：部署目标 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <CloudIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_deploy')}
            </Typography>
            {connectionId && (
              <Chip
                label={t('sites.deploy_enabled')}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: 11, ml: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ pl: 0.25 }}>
            {connectionId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ServerInfoCard
                  connectionId={connectionId}
                  connections={connections}
                  onChange={openQuickConn}
                />
                <TextField
                  label={t('sites.form_remote_path')}
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/var/www/example.com/html"
                  fullWidth
                  size="small"
                />
              </Box>
            ) : (
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5,
                  textAlign: 'center',
                  borderStyle: 'dashed',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                  <CloudIcon size={32} weight="thin" />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {sshConnections.length > 0 ? t('sites.pick_server_title') : t('sites.no_server_title')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300 }}>
                  {t('sites.no_server_required')}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={openQuickConn}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ mt: 0.5, textTransform: 'none', borderRadius: '8px' }}
                >
                  {sshConnections.length > 0 ? t('sites.choose_server_btn') : t('sites.add_first_server')}
                </Button>
              </Paper>
            )}
          </Box>
        </Box>


        {formError && <Alert severity="error" sx={{ mt: 0.5 }}>{formError}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving}>
          {t('common:action.cancel')}
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PencilIcon size={18} weight="bold" />}>
          {t('sites.action_save')}
        </Button>
      </DialogActions>
    </Dialog>

    {/* 快速新建连接对话框 */}
    <QuickConnDialog
      open={quickConnOpen}
      connections={connections}
      selectedConnectionId={connectionId}
      domain={domain}
      onClose={() => setQuickConnOpen(false)}
      onPicked={(id, path) => {
        setConnectionId(id);
        if (path) setRemotePath(path);
        setQuickConnOpen(false);
      }}
      onConnectionsChanged={onConnectionsChanged}
    />
    </>
  );
}