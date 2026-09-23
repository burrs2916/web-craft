import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import {
  PaletteIcon,
  FloppyDiskIcon,
  CheckCircleIcon,
  ImageIcon,
  XIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { listThemes, updateSite } from '../../core/services/cms.service';
import { mediaGet } from '../../core/services/media.service';
import { MediaLibraryDialog } from './MediaLibraryDialog';
import type { Site, ThemeMeta, ThemeSettingMeta } from '../../proto';
import type { MediaAsset } from '../../proto/cms';

/// 媒体类型设置字段：显示预览图 + 选择/移除按钮
function MediaSettingField({
  label,
  mediaId,
  onPick,
  onRemove,
}: {
  label: string;
  mediaId: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [asset, setAsset] = useState<MediaAsset | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setAsset(null);
      return;
    }
    mediaGet({ assetId: mediaId })
      .then((a) => setAsset(a))
      .catch(() => setAsset(null));
  }, [mediaId]);

  if (!asset) {
    return (
      <Button
        variant="outlined"
        size="small"
        startIcon={<ImageIcon size={16} />}
        onClick={onPick}
        sx={{ textTransform: 'none', borderRadius: '8px', justifyContent: 'flex-start', py: 1.5 }}
        fullWidth
      >
        {label}
      </Button>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 1.5,
        overflow: 'hidden',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? '#0A0E14' : '#F5F5F5',
      }}
    >
      <img
        src={`tauri://localhost/${asset.thumb_path || asset.storage_path}`}
        alt={asset.filename}
        style={{ width: '100%', height: 100, objectFit: 'contain', display: 'block', padding: 8 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {asset.filename}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" onClick={onPick} sx={{ textTransform: 'none', borderRadius: '8px' }}>
            更换
          </Button>
          <IconButton size="small" onClick={onRemove} color="error" sx={{ width: 28, height: 28 }}>
            <XIcon size={14} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

/// 主题配置对话框（FR-T2）：选择内置主题 + 按主题 schema 动态渲染设置表单，
/// 保存到 site.theme_id / site.theme_config_json，重新构建后生效。
export function ThemeConfigDialog({
  open,
  onClose,
  site,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  site: Site;
  onSaved?: () => void;
}) {
  const { t } = useTranslation('cms');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primaryColor = isDark ? '#60A5FA' : '#1D4ED8';

  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [themeId, setThemeId] = useState(site.theme_id || 'craft-blog');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 媒体库对话框（用于 media 类型设置）
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaSettingKey, setMediaSettingKey] = useState<string | null>(null);

  // 导航菜单（nav-list 类型）：从 values.nav_links_json 解析
  const [navItems, setNavItems] = useState<{ label: string; href: string }[]>([]);

  const currentTheme = themes.find((x) => x.id === themeId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listThemes()
      .then((list) => {
        if (cancelled) return;
        setThemes(list);
        const id = list.some((x) => x.id === site.theme_id) ? site.theme_id : list[0]?.id ?? 'craft-blog';
        setThemeId(id);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, site.theme_id]);

  // 主题或配置变化时，用默认值填充缺失字段
  useEffect(() => {
    if (!open) return;
    let cfg: Record<string, unknown> = {};
    try {
      cfg = JSON.parse(site.theme_config_json || '{}');
    } catch {
      cfg = {};
    }
    const next: Record<string, string> = {};
    for (const s of currentTheme?.settings ?? []) {
      const v = cfg[s.key];
      next[s.key] = typeof v === 'string' ? v : s.default;
    }
    setValues(next);
    // 解析导航菜单
    try {
      const navJson = cfg['nav_links_json'];
      if (typeof navJson === 'string' && navJson) {
        const parsed = JSON.parse(navJson);
        if (Array.isArray(parsed)) {
          setNavItems(parsed.map((x: any) => ({ label: x.label || '', href: x.href || '' })));
        } else {
          setNavItems([]);
        }
      } else {
        setNavItems([]);
      }
    } catch {
      setNavItems([]);
    }
    setError(null);
    setSaving(false);
  }, [open, site.theme_config_json, currentTheme]);

  const setValue = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const cfg: Record<string, string> = {};
      for (const s of currentTheme?.settings ?? []) {
        if (s.kind === 'nav-list') {
          // nav-list 类型：序列化 navItems 数组
          const valid = navItems.filter((x) => x.label.trim() && x.href.trim());
          if (valid.length > 0) {
            cfg[s.key] = JSON.stringify(valid);
          }
        } else {
          const v = (values[s.key] ?? '').trim();
          if (v) cfg[s.key] = v;
        }
      }
      const next: Site = { ...site, theme_id: themeId, theme_config_json: JSON.stringify(cfg) };
      await updateSite(next);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [site, themeId, values, currentTheme, navItems, onSaved, onClose]);

  const openMediaPicker = (key: string) => {
    setMediaSettingKey(key);
    setMediaOpen(true);
  };

  const handleMediaSelect = (asset: MediaAsset) => {
    if (mediaSettingKey) {
      setValue(mediaSettingKey, asset.id);
    }
    setMediaOpen(false);
    setMediaSettingKey(null);
  };

  const handleMediaRemove = (key: string) => {
    setValue(key, '');
  };

  // 导航菜单操作
  const addNavItem = () => {
    setNavItems((prev) => [...prev, { label: '', href: '' }]);
    setValue('nav_links_json', ''); // 标记为 dirty
  };

  const updateNavItem = (idx: number, field: 'label' | 'href', value: string) => {
    setNavItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
    setValue('nav_links_json', ''); // 标记为 dirty
  };

  const removeNavItem = (idx: number) => {
    setNavItems((prev) => prev.filter((_, i) => i !== idx));
    setValue('nav_links_json', ''); // 标记为 dirty
  };

  const renderSetting = (s: ThemeSettingMeta) => {
    if (s.kind === 'toggle') {
      const checked = (values[s.key] ?? s.default) === 'true';
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {s.label}
          </Typography>
          <Switch
            checked={checked}
            onChange={(e) => setValue(s.key, e.target.checked ? 'true' : 'false')}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: primaryColor },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: primaryColor,
                opacity: 0.5,
              },
            }}
          />
        </Box>
      );
    }
    if (s.kind === 'color') {
      return (
        <TextField
          label={s.label}
          value={values[s.key] ?? ''}
          onChange={(e) => setValue(s.key, e.target.value)}
          size="small"
          fullWidth
          type="color"
          sx={{
            '& .MuiInputBase-root': { py: 0.25 },
            '& input[type="color"]': { p: 0.25, height: 32, cursor: 'pointer', border: 'none', background: 'none' },
          }}
        />
      );
    }
    if (s.kind === 'select') {
      return (
        <TextField
          select
          label={s.label}
          value={values[s.key] ?? s.default}
          onChange={(e) => setValue(s.key, e.target.value)}
          size="small"
          fullWidth
        >
          {s.options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    if (s.kind === 'textarea') {
      return (
        <TextField
          label={s.label}
          value={values[s.key] ?? ''}
          onChange={(e) => setValue(s.key, e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={3}
        />
      );
    }
    if (s.kind === 'media') {
      const mediaId = values[s.key] ?? '';
      return <MediaSettingField label={s.label} mediaId={mediaId} onPick={() => openMediaPicker(s.key)} onRemove={() => handleMediaRemove(s.key)} />;
    }
    if (s.kind === 'nav-list') {
      return (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {s.label}
            </Typography>
            <Button size="small" startIcon={<PlusIcon size={14} />} onClick={addNavItem} sx={{ textTransform: 'none', borderRadius: '8px' }}>
              {t('theme.nav_add')}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {navItems.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {t('theme.nav_empty')}
              </Typography>
            )}
            {navItems.map((item, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  placeholder={t('theme.nav_label')}
                  value={item.label}
                  onChange={(e) => updateNavItem(idx, 'label', e.target.value)}
                  size="small"
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <TextField
                  placeholder={t('theme.nav_href')}
                  value={item.href}
                  onChange={(e) => updateNavItem(idx, 'href', e.target.value)}
                  size="small"
                  sx={{ flex: 1.2, minWidth: 0 }}
                />
                <IconButton size="small" onClick={() => removeNavItem(idx)} color="error">
                  <TrashIcon size={14} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </Box>
      );
    }
    return (
      <TextField
        label={s.label}
        value={values[s.key] ?? ''}
        onChange={(e) => setValue(s.key, e.target.value)}
        size="small"
        fullWidth
      />
    );
  };

  return (
    <>
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaletteIcon size={20} color={isDark ? '#60A5FA' : '#1D4ED8'} />
        {t('theme.title')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {t('theme.subtitle')}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('theme.select_theme')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {themes.map((th) => {
              const selected = th.id === themeId;
              return (
                <Box
                  key={th.id}
                  onClick={() => setThemeId(th.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: selected ? (isDark ? '#60A5FA' : '#1D4ED8') : 'divider',
                    bgcolor: selected ? (isDark ? 'rgba(45,212,191,0.10)' : 'rgba(15,118,110,0.06)') : 'transparent',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    '&:hover': { borderColor: isDark ? '#60A5FA' : '#1D4ED8' },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">{th.name}</Typography>
                      {th.license === 'pro' && (
                        <Chip size="small" color="warning" variant="outlined" label="Pro" sx={{ height: 18, fontSize: 10 }} />
                      )}
                      {selected && <CheckCircleIcon size={16} weight="fill" color={isDark ? '#60A5FA' : '#1D4ED8'} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {th.description}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {currentTheme && currentTheme.settings.length > 0 && (
          <>
            <Divider />
            {currentTheme.settings.map((s) => (
              <Box key={s.key}>{renderSetting(s)}</Box>
            ))}
          </>
        )}

        <Divider />
        <Typography variant="caption" color="text.secondary">
          {t('theme.rebuild_hint')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('common:action.cancel')}
        </Button>
        <Button
          variant="contained"
          startIcon={<FloppyDiskIcon size={16} weight="bold" />}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('theme.saving') : t('theme.save')}
        </Button>
      </DialogActions>
    </Dialog>

    {/* 媒体库选择对话框 */}
    <MediaLibraryDialog
      open={mediaOpen}
      onClose={() => { setMediaOpen(false); setMediaSettingKey(null); }}
      siteId={site.id}
      selectMode={true}
      onSelect={handleMediaSelect}
    />
    </>
  );
}
