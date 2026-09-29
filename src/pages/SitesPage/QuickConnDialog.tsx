import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Alert,
  IconButton,
  Divider,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  GlobeHemisphereWestIcon,
  PlusIcon,
  FolderOpenIcon,
  FileTextIcon,
  CloudIcon,
  LightningIcon,
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  CheckCircleIcon,
  XCircleIcon,
  WifiHighIcon,
  MagnifyingGlassIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { testConnection, saveConnection } from '../../core/services/connection.service';
import type { SshConnectionInfo, ConnectionConfig } from '../../proto';
import { generateId } from '../../core/utils';

export interface QuickConnDialogProps {
  open: boolean;
  connections: ConnectionConfig[];
  /// 当前已选中的连接 id（列表高亮用）
  selectedConnectionId: string;
  /// 打开时用于预填服务器名，并在选定后推导远程路径
  domain: string;
  /// 新建模式下是否自动聚焦「服务器地址」输入框
  autoFocusHost?: boolean;
  onClose: () => void;
  /// 选定或新建连接后回调：连接 id + 按域名推导的远程路径（无域名时 undefined）
  onPicked: (connectionId: string, remotePath?: string) => void;
  onConnectionsChanged?: () => void;
  /// 「打开连接管理器」行为（新建站点流程跳转 /connections；编辑流程仅关闭）
  onOpenConnManager?: () => void;
}

/// 快速选择 / 新建 SSH 连接弹窗（新建站点与编辑站点共用）
export function QuickConnDialog({
  open,
  connections,
  selectedConnectionId,
  domain,
  autoFocusHost,
  onClose,
  onPicked,
  onConnectionsChanged,
  onOpenConnManager,
}: QuickConnDialogProps) {
  const { t } = useTranslation('cms');

  const [qcMode, setQcMode] = useState<'list' | 'new'>('list');
  const [qcSearch, setQcSearch] = useState('');
  const [qcName, setQcName] = useState('');
  const [qcHost, setQcHost] = useState('');
  const [qcPort, setQcPort] = useState('22');
  const [qcUser, setQcUser] = useState('root');
  const [qcAuth, setQcAuth] = useState<'password' | 'private_key'>('password');
  const [qcPassword, setQcPassword] = useState('');
  const [qcKeyPath, setQcKeyPath] = useState('');
  const [qcShowPassword, setQcShowPassword] = useState(false);
  const [qcSaving, setQcSaving] = useState(false);
  const [qcTesting, setQcTesting] = useState(false);
  const [qcTestResult, setQcTestResult] = useState<'ok' | 'fail' | null>(null);
  const [qcError, setQcError] = useState<string | null>(null);

  const sshConnections = useMemo(
    () => connections.filter((c) => c.connection_type === 'ssh'),
    [connections],
  );

  // 搜索过滤后的连接列表
  const filteredConnections = useMemo(() => {
    if (!qcSearch.trim()) return sshConnections;
    const kw = qcSearch.trim().toLowerCase();
    return sshConnections.filter((c) => {
      if (c.name.toLowerCase().includes(kw)) return true;
      try {
        const s = JSON.parse(c.config_json);
        return (
          s.host?.toLowerCase().includes(kw) ||
          s.username?.toLowerCase().includes(kw) ||
          `${s.username}@${s.host}`.toLowerCase().includes(kw)
        );
      } catch {
        return false;
      }
    });
  }, [sshConnections, qcSearch]);

  // 每次打开时重置表单（与旧实现的 openQuickConn 一致）
  useEffect(() => {
    if (!open) return;
    setQcMode('list');
    setQcSearch('');
    setQcName(domain.trim() || '');
    setQcHost('');
    setQcPort('22');
    setQcUser('root');
    setQcAuth('password');
    setQcPassword('');
    setQcKeyPath('');
    setQcError(null);
    setQcTestResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildSshConfig = (): SshConnectionInfo | null => {
    if (!qcHost.trim()) return null;
    const portNum = Number(qcPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return null;
    if (!qcUser.trim()) return null;

    const base: SshConnectionInfo = {
      host: qcHost.trim(),
      port: portNum,
      username: qcUser.trim(),
      auth_method: qcAuth,
    };
    if (qcAuth === 'password') {
      return { ...base, password: qcPassword };
    } else if (qcAuth === 'private_key') {
      return { ...base, private_key_path: qcKeyPath };
    }
    return base;
  };

  const handleTestConnection = useCallback(async () => {
    setQcTesting(true);
    setQcError(null);
    setQcTestResult(null);
    try {
      const config = buildSshConfig();
      if (!config) throw new Error('请先填写服务器地址、端口和用户名');
      if (qcAuth === 'private_key' && !qcKeyPath.trim()) throw new Error('请选择私钥文件');
      await testConnection(config, 8000);
      setQcTestResult('ok');
    } catch (e) {
      setQcTestResult('fail');
      setQcError(String(e));
    } finally {
      setQcTesting(false);
    }
  }, [qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath]);

  const handleQuickConnSave = useCallback(async () => {
    setQcSaving(true);
    setQcError(null);
    try {
      if (!qcHost.trim()) throw new Error('请输入服务器地址');
      const portNum = Number(qcPort);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new Error('端口号无效');
      if (!qcUser.trim()) throw new Error('请输入用户名');

      const base: SshConnectionInfo = {
        host: qcHost.trim(),
        port: portNum,
        username: qcUser.trim(),
        auth_method: qcAuth,
      };
      let configJson: string;
      if (qcAuth === 'password') {
        configJson = JSON.stringify({ ...base, password: qcPassword });
      } else if (qcAuth === 'private_key') {
        configJson = JSON.stringify({ ...base, private_key_path: qcKeyPath });
      } else {
        configJson = JSON.stringify(base);
      }

      const connName = qcName.trim() || `${qcUser.trim()}@${qcHost.trim()}`;
      const conn: ConnectionConfig = {
        id: generateId(),
        name: connName,
        connection_type: 'ssh',
        config_json: configJson,
        created_at: Date.now(),
      };
      await saveConnection(conn);
      onPicked(conn.id, domain.trim() ? `/var/www/${domain.trim()}/html` : undefined);
      onConnectionsChanged?.();
    } catch (e) {
      setQcError(String(e));
    } finally {
      setQcSaving(false);
    }
  }, [qcName, qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath, domain, onPicked, onConnectionsChanged]);

  const pickKeyFile = useCallback(async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: 'SSH Key', extensions: ['pem', 'key', 'pub'] }],
      title: '选择私钥文件',
    });
    if (typeof selected === 'string' && selected) setQcKeyPath(selected);
  }, []);

  const handlePickConnection = (conn: ConnectionConfig) => {
    onPicked(conn.id, domain.trim() ? `/var/www/${domain.trim()}/html` : undefined);
  };

  const hasServers = sshConnections.length > 0;

  return (
    <Dialog open={open} onClose={qcSaving ? undefined : onClose} maxWidth="sm" fullWidth>
      {qcMode === 'list' ? (
        /* —— 模式一：连接列表选择 —— */
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <CloudIcon size={20} color="#7c3aed" weight="fill" />
            {t('sites.choose_server')}
          </DialogTitle>
          <DialogContent sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('sites.choose_server_desc')}
            </Typography>

            {/* 搜索框 */}
            {hasServers && (
              <TextField
                size="small"
                fullWidth
                placeholder={t('sites.search_placeholder')}
                value={qcSearch}
                onChange={(e) => setQcSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <MagnifyingGlassIcon size={16} color="text.secondary" style={{ marginRight: 8 }} />,
                  },
                }}
                sx={{ mb: 2 }}
              />
            )}

            {hasServers ? (
              filteredConnections.length > 0 ? (
                <Box sx={{ maxHeight: 280, overflow: 'auto', mx: -1, px: 1 }}>
                  {filteredConnections.map((conn) => {
                    let subtitle = '';
                    try {
                      const s = JSON.parse(conn.config_json);
                      subtitle = `${s.username}@${s.host}:${s.port}`;
                    } catch {}
                    const isSelected = selectedConnectionId === conn.id;
                    return (
                      <Box
                        key={conn.id}
                        onClick={() => handlePickConnection(conn)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          mb: 0.5,
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isSelected ? 'primary.main' : 'divider',
                          bgcolor: isSelected ? 'action.selected' : 'background.paper',
                          transition: 'all 0.15s',
                          '&:hover': {
                            bgcolor: isSelected ? 'action.selected' : 'action.hover',
                            borderColor: isSelected ? 'primary.main' : 'primary.light',
                          },
                        }}
                      >
                        <LightningIcon size={18} color="#F59E0B" weight="fill" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{conn.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {subtitle}
                          </Typography>
                        </Box>
                        {isSelected && (
                          <CheckCircleIcon size={18} weight="fill" color="primary.main" />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('sites.no_matching_server')}
                  </Typography>
                </Box>
              )
            ) : (
              /* 无连接时的空状态 */
              <Box
                sx={{
                  p: 3,
                  borderRadius: '12px',
                  border: '1px dashed',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CloudIcon size={36} weight="thin" color="text.secondary" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('sites.no_saved_server')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 280 }}>
                  {t('sites.no_saved_server_desc')}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ mt: 0.5, textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_first_server')}
                </Button>
              </Box>
            )}

            {/* 底部操作区 */}
            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
              {hasServers && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_new_server')}
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                color="inherit"
                onClick={() => { onClose(); onOpenConnManager?.(); }}
                endIcon={<ArrowSquareOutIcon size={14} />}
                sx={{ textTransform: 'none', fontSize: 12, opacity: 0.8 }}
              >
                {t('sites.open_conn_manager')}
              </Button>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={onClose}>
              {t('common:action.cancel')}
            </Button>
          </DialogActions>
        </>
      ) : (
        /* —— 模式二：新建 SSH 连接 —— */
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <LightningIcon size={20} color="#F59E0B" weight="fill" />
            {t('sites.quick_add_server')}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            {/* —— 分组一：服务器信息 —— */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <GlobeHemisphereWestIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_server_info')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  label={t('sites.server_name')}
                  value={qcName}
                  onChange={(e) => setQcName(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="我的服务器"
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    label={t('sites.server_host')}
                    value={qcHost}
                    onChange={(e) => { setQcHost(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ flex: 1 }}
                    placeholder="1.2.3.4"
                    autoFocus={autoFocusHost}
                  />
                  <TextField
                    label={t('sites.server_port')}
                    value={qcPort}
                    onChange={(e) => { setQcPort(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ width: 90 }}
                  />
                </Box>
                <TextField
                  label={t('sites.server_username')}
                  value={qcUser}
                  onChange={(e) => { setQcUser(e.target.value); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                />
              </Box>
            </Box>

            <Divider sx={{ mx: -1 }} />

            {/* —— 分组二：认证方式 —— */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LockIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_auth')}
                </Typography>
                {qcTestResult === 'ok' && (
                  <Chip
                    label={t('sites.test_ok')}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11, ml: 0.5 }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  select
                  label={t('sites.server_auth')}
                  value={qcAuth}
                  onChange={(e) => { setQcAuth(e.target.value as 'password' | 'private_key'); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="password">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LockIcon size={14} />
                      <span>{t('sites.auth_password')}</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="private_key">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileTextIcon size={14} />
                      <span>{t('sites.auth_private_key')}</span>
                    </Box>
                  </MenuItem>
                </TextField>

                {qcAuth === 'password' && (
                  <TextField
                    label={t('sites.server_password')}
                    value={qcPassword}
                    onChange={(e) => { setQcPassword(e.target.value); setQcTestResult(null); }}
                    size="small"
                    type={qcShowPassword ? 'text' : 'password'}
                    fullWidth
                    slotProps={{
                      input: {
                        endAdornment: (
                          <IconButton size="small" onClick={() => setQcShowPassword(!qcShowPassword)} edge="end">
                            {qcShowPassword ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                          </IconButton>
                        ),
                      },
                    }}
                  />
                )}

                {qcAuth === 'private_key' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                      label={t('sites.server_key_path')}
                      value={qcKeyPath}
                      onChange={(e) => { setQcKeyPath(e.target.value); setQcTestResult(null); }}
                      size="small"
                      fullWidth
                      placeholder="~/.ssh/id_rsa"
                      slotProps={{
                        input: {
                          endAdornment: (
                            <Button
                              size="small"
                              onClick={pickKeyFile}
                              sx={{ flexShrink: 0, textTransform: 'none', borderRadius: '6px' }}
                              startIcon={<FolderOpenIcon size={14} weight="bold" />}
                            >
                              {t('sites.action_choose')}
                            </Button>
                          ),
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {t('sites.key_formats')}
                    </Typography>
                  </Box>
                )}

                {/* 测试连接按钮 */}
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleTestConnection}
                  disabled={qcTesting || !qcHost.trim()}
                  startIcon={
                    qcTesting
                      ? <CircularProgress size={14} color="inherit" />
                      : qcTestResult === 'ok'
                        ? <CheckCircleIcon size={14} weight="fill" color="success.main" />
                        : qcTestResult === 'fail'
                          ? <XCircleIcon size={14} weight="fill" color="error.main" />
                          : <WifiHighIcon size={14} />
                  }
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    alignSelf: 'flex-start',
                    color: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                    borderColor: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                  }}
                >
                  {qcTesting
                    ? t('sites.testing')
                    : qcTestResult === 'ok'
                      ? t('sites.test_ok')
                      : qcTestResult === 'fail'
                        ? t('sites.test_fail')
                        : t('sites.test_connection')}
                </Button>
              </Box>
            </Box>

            {qcError && <Alert severity="error" sx={{ fontSize: 13 }}>{qcError}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setQcMode('list')} disabled={qcSaving}>
              {t('sites.back_to_list')}
            </Button>
            <Button
              variant="contained"
              onClick={handleQuickConnSave}
              disabled={qcSaving}
              startIcon={qcSaving ? <CircularProgress size={16} color="inherit" /> : <PlusIcon size={16} weight="bold" />}
            >
              {t('sites.action_save')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}