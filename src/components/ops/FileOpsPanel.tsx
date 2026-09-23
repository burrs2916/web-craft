import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import {
  GearIcon,
  CertificateIcon,
  FolderIcon,
  HardDrivesIcon,
  TerminalIcon,
  FileTextIcon,
  ArrowLeftIcon,
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  FloppyDiskIcon,
  FolderOpenIcon,
  LockKeyIcon,
  CopyIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilSimpleIcon,
  HouseIcon,
  CaretRightIcon,
  WarningIcon,
  PlayIcon,
  ShieldCheckIcon,
  ClockIcon,
  DatabaseIcon,
  ArchiveIcon,
  PulseIcon,
  CheckSquareIcon,
  MagnifyingGlassIcon,
  CpuIcon,
  PlugIcon,
} from '@phosphor-icons/react';
import type { SxProps } from '@mui/material/styles';

import { opsReadFile, opsWriteFile, opsListDir, opsGetCertInfo, opsRunScript, opsListScripts, opsScriptRuns } from '../../core/services/ops.service';
import type { RemoteFileItem, RemoteFileContent, CertInfo, OpsScript, OpsDanger, ScriptParam, RemoteExecResult, OpsScriptRun } from '../../proto/ops';

type OpsCategory = 'nginx' | 'cert' | 'deploy' | 'system' | 'scripts';

interface FileOpsPanelProps {
  connectionId: string;
  siteDomain?: string;
  deployPath?: string;
  /** 当用户点击"运维脚本"分类时回调，用于切换到脚本面板（已废弃，脚本库已集成在面板内） */
  onOpenScripts?: () => void;
  siteId?: string;
  sx?: SxProps;
}

interface NginxQuickItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  desc: string;
}

// ---------- 常量 ----------

const CATEGORIES: { key: OpsCategory; label: string; icon: typeof GearIcon; color: string }[] = [
  { key: 'nginx', label: 'Nginx 配置', icon: GearIcon, color: '#1976d2' },
  { key: 'cert', label: 'SSL 证书', icon: CertificateIcon, color: '#66BB6A' },
  { key: 'deploy', label: '部署文件', icon: FolderIcon, color: '#9c27b0' },
  { key: 'system', label: '系统文件', icon: HardDrivesIcon, color: '#ff9800' },
  { key: 'scripts', label: '运维脚本', icon: TerminalIcon, color: '#757575' },
];

// 常用系统文件快捷入口
const SYSTEM_QUICK_FILES: NginxQuickItem[] = [
  { name: 'hosts', path: '/etc/hosts', type: 'file', desc: '主机名解析' },
  { name: 'crontab', path: '/etc/crontab', type: 'file', desc: '系统定时任务' },
  { name: 'resolv.conf', path: '/etc/resolv.conf', type: 'file', desc: 'DNS 配置' },
  { name: 'fstab', path: '/etc/fstab', type: 'file', desc: '磁盘挂载' },
];

// 脚本子分类
const SCRIPT_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'web', label: '网站服务' },
  { key: 'cert', label: '证书管理' },
  { key: 'system', label: '系统运维' },
  { key: 'db', label: '数据库' },
  { key: 'backup', label: '备份' },
  { key: 'deploy', label: '部署' },
];

// 脚本按服务分组配置
interface ScriptGroup {
  key: string;
  name: string;
  description: string;
  icon: typeof DatabaseIcon;
  category: string; // 所属主分类，用于分类过滤
  scriptIds: string[]; // 组内脚本ID（按显示顺序）
}

const SCRIPT_GROUPS: ScriptGroup[] = [
  {
    key: 'nginx',
    name: 'Nginx 服务',
    description: 'Nginx 配置检查、重启、日志查看',
    icon: GearIcon,
    category: 'web',
    scriptIds: [
      'ops-web-nginx-reload',
      'ops-web-nginx-test',
      'ops-web-nginx-access',
      'ops-web-nginx-error',
      'ops-web-env-check',
    ],
  },
  {
    key: 'cert',
    name: 'SSL 证书',
    description: '证书续期、到期时间查询',
    icon: CertificateIcon,
    category: 'cert',
    scriptIds: [
      'ops-cert-renew',
      'ops-cert-expiry',
    ],
  },
  {
    key: 'postgresql',
    name: 'PostgreSQL',
    description: 'PostgreSQL 数据库运维操作',
    icon: DatabaseIcon,
    category: 'db',
    scriptIds: [
      'ops-db-pg-status',
      'ops-db-pg-backup',
      'ops-db-pg-restore',
      'ops-db-pg-slow',
      'ops-db-pg-vacuum',
    ],
  },
  {
    key: 'redis',
    name: 'Redis',
    description: 'Redis 缓存服务运维操作',
    icon: HardDrivesIcon,
    category: 'db',
    scriptIds: [
      'ops-redis-status',
      'ops-redis-memory',
      'ops-redis-slowlog',
      'ops-redis-restart',
      'ops-redis-flushdb',
    ],
  },
  {
    key: 'backend',
    name: '后端服务',
    description: '后端应用服务状态、重启、日志',
    icon: CpuIcon,
    category: 'system',
    scriptIds: [
      'ops-service-status',
      'ops-service-restart',
      'ops-service-logs',
    ],
  },
  {
    key: 'system',
    name: '系统监控',
    description: '磁盘、内存、CPU、端口等系统信息',
    icon: PulseIcon,
    category: 'system',
    scriptIds: [
      'ops-system-disk',
      'ops-system-mem',
      'ops-system-port',
    ],
  },
  {
    key: 'backup',
    name: '备份工具',
    description: '目录打包、文件备份',
    icon: ArchiveIcon,
    category: 'backup',
    scriptIds: [
      'ops-backup-tar',
    ],
  },
  {
    key: 'deploy',
    name: '部署检查',
    description: '部署后健康检查与验证',
    icon: CheckCircleIcon,
    category: 'deploy',
    scriptIds: [
      'ops-deploy-health',
    ],
  },
];

const DANGER_COLOR: Record<OpsDanger, string> = {
  safe: '#66BB6A',
  careful: '#FFA726',
  dangerous: '#EF5350',
};

const SCRIPT_ICON_MAP: Record<string, typeof FileTextIcon> = {
  'shield-check': ShieldCheckIcon,
  clock: ClockIcon,
  'hard-drive': HardDrivesIcon,
  database: DatabaseIcon,
  archive: ArchiveIcon,
  pulse: PulseIcon,
  'file-text': FileTextIcon,
  'arrow-circular-clockwise': ArrowClockwiseIcon,
  'check-square': CheckSquareIcon,
  'magnifying-glass': MagnifyingGlassIcon,
  cpu: CpuIcon,
  plug: PlugIcon,
};

// ---------- 主组件 ----------

export default function FileOpsPanel({
  connectionId,
  siteDomain,
  deployPath = '/opt/webcraft',
  onOpenScripts: _onOpenScripts,
  siteId,
  sx,
}: FileOpsPanelProps) {
  const [category, setCategory] = useState<OpsCategory>('nginx');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 通用文件浏览状态
  const [currentPath, setCurrentPath] = useState('');
  const [fileList, setFileList] = useState<RemoteFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<RemoteFileContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // 证书信息
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [certLoading, setCertLoading] = useState(false);

  // Nginx 快捷入口
  const [nginxQuickItems, setNginxQuickItems] = useState<NginxQuickItem[]>([]);

  // 脚本库状态
  const [scriptCategory, setScriptCategory] = useState<string>('all');
  const [scriptSearch, setScriptSearch] = useState('');
  const [recentScriptIds, setRecentScriptIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('ops_recent_scripts');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [scripts, setScripts] = useState<OpsScript[]>([]);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [activeScript, setActiveScript] = useState<OpsScript | null>(null);
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scriptResult, setScriptResult] = useState<RemoteExecResult | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [runConfirmed, setRunConfirmed] = useState(false);
  const [runDialogTab, setRunDialogTab] = useState<number>(0); // 0=运行, 1=历史
  const [runHistory, setRunHistory] = useState<OpsScriptRun[]>([]);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<OpsScriptRun | null>(null);

  // 复制成功提示
  const [copyOk, setCopyOk] = useState(false);

  // 保存成功提示
  const [saveOk, setSaveOk] = useState(false);

  // 编辑器 textarea ref（用于计算行号）
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 切换分类
  useEffect(() => {
    setError('');
    setSelectedFile(null);
    setEditing(false);
    setIsDirty(false);
    void loadCategoryContent();
  }, [category, connectionId]);

  // 加载分类内容
  const loadCategoryContent = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    setError('');
    try {
      if (category === 'nginx') {
        // 先构建快捷入口列表
        const slug = siteId?.replace('site-', '') || '';
        const slugShort = slug.slice(0, 8);
        const confName = `webcraft-${slugShort}.conf`;
        const items: NginxQuickItem[] = [
          { name: 'nginx.conf', path: '/etc/nginx/nginx.conf', type: 'file', desc: 'Nginx 主配置' },
          { name: 'conf.d 目录', path: '/etc/nginx/conf.d', type: 'dir', desc: 'CentOS/RHEL 配置目录' },
          { name: 'sites-available', path: '/etc/nginx/sites-available', type: 'dir', desc: 'Debian/Ubuntu 可用站点' },
          { name: 'sites-enabled', path: '/etc/nginx/sites-enabled', type: 'dir', desc: 'Debian/Ubuntu 已启用站点' },
        ];
        if (slugShort) {
          items.push({ name: `${confName}`, path: `/etc/nginx/conf.d/${confName}`, type: 'file', desc: '本站点配置 (conf.d)' });
          items.push({ name: `${confName}`, path: `/etc/nginx/sites-enabled/${confName}`, type: 'file', desc: '本站点配置 (sites-enabled)' });
        }
        setNginxQuickItems(items);
      } else if (category === 'cert') {
        setCertLoading(true);
        try {
          const certPath = siteDomain
            ? `/etc/letsencrypt/live/${siteDomain}/fullchain.pem`
            : '/etc/letsencrypt/live/example.com/fullchain.pem';
          const info = await opsGetCertInfo(connectionId, certPath);
          setCertInfo(info);
        } finally {
          setCertLoading(false);
        }
      } else if (category === 'deploy') {
        const files = await opsListDir(connectionId, deployPath);
        setFileList(files);
        setCurrentPath(deployPath);
      } else if (category === 'system') {
        // 系统文件分类直接显示快捷入口，不需要列目录
        setFileList([]);
        setCurrentPath('/etc');
      } else if (category === 'scripts') {
        setScriptLoading(true);
        try {
          const list = await opsListScripts(scriptCategory === 'all' ? undefined : scriptCategory);
          setScripts(list);
        } catch (e) {
          setError(String(e));
        } finally {
          setScriptLoading(false);
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [category, connectionId, siteDomain, deployPath, siteId, scriptCategory]);

  // 脚本子分类切换时重新加载
  useEffect(() => {
    if (category === 'scripts') {
      void loadCategoryContent();
    }
  }, [scriptCategory]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // `/` 聚焦搜索框（仅在脚本分类且无输入焦点时）
      if (e.key === '/' && category === 'scripts' && !activeScript) {
        const target = e.target as HTMLElement;
        const tagName = target.tagName;
        if (tagName !== 'INPUT' && tagName !== 'TEXTAREA' && !target.isContentEditable) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
      // ESC 关闭脚本对话框
      if (e.key === 'Escape' && activeScript && !scriptRunning) {
        setActiveScript(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [category, activeScript, scriptRunning]);

  // 打开文件
  const handleOpenFile = useCallback(async (path: string) => {
    if (!connectionId) return;
    setLoading(true);
    setError('');
    try {
      const content = await opsReadFile(connectionId, path);
      setSelectedFile(content);
      setEditContent(content.content);
      setEditing(false);
      setIsDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // 进入目录
  const handleEnterDir = useCallback(async (item: RemoteFileItem) => {
    if (!item.isDir || !connectionId) return;
    setLoading(true);
    setError('');
    try {
      const files = await opsListDir(connectionId, item.path);
      setFileList(files);
      setCurrentPath(item.path);
      setSelectedFile(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // 保存文件
  const handleSaveFile = useCallback(async () => {
    if (!connectionId || !selectedFile) return;
    if (!confirm('确定要保存文件修改吗？保存后原文件将被覆盖（会自动创建 .bak 备份）。')) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      await opsWriteFile(connectionId, selectedFile.path, editContent);
      // 重新加载
      const content = await opsReadFile(connectionId, selectedFile.path);
      setSelectedFile(content);
      setEditContent(content.content);
      setEditing(false);
      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [connectionId, selectedFile, editContent]);

  // 复制到剪贴板
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      // ignore
    }
  }, []);

  // 打开脚本运行对话框
  const handleOpenScript = useCallback((s: OpsScript) => {
    setActiveScript(s);
    setScriptResult(null);
    setSelectedHistoryItem(null);
    setRunDialogTab(0);
    // dangerous 和 careful 级别的脚本都需要确认，safe 不需要
    setRunConfirmed(s.dangerLevel === 'safe');

    // 初始化参数：优先用 localStorage 记忆的上次值，其次用默认值，最后智能推断
    const init: Record<string, string> = {};
    const savedKey = `ops_script_params:${s.id}`;
    let saved: Record<string, string> | null = null;
    try {
      const raw = localStorage.getItem(savedKey);
      if (raw) saved = JSON.parse(raw);
    } catch { /* ignore */ }

    for (const p of s.parameters) {
      // 1. 上次保存的值
      if (saved && saved[p.name] !== undefined) {
        init[p.name] = saved[p.name];
        continue;
      }
      // 2. 默认值 / 下拉第一个选项
      if (p.defaultValue) {
        init[p.name] = p.defaultValue;
        continue;
      }
      if (p.options && p.options.length > 0) {
        init[p.name] = p.options[0];
        continue;
      }
      // 3. 智能默认值
      const name = p.name.toLowerCase();
      if (name.endsWith('_host') || name === 'host') init[p.name] = '127.0.0.1';
      else if (name.endsWith('_port') || name === 'port') {
        if (s.id.includes('pg') || s.id.includes('postgresql')) init[p.name] = '5432';
        else if (s.id.includes('redis')) init[p.name] = '6379';
        else init[p.name] = '';
      }
      else if (name.endsWith('_user') || name === 'user' || name === 'username') {
        if (s.id.includes('pg') || s.id.includes('postgresql')) init[p.name] = 'postgres';
        else init[p.name] = '';
      }
      else if (name === 'db_name' || name === 'database') {
        if (siteDomain) init[p.name] = siteDomain.replace(/\./g, '_');
      }
      else if (name === 'service_name') {
        init[p.name] = 'webcraft';
      }
      else if (name === 'backup_path' || name === 'path') {
        init[p.name] = '/opt/webcraft/backup';
      }
      else if (name === 'domain') {
        init[p.name] = siteDomain || '';
      }
      else {
        init[p.name] = '';
      }
    }
    setParamValues(init);

    // 加载执行历史
    if (s.id) {
      setRunHistoryLoading(true);
      opsScriptRuns(s.id, 20)
        .then((list) => setRunHistory(list))
        .catch(() => setRunHistory([]))
        .finally(() => setRunHistoryLoading(false));
    } else {
      setRunHistory([]);
    }
  }, [siteDomain]);

  // 通过脚本ID打开（优先从已加载列表取，找不到用内置脚本的基本信息兜底）
  const openScriptById = useCallback((scriptId: string) => {
    // 1. 从已加载的脚本列表找
    const found = scripts.find((s) => s.id === scriptId);
    if (found) {
      handleOpenScript(found);
      return;
    }
    // 2. 兜底：内置脚本基本信息（最小可用对象）
    const builtinFallback: Record<string, Partial<OpsScript> & { name: string; dangerLevel: OpsDanger; description: string; category: string }> = {
      'ops-web-nginx-test': { name: '测试 Nginx 配置', dangerLevel: 'safe', description: '检查 Nginx 配置语法是否正确', category: 'web' },
      'ops-web-nginx-reload': { name: '重启/重载 Nginx', dangerLevel: 'careful', description: '平滑重载 Nginx 配置', category: 'web' },
    };
    const info = builtinFallback[scriptId];
    if (info) {
      const s: OpsScript = {
        id: scriptId,
        name: info.name,
        description: info.description,
        category: info.category,
        icon: null,
        script: '',
        parameters: [],
        dangerLevel: info.dangerLevel,
        timeoutSecs: 30,
        confirmRequired: info.dangerLevel !== 'safe',
        isBuiltin: true,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      };
      handleOpenScript(s);
    }
  }, [scripts, handleOpenScript]);

  // 运行脚本
  const handleRunScript = useCallback(async () => {
    if (!activeScript || !connectionId) return;
    setScriptRunning(true);
    try {
      const result = await opsRunScript(activeScript.id, paramValues, connectionId);
      setScriptResult(result);

      // 保存参数到 localStorage
      try {
        localStorage.setItem(`ops_script_params:${activeScript.id}`, JSON.stringify(paramValues));
      } catch { /* ignore */ }

      // 记录到最近运行（最多 5 个，去重并置顶）
      try {
        const prev = recentScriptIds.filter((id) => id !== activeScript.id);
        const next = [activeScript.id, ...prev].slice(0, 5);
        setRecentScriptIds(next);
        localStorage.setItem('ops_recent_scripts', JSON.stringify(next));
      } catch { /* ignore */ }

      // 刷新执行历史
      opsScriptRuns(activeScript.id, 20)
        .then((list) => setRunHistory(list))
        .catch(() => {});
    } catch (e) {
      setScriptResult({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: String(e),
        merged: false,
        durationMs: 0,
        channel: 'error',
        truncated: false,
      });
    } finally {
      setScriptRunning(false);
    }
  }, [activeScript, connectionId, paramValues]);

  // 计算行号
  const lineCount = useMemo(() => {
    return editContent.split('\n').length;
  }, [editContent]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // 面包屑
  const breadcrumbs = useMemo(() => {
    if (!currentPath || currentPath === '/') return [{ label: '/', path: '/' }];
    const parts = currentPath.split('/').filter(Boolean);
    const result = [{ label: '/', path: '/' }];
    let acc = '';
    for (const p of parts) {
      acc += '/' + p;
      result.push({ label: p, path: acc });
    }
    return result;
  }, [currentPath]);

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, bgcolor: 'background.default', ...sx }}>
      {/* 左侧分类栏 */}
      <Box
        sx={{
          width: 192,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          py: 1.5,
          overflowY: 'auto',
          bgcolor: 'background.paper',
        }}
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = category === cat.key;
          return (
            <Box
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                mx: 1,
                px: 1.5,
                py: 1.25,
                borderRadius: 1.5,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'text.primary' : 'text.secondary',
                bgcolor: active ? 'action.selected' : 'transparent',
                transition: 'all 0.15s',
                '&:hover': {
                  bgcolor: 'action.hover',
                  color: 'text.primary',
                },
              }}
            >
              <Icon
                size={18}
                weight={active ? 'fill' : 'regular'}
                color={active ? cat.color : undefined}
              />
              <span>{cat.label}</span>
            </Box>
          );
        })}
      </Box>

      {/* 右侧内容区 */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {error && (
          <Alert
            severity="error"
            sx={{ mx: 2, mt: 2, position: 'relative', zIndex: 2 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        {/* Nginx 配置 */}
        {category === 'nginx' && !selectedFile && (
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
              Nginx 配置
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              快速访问常用的 Nginx 配置文件和目录
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
              {nginxQuickItems.map((item) => {
                const Icon = item.type === 'dir' ? FolderOpenIcon : FileTextIcon;
                return (
                  <Card
                    key={item.path}
                    variant="outlined"
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        transform: 'translateY(-1px)',
                      },
                    }}
                    onClick={() => item.type === 'dir'
                      ? void handleEnterDir({ name: item.name, path: item.path, isDir: true, size: 0, modifiedAt: 0, permissions: '', owner: '', group: '' })
                      : void handleOpenFile(item.path)
                    }
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                        <Box sx={{
                          width: 36, height: 36, borderRadius: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: item.type === 'dir' ? 'info.lighter' : 'primary.lighter',
                          color: item.type === 'dir' ? 'info.main' : 'primary.main',
                        }}>
                          <Icon size={20} weight="fill" />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{
                            fontSize: 13, fontWeight: 600,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontFamily: 'monospace',
                          }}>
                            {item.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.desc}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'text.secondary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.path}
                      </Typography>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Box>
        )}

        {/* 部署文件 / 目录浏览视图 */}
        {(category === 'deploy') && !selectedFile && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* 面包屑 + 工具栏 */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2.5,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}>
              <HouseIcon size={14} color="#666" style={{ flexShrink: 0 }} />
              {breadcrumbs.map((crumb, i) => (
                <Box key={crumb.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CaretRightIcon size={12} color="#999" weight="bold" />
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: i === breadcrumbs.length - 1 ? 'text.primary' : 'text.secondary',
                      cursor: 'pointer',
                      fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                      '&:hover': { color: 'primary.main' },
                    }}
                    onClick={() => {
                      if (i === breadcrumbs.length - 1) return;
                      void handleEnterDir({
                        name: crumb.label,
                        path: crumb.path,
                        isDir: true,
                        size: 0, modifiedAt: 0,
                        permissions: '', owner: '', group: '',
                      });
                    }}
                  >
                    {crumb.label}
                  </Typography>
                </Box>
              ))}
              <Box sx={{ flex: 1 }} />
              <Tooltip title="刷新">
                <IconButton size="small" onClick={() => void loadCategoryContent()}>
                  <ArrowCounterClockwiseIcon size={15} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* 文件列表 */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : fileList.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                  <FolderOpenIcon size={40} weight="light" />
                  <Typography variant="body2" sx={{ mt: 1 }}>目录为空</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {fileList.map((item) => {
                    const Icon = item.isDir ? FolderIcon : FileTextIcon;
                    return (
                      <Box
                        key={item.path}
                        onClick={() => item.isDir ? handleEnterDir(item) : handleOpenFile(item.path)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 1.5,
                          py: 1,
                          borderRadius: 1,
                          cursor: 'pointer',
                          transition: 'all 0.1s',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Icon size={16} color={item.isDir ? '#1976d2' : '#666'} />
                        <Box
                          sx={{
                            flex: 1,
                            fontSize: 13,
                            fontFamily: item.isDir ? 'inherit' : 'Menlo, Monaco, Consolas, monospace',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.name}
                        </Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 11, minWidth: 60, textAlign: 'right' }}>
                          {item.isDir ? '—' : formatSize(item.size)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* 系统文件 */}
        {category === 'system' && !selectedFile && (
          <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
            <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
              系统文件
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              常用系统配置文件快捷访问
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
              {SYSTEM_QUICK_FILES.map((item) => (
                <Card
                  key={item.path}
                  variant="outlined"
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      transform: 'translateY(-1px)',
                    },
                  }}
                  onClick={() => void handleOpenFile(item.path)}
                >
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <Box sx={{
                        width: 36, height: 36, borderRadius: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'warning.lighter',
                        color: 'warning.main',
                      }}>
                        <FileTextIcon size={20} weight="fill" />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{
                          fontSize: 13, fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: 'monospace',
                        }}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.desc}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'text.secondary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.path}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Box>
        )}

        {/* 文件编辑器视图 */}
        {selectedFile && (
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
                <IconButton
                  size="small"
                  onClick={() => {
                    if (isDirty && editing) {
                      if (!confirm('文件有未保存的修改，确定要离开吗？')) return;
                    }
                    setSelectedFile(null);
                    setEditing(false);
                    setIsDirty(false);
                  }}
                >
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
                  {selectedFile.path}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1.5, mt: 0.25 }}>
                  <Typography variant="caption" color="text.secondary">
                    {formatSize(selectedFile.size)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    权限 {selectedFile.permissions || '---'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    修改于 {formatDate(selectedFile.modifiedAt)}
                  </Typography>
                </Box>
              </Box>

              {editing ? (
                <>
                  {/* Nginx 配置快捷操作 */}
                  {selectedFile.path.includes('nginx') && selectedFile.path.endsWith('.conf') && (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        color="info"
                        startIcon={<CheckSquareIcon size={13} />}
                        onClick={() => openScriptById('ops-web-nginx-test')}
                      >
                        测试配置
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<ArrowClockwiseIcon size={13} />}
                        onClick={() => openScriptById('ops-web-nginx-reload')}
                      >
                        重载 Nginx
                      </Button>
                    </>
                  )}
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(false);
                      setEditContent(selectedFile.content);
                      setIsDirty(false);
                    }}
                    disabled={saving}
                  >
                    取消
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => void handleSaveFile()}
                    disabled={saving || !isDirty}
                    startIcon={saving ? <CircularProgress size={14} /> : <FloppyDiskIcon size={14} />}
                  >
                    保存
                  </Button>
                </>
              ) : (
                <>
                  {/* Nginx 配置快捷操作 */}
                  {selectedFile.path.includes('nginx') && selectedFile.path.endsWith('.conf') && (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        color="info"
                        startIcon={<CheckSquareIcon size={13} />}
                        onClick={() => openScriptById('ops-web-nginx-test')}
                      >
                        测试配置
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<ArrowClockwiseIcon size={13} />}
                        onClick={() => openScriptById('ops-web-nginx-reload')}
                      >
                        重载 Nginx
                      </Button>
                    </>
                  )}
                  <Tooltip title="复制路径">
                    <IconButton size="small" onClick={() => void handleCopy(selectedFile.path)}>
                      <CopyIcon size={15} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="刷新">
                    <IconButton size="small" onClick={() => void handleOpenFile(selectedFile.path)}>
                      <ArrowCounterClockwiseIcon size={15} />
                    </IconButton>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setEditing(true)}
                    disabled={!selectedFile.isText}
                    startIcon={<PencilSimpleIcon size={14} />}
                  >
                    {selectedFile.isText ? '编辑' : '二进制文件'}
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
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    setIsDirty(true);
                  }}
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
                  {selectedFile.isText ? selectedFile.content : '[ 二进制文件，无法显示 ]'}
                </pre>
              )}
            </Box>
          </Box>
        )}

        {/* SSL 证书视图 */}
        {category === 'cert' && (
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
                      onCopy={() => void handleCopy(certInfo.certPath)}
                    />
                    <InfoRow
                      label="私钥路径"
                      value={certInfo.keyPath}
                      mono
                      copyable
                      onCopy={() => void handleCopy(certInfo.keyPath)}
                    />
                    <InfoRow
                      label="证书链"
                      value={certInfo.chainPath}
                      mono
                      copyable
                      onCopy={() => void handleCopy(certInfo.chainPath)}
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
                      onCopy={() => void handleCopy(certInfo.fingerprint)}
                    />
                  </Box>
                </CardContent>
                <CardActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                  <Button
                    size="small"
                    startIcon={<ArrowCounterClockwiseIcon size={14} />}
                    onClick={() => void loadCategoryContent()}
                  >
                    刷新
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    startIcon={<PlayIcon size={14} />}
                    onClick={() => {
                      if (!connectionId) return;
                      if (!confirm('确定要续期证书吗？这将调用 certbot renew 命令。')) return;
                      setError('');
                      opsRunScript('ops-cert-renew', { domain: siteDomain || '' }, connectionId)
                        .then(() => {
                          alert('证书续期命令已执行，请刷新查看结果');
                          void loadCategoryContent();
                        })
                        .catch((e) => setError(String(e)));
                    }}
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
        )}

        {/* 运维脚本视图 */}
        {category === 'scripts' && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* 子分类标题 */}
            <Box sx={{
              px: 2.5,
              pt: 2,
              pb: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}>
              <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
                运维脚本库
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                内置运维脚本，一键执行，安全可控
              </Typography>
              <TextField
                size="small"
                placeholder="搜索脚本...（按 / 快速聚焦）"
                fullWidth
                value={scriptSearch}
                onChange={(e) => setScriptSearch(e.target.value)}
                sx={{ mb: 1.5 }}
                inputRef={searchInputRef}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <MagnifyingGlassIcon size={16} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {SCRIPT_CATEGORIES.map((cat) => (
                  <Chip
                    key={cat.key}
                    label={cat.label}
                    size="small"
                    color={scriptCategory === cat.key ? 'primary' : 'default'}
                    variant={scriptCategory === cat.key ? 'filled' : 'outlined'}
                    onClick={() => setScriptCategory(cat.key)}
                    sx={{
                      cursor: 'pointer',
                      fontSize: 12,
                      height: 24,
                      '& .MuiChip-label': { px: 1.5 },
                    }}
                  />
                ))}
              </Box>

              {/* 最近运行 */}
              {recentScriptIds.length > 0 && (() => {
                const recentScripts = recentScriptIds
                  .map((id) => scripts.find((s) => s.id === id))
                  .filter((s): s is OpsScript => s !== undefined);
                if (recentScripts.length === 0) return null;
                return (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: 11 }}>
                      🕐 最近运行
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {recentScripts.map((s) => {
                        const Icon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                        return (
                          <Chip
                            key={s.id}
                            size="small"
                            icon={<Icon size={12} color={DANGER_COLOR[s.dangerLevel]} weight="fill" />}
                            label={s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name}
                            onClick={() => handleOpenScript(s)}
                            sx={{
                              cursor: 'pointer',
                              fontSize: 11,
                              height: 22,
                              bgcolor: 'action.hover',
                              '&:hover': { bgcolor: 'action.selected' },
                              '& .MuiChip-label': { px: 1, pl: 0.5 },
                              '& .MuiChip-icon': { ml: 0.75, mr: 0.25 },
                            }}
                          />
                        );
                      })}
                    </Box>
                  </Box>
                );
              })()}
            </Box>

            {/* 脚本分组卡片列表 */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
              {scriptLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : (
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 2,
                }}>
                  {(() => {
                    // 构建脚本 ID → 脚本映射
                    const scriptMap = new Map(scripts.map((s) => [s.id, s]));
                    const keyword = scriptSearch.trim().toLowerCase();

                    // 按分类过滤分组
                    let groups = scriptCategory === 'all'
                      ? SCRIPT_GROUPS
                      : SCRIPT_GROUPS.filter((g) => g.category === scriptCategory);

                    // 按搜索关键词过滤（匹配分组名或组内脚本名）
                    if (keyword) {
                      groups = groups.filter((g) => {
                        if (g.name.toLowerCase().includes(keyword)) return true;
                        if (g.description.toLowerCase().includes(keyword)) return true;
                        return g.scriptIds.some((id) => {
                          const s = scriptMap.get(id);
                          return s && (
                            s.name.toLowerCase().includes(keyword) ||
                            s.description.toLowerCase().includes(keyword)
                          );
                        });
                      });
                    }

                    if (groups.length === 0) {
                      return (
                        <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 10, color: 'text.secondary' }}>
                          {keyword ? <MagnifyingGlassIcon size={40} weight="light" /> : <TerminalIcon size={40} weight="light" />}
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            {keyword ? '没有找到匹配的脚本' : '暂无脚本'}
                          </Typography>
                        </Box>
                      );
                    }

                    return groups.map((group) => {
                      const GroupIcon = group.icon;
                      const groupScripts = group.scriptIds
                        .map((id) => scriptMap.get(id))
                        .filter((s): s is OpsScript => s !== undefined);

                      // 自定义脚本（不在任何内置分组里的）单独处理，后面再加
                      if (groupScripts.length === 0) return null;

                      return (
                        <Card
                          key={group.key}
                          variant="outlined"
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'box-shadow 0.2s',
                            '&:hover': {
                              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            },
                          }}
                        >
                          <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                              <Box
                                sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 2,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: 'primary.main',
                                  color: 'primary.contrastText',
                                }}
                              >
                                <GroupIcon size={20} weight="fill" />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                                  {group.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                                  {group.description}
                                </Typography>
                              </Box>
                              <Chip
                                label={`${groupScripts.length} 项`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: 10,
                                  bgcolor: 'action.hover',
                                  color: 'text.secondary',
                                }}
                              />
                            </Box>
                          </CardContent>
                          <Divider />
                          <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {groupScripts.map((s) => {
                              const runnable = s.enabled && connectionId;
                              const dangerColor = DANGER_COLOR[s.dangerLevel];
                              const ScriptIcon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                              return (
                                <Box
                                  key={s.id}
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    py: 0.75,
                                    px: 1,
                                    borderRadius: 1,
                                    opacity: s.enabled ? 1 : 0.5,
                                    transition: 'background 0.15s',
                                    '&:hover': {
                                      bgcolor: 'action.hover',
                                    },
                                  }}
                                >
                                  <ScriptIcon size={15} color={dangerColor} weight="fill" />
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      flex: 1,
                                      fontSize: 13,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={s.name}
                                  >
                                    {s.name.replace(/^(PostgreSQL|Redis|certbot)\s*/, '')}
                                  </Typography>
                                  {s.dangerLevel !== 'safe' && (
                                    <Box
                                      sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        bgcolor: dangerColor,
                                        flexShrink: 0,
                                      }}
                                      title={s.dangerLevel === 'careful' ? '谨慎' : '危险'}
                                    />
                                  )}
                                  <Button
                                    size="small"
                                    variant="text"
                                    color={s.dangerLevel === 'dangerous' ? 'error' : 'primary'}
                                    disabled={!runnable}
                                    onClick={() => runnable && handleOpenScript(s)}
                                    sx={{
                                      minWidth: 0,
                                      px: 1,
                                      py: 0.25,
                                      fontSize: 12,
                                      fontWeight: 500,
                                    }}
                                  >
                                    运行
                                  </Button>
                                </Box>
                              );
                            })}
                          </Box>
                        </Card>
                      );
                    });
                  })()}

                  {/* 自定义脚本区（未归入任何内置分组的脚本） */}
                  {(() => {
                    const builtinIds = new Set(SCRIPT_GROUPS.flatMap((g) => g.scriptIds));
                    const customScripts = scripts.filter((s) => !builtinIds.has(s.id));
                    if (customScripts.length === 0) return null;
                    // 如果有分类过滤，也要过滤自定义脚本
                    const filtered = scriptCategory === 'all'
                      ? customScripts
                      : customScripts.filter((s) => s.category === scriptCategory);
                    if (filtered.length === 0) return null;
                    return (
                      <Card
                        variant="outlined"
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gridColumn: scriptCategory !== 'all' ? '1 / -1' : undefined,
                        }}
                      >
                        <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                            <Box
                              sx={{
                                width: 36,
                                height: 36,
                                borderRadius: 2,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'success.main',
                                color: 'success.contrastText',
                              }}
                            >
                              <PencilSimpleIcon size={20} weight="fill" />
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
                                自定义脚本
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                                您创建的自定义运维脚本
                              </Typography>
                            </Box>
                            <Chip
                              label={`${filtered.length} 项`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: 10,
                                bgcolor: 'action.hover',
                                color: 'text.secondary',
                              }}
                            />
                          </Box>
                        </CardContent>
                        <Divider />
                        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {filtered.map((s) => {
                            const runnable = s.enabled && connectionId;
                            const dangerColor = DANGER_COLOR[s.dangerLevel];
                            const ScriptIcon = SCRIPT_ICON_MAP[s.icon ?? ''] ?? TerminalIcon;
                            return (
                              <Box
                                key={s.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1,
                                  py: 0.75,
                                  px: 1,
                                  borderRadius: 1,
                                  opacity: s.enabled ? 1 : 0.5,
                                  '&:hover': { bgcolor: 'action.hover' },
                                }}
                              >
                                <ScriptIcon size={15} color={dangerColor} weight="fill" />
                                <Typography variant="body2" sx={{ flex: 1, fontSize: 13 }}>
                                  {s.name}
                                </Typography>
                                {s.dangerLevel !== 'safe' && (
                                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: dangerColor }} />
                                )}
                                <Button
                                  size="small"
                                  variant="text"
                                  color={s.dangerLevel === 'dangerous' ? 'error' : 'primary'}
                                  disabled={!runnable}
                                  onClick={() => runnable && handleOpenScript(s)}
                                  sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 12 }}
                                >
                                  运行
                                </Button>
                              </Box>
                            );
                          })}
                        </Box>
                      </Card>
                    );
                  })()}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* 复制成功提示 */}
      <Snackbar
        open={copyOk}
        autoHideDuration={1500}
        onClose={() => setCopyOk(false)}
        message="已复制到剪贴板"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* 保存成功提示 */}
      <Snackbar
        open={saveOk}
        autoHideDuration={2000}
        onClose={() => setSaveOk(false)}
        message="保存成功"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      {/* 脚本运行对话框 */}
      <Dialog
        open={Boolean(activeScript)}
        onClose={() => { if (!scriptRunning) setActiveScript(null); }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeScript && (
              <Chip
                label={activeScript.dangerLevel === 'safe' ? '安全' : activeScript.dangerLevel === 'careful' ? '谨慎' : '危险'}
                size="small"
                sx={{
                  height: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  bgcolor: `${DANGER_COLOR[activeScript.dangerLevel]}22`,
                  color: DANGER_COLOR[activeScript.dangerLevel],
                }}
              />
            )}
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{activeScript?.name}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            {activeScript?.description}
          </Typography>
        </DialogTitle>

        <Tabs
          value={runDialogTab}
          onChange={(_, v) => setRunDialogTab(v)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
        >
          <Tab label="运行" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
          <Tab
            label={`历史 ${runHistory.length > 0 ? `(${runHistory.length})` : ''}`}
            sx={{ minHeight: 36, py: 0.5, fontSize: 13 }}
          />
        </Tabs>

        <DialogContent dividers sx={{ p: 0 }}>
          {runDialogTab === 0 && (
            <Box sx={{ p: 3, pb: 2 }}>
              {activeScript && activeScript.dangerLevel !== 'safe' && !runConfirmed && (
                <Alert severity={activeScript.dangerLevel === 'dangerous' ? 'error' : 'warning'} sx={{ mb: 2 }}>
                  {activeScript.dangerLevel === 'dangerous'
                    ? '⚠️ 此为危险级别操作，可能造成数据丢失或服务中断，请确认后再执行'
                    : '此操作为谨慎级别，请确认后再执行'}
                </Alert>
              )}

              {activeScript && activeScript.parameters.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ mb: -1 }}>
                    脚本参数
                  </Typography>
                  {activeScript.parameters.map((p) => (
                    <ScriptParamField
                      key={p.name}
                      param={p}
                      value={paramValues[p.name] ?? ''}
                      onChange={(v) => setParamValues((s) => ({ ...s, [p.name]: v }))}
                    />
                  ))}
                </Box>
              )}

              {scriptResult && (
                <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                  <Box sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 1, bgcolor: 'action.hover',
                  }}>
                    {scriptResult.success
                      ? <CheckCircleIcon size={18} color="#66BB6A" weight="fill" />
                      : <XCircleIcon size={18} color="#EF5350" weight="fill" />}
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {scriptResult.success ? '执行成功' : '执行失败'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      · 退出码 {scriptResult.exitCode}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      · 用时 {scriptResult.durationMs >= 1000 ? `${(scriptResult.durationMs / 1000).toFixed(1)}s` : `${scriptResult.durationMs}ms`}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1.5 }}>
                    {scriptResult.stdout && (
                      <Box sx={{ mb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">标准输出</Typography>
                          <IconButton
                            size="small"
                            sx={{ p: 0.2 }}
                            onClick={() => {
                              navigator.clipboard.writeText(scriptResult.stdout).then(() => setCopyOk(true));
                            }}
                            title="复制输出"
                          >
                            <CopyIcon size={13} />
                          </IconButton>
                        </Box>
                        <pre style={{
                          margin: 0,
                          padding: 10,
                          borderRadius: 6,
                          background: '#0F172A',
                          color: '#E2E8F0',
                          fontSize: 12,
                          lineHeight: 1.5,
                          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 280,
                          overflow: 'auto',
                        }}>
                          {scriptResult.stdout}
                        </pre>
                      </Box>
                    )}
                    {scriptResult.stderr && !scriptResult.merged && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">错误输出</Typography>
                          <IconButton
                            size="small"
                            sx={{ p: 0.2 }}
                            onClick={() => {
                              navigator.clipboard.writeText(scriptResult.stderr).then(() => setCopyOk(true));
                            }}
                            title="复制错误"
                          >
                            <CopyIcon size={13} />
                          </IconButton>
                        </Box>
                        <pre style={{
                          margin: 0,
                          padding: 10,
                          borderRadius: 6,
                          background: '#450a0a',
                          color: '#fecaca',
                          fontSize: 12,
                          lineHeight: 1.5,
                          fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 200,
                          overflow: 'auto',
                        }}>
                          {scriptResult.stderr}
                        </pre>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {runDialogTab === 1 && (
            <Box>
              {runHistoryLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : runHistory.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                  <ClockIcon size={36} weight="light" />
                  <Typography variant="body2" sx={{ mt: 1 }}>暂无执行历史</Typography>
                </Box>
              ) : (
                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                  {runHistory.map((item, idx) => (
                    <Box key={item.id}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.25,
                          cursor: 'pointer',
                          bgcolor: selectedHistoryItem?.id === item.id ? 'action.selected' : 'transparent',
                          '&:hover': { bgcolor: 'action.hover' },
                          transition: 'background 0.15s',
                        }}
                        onClick={() => setSelectedHistoryItem(selectedHistoryItem?.id === item.id ? null : item)}
                      >
                        {item.status === 'success'
                          ? <CheckCircleIcon size={16} color="#66BB6A" weight="fill" />
                          : <XCircleIcon size={16} color="#EF5350" weight="fill" />}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 500 }}>
                            {new Date(item.startedAt).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.connectionName} · 用时 {item.durationMs >= 1000 ? `${(item.durationMs / 1000).toFixed(1)}s` : `${item.durationMs}ms`}
                          </Typography>
                        </Box>
                        <Chip
                          label={item.status === 'success' ? '成功' : '失败'}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 600,
                            bgcolor: item.status === 'success' ? '#66BB6A22' : '#EF535022',
                            color: item.status === 'success' ? '#66BB6A' : '#EF5350',
                          }}
                        />
                      </Box>
                      {selectedHistoryItem?.id === item.id && (
                        <Box sx={{ px: 2, pb: 1.5, bgcolor: 'action.hover' }}>
                          {item.stdout && (
                            <Box sx={{ mb: 1 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">标准输出</Typography>
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.2 }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.stdout).then(() => setCopyOk(true));
                                  }}
                                >
                                  <CopyIcon size={12} />
                                </IconButton>
                              </Box>
                              <pre style={{
                                margin: 0,
                                padding: 8,
                                borderRadius: 4,
                                background: '#0F172A',
                                color: '#E2E8F0',
                                fontSize: 11,
                                lineHeight: 1.4,
                                fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 180,
                                overflow: 'auto',
                              }}>
                                {item.stdout}
                              </pre>
                            </Box>
                          )}
                          {item.stderr && !item.merged && (
                            <Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">错误输出</Typography>
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.2 }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.stderr).then(() => setCopyOk(true));
                                  }}
                                >
                                  <CopyIcon size={12} />
                                </IconButton>
                              </Box>
                              <pre style={{
                                margin: 0,
                                padding: 8,
                                borderRadius: 4,
                                background: '#450a0a',
                                color: '#fecaca',
                                fontSize: 11,
                                lineHeight: 1.4,
                                fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 120,
                                overflow: 'auto',
                              }}>
                                {item.stderr}
                              </pre>
                            </Box>
                          )}
                          <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<PlayIcon size={13} />}
                              onClick={() => {
                                // 用历史参数重新填充并切回运行tab
                                try {
                                  const params = JSON.parse(item.paramsJson);
                                  setParamValues(params);
                                } catch { /* ignore */ }
                                setRunDialogTab(0);
                                setScriptResult(null);
                                if (activeScript) {
                                  setRunConfirmed(activeScript.dangerLevel === 'safe');
                                }
                              }}
                            >
                              用此参数重跑
                            </Button>
                          </Box>
                        </Box>
                      )}
                      {idx < runHistory.length - 1 && <Divider sx={{ mx: 2 }} />}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button disabled={scriptRunning} onClick={() => setActiveScript(null)}>
            关闭
          </Button>
          {activeScript && activeScript.dangerLevel !== 'safe' && !runConfirmed ? (
            <Button
              variant="contained"
              color={activeScript.dangerLevel === 'dangerous' ? 'error' : 'warning'}
              onClick={() => setRunConfirmed(true)}
            >
              确认执行
            </Button>
          ) : (
            <Button
              variant="contained"
              color="success"
              disabled={scriptRunning}
              startIcon={scriptRunning ? <CircularProgress size={16} color="inherit" /> : <PlayIcon size={16} />}
              onClick={() => void handleRunScript()}
            >
              {scriptRunning ? '执行中...' : '运行脚本'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ---------- 子组件 ----------

function InfoRow({
  label,
  value,
  mono,
  small,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', width: 80, flexShrink: 0, fontSize: small ? 12 : 13, pt: 0.25 }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography
          variant={small ? 'caption' : 'body2'}
          sx={{
            flex: 1,
            wordBreak: 'break-all',
            fontFamily: mono ? 'Menlo, Monaco, Consolas, monospace' : 'inherit',
            fontSize: small ? 11 : 13,
          }}
        >
          {value || '—'}
        </Typography>
        {copyable && value && (
          <Tooltip title="复制">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={onCopy}>
              <CopyIcon size={13} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

function ScriptParamField({
  param,
  value,
  onChange,
}: {
  param: ScriptParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = `${param.label}${param.required ? ' *' : ''}`;
  const isMulti = param.kind === 'multiSelect';

  if (param.kind === 'text') {
    return <TextField size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth />;
  }

  if (isMulti) {
    const items = value ? value.split(',') : [];
    const toggleItem = (opt: string) => {
      const next = items.includes(opt) ? items.filter((x) => x !== opt) : [...items, opt];
      onChange(next.join(','));
    };
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          {param.options?.map((opt) => {
            const on = items.includes(opt);
            return (
              <Chip
                key={opt}
                label={opt}
                onClick={() => toggleItem(opt)}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                size="small"
              />
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <TextField
      select
      size="small"
      label={label}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
    >
      {param.options?.map((opt) => (
        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
      ))}
    </TextField>
  );
}
