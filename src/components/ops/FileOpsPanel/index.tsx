import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import type { SxProps } from '@mui/material/styles';

import { opsReadFile, opsWriteFile, opsListDir, opsGetCertInfo, opsRunScript, opsListScripts, opsScriptRuns } from '../../../core/services/ops.service';
import type { RemoteFileItem, RemoteFileContent, CertInfo, OpsScript, OpsDanger, RemoteExecResult, OpsScriptRun } from '../../../proto/ops';

import { CATEGORIES, type OpsCategory, type NginxQuickItem } from './shared';
import { NginxQuickView } from './NginxQuickView';
import { SystemQuickView } from './SystemQuickView';
import { DeployBrowser } from './DeployBrowser';
import { FileEditorView } from './FileEditorView';
import { CertView } from './CertView';
import { ScriptLibraryView } from './ScriptLibraryView';
import { ScriptRunDialog } from './ScriptRunDialog';

interface FileOpsPanelProps {
  connectionId: string;
  siteDomain?: string;
  deployPath?: string;
  /** 当用户点击"运维脚本"分类时回调，用于切换到脚本面板（已废弃，脚本库已集成在面板内） */
  onOpenScripts?: () => void;
  siteId?: string;
  sx?: SxProps;
}

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

  // 从快捷入口进入目录（构造最小可用目录项）
  const handleEnterQuickDir = useCallback((path: string, name: string) => {
    void handleEnterDir({ name, path, isDir: true, size: 0, modifiedAt: 0, permissions: '', owner: '', group: '' });
  }, [handleEnterDir]);

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

  // 关闭文件视图
  const handleBackFromFile = useCallback(() => {
    if (isDirty && editing) {
      if (!confirm('文件有未保存的修改，确定要离开吗？')) return;
    }
    setSelectedFile(null);
    setEditing(false);
    setIsDirty(false);
  }, [isDirty, editing]);

  // 取消编辑
  const handleCancelEdit = useCallback(() => {
    if (!selectedFile) return;
    setEditing(false);
    setEditContent(selectedFile.content);
    setIsDirty(false);
  }, [selectedFile]);

  // 编辑内容变更
  const handleChangeContent = useCallback((value: string) => {
    setEditContent(value);
    setIsDirty(true);
  }, []);

  // 刷新当前文件
  const handleRefreshFile = useCallback(() => {
    if (!selectedFile) return;
    void handleOpenFile(selectedFile.path);
  }, [selectedFile, handleOpenFile]);

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

  // 脚本参数变更
  const handleParamChange = useCallback((name: string, value: string) => {
    setParamValues((s) => ({ ...s, [name]: value }));
  }, []);

  // 用历史参数重跑
  const handleRerunWithParams = useCallback((item: OpsScriptRun) => {
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
  }, [activeScript]);

  // 续期证书
  const handleRenewCert = useCallback(() => {
    if (!connectionId) return;
    if (!confirm('确定要续期证书吗？这将调用 certbot renew 命令。')) return;
    setError('');
    opsRunScript('ops-cert-renew', { domain: siteDomain || '' }, connectionId)
      .then(() => {
        alert('证书续期命令已执行，请刷新查看结果');
        void loadCategoryContent();
      })
      .catch((e) => setError(String(e)));
  }, [connectionId, siteDomain, loadCategoryContent]);

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
          <NginxQuickView
            items={nginxQuickItems}
            onOpenFile={(path) => void handleOpenFile(path)}
            onOpenDir={handleEnterQuickDir}
          />
        )}

        {/* 部署文件 / 目录浏览视图 */}
        {category === 'deploy' && !selectedFile && (
          <DeployBrowser
            breadcrumbs={breadcrumbs}
            loading={loading}
            fileList={fileList}
            onEnterDir={(item) => void handleEnterDir(item)}
            onOpenFile={(path) => void handleOpenFile(path)}
            onRefresh={() => void loadCategoryContent()}
          />
        )}

        {/* 系统文件 */}
        {category === 'system' && !selectedFile && (
          <SystemQuickView onOpenFile={(path) => void handleOpenFile(path)} />
        )}

        {/* 文件编辑器视图 */}
        {selectedFile && (
          <FileEditorView
            file={selectedFile}
            editing={editing}
            editContent={editContent}
            saving={saving}
            isDirty={isDirty}
            onBack={handleBackFromFile}
            onChangeContent={handleChangeContent}
            onCancelEdit={handleCancelEdit}
            onStartEdit={() => setEditing(true)}
            onSave={() => void handleSaveFile()}
            onCopyPath={(path) => void handleCopy(path)}
            onRefresh={handleRefreshFile}
            onOpenScriptById={openScriptById}
          />
        )}

        {/* SSL 证书视图 */}
        {category === 'cert' && (
          <CertView
            certInfo={certInfo}
            certLoading={certLoading}
            siteDomain={siteDomain}
            onRefresh={() => void loadCategoryContent()}
            onCopy={(text) => void handleCopy(text)}
            onRenew={handleRenewCert}
          />
        )}

        {/* 运维脚本视图 */}
        {category === 'scripts' && (
          <ScriptLibraryView
            scriptLoading={scriptLoading}
            scripts={scripts}
            scriptSearch={scriptSearch}
            onSearchChange={setScriptSearch}
            scriptCategory={scriptCategory}
            onCategoryChange={setScriptCategory}
            recentScriptIds={recentScriptIds}
            searchInputRef={searchInputRef}
            connectionId={connectionId}
            onOpenScript={handleOpenScript}
          />
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
      <ScriptRunDialog
        activeScript={activeScript}
        scriptRunning={scriptRunning}
        scriptResult={scriptResult}
        paramValues={paramValues}
        onParamChange={handleParamChange}
        runConfirmed={runConfirmed}
        onConfirm={() => setRunConfirmed(true)}
        runDialogTab={runDialogTab}
        onTabChange={setRunDialogTab}
        runHistory={runHistory}
        runHistoryLoading={runHistoryLoading}
        selectedHistoryItem={selectedHistoryItem}
        onSelectHistoryItem={setSelectedHistoryItem}
        onClose={() => setActiveScript(null)}
        onRun={() => void handleRunScript()}
        onCopyText={(text) => void handleCopy(text)}
        onRerunWithParams={handleRerunWithParams}
      />
    </Box>
  );
}