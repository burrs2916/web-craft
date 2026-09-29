import { useState, useEffect, useCallback, useRef, memo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import WidgetsIcon from '@mui/icons-material/Widgets';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useEditorStore } from '../../store/editorStore';
import { componentRegistry } from '../registry';
import type { ConfigField, SceneComponent } from '../../types/editor';
import { FormFieldsEditor } from '../fields/FormFieldsEditor';
import { GlobalDataSourceSelect } from '../fields/GlobalDataSourceSelect';
import { ButtonActionEditor } from '../fields/ButtonActionEditor';
import { getEffectiveTransform } from '../../types/editor';
import type { MapLibrary } from '../../types/mapLibrary';

import { useDeviceStore } from '../../store/deviceStore';
import { generateDefaultTags } from '../../devices/edgeConductorDefaults';
import type { DeviceCategory } from '../../types/device';
import { PanelWrapper } from '../components/PanelWrapper';
import { MenuItemsEditor } from '../components/MenuItemsEditor';
import { PaneEditor } from '../components/PaneEditor';
import { TabEditor } from '../components/TabEditor';
import { IconPicker } from '../../components/component';
import { MetricIconPicker } from '../components/MetricIconPicker';
import { StaticDataEditor } from '../components/StaticDataEditor';
import { TableDataEditor } from '../components/TableDataEditor';
import { MapEditor } from '../components/MapEditor';
import { ObjectListEditor } from '../components/ObjectListEditor';
import { CascaderOptionsEditor } from '../components/CascaderOptionsEditor';
import { resolveSelectValue, selectDisplayValue } from '../data/fieldSelect';
import {
  diagnoseColorValue,
  diagnoseNumberValue,
  diagnoseDynamicOptionsEmpty,
  type FieldDiag,
} from '../data/fieldDiagnose';
import { commitNumberDraft, useClearableNumber } from '../data/numberDraft';
import { fieldSx, floatedLabelProps, autocompleteSlotProps } from './property/sharedStyles';
import { CollapsibleSection } from './property/CollapsibleSection';
import { SensorSprayConfigSection } from './property/SensorSprayConfigSection';

interface EditorPropertyPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}


function SpinnerArrow({
  direction,
  disabled,
  onStep,
}: {
  direction: 'up' | 'down';
  disabled: boolean;
  onStep: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHold = useCallback(() => {
    onStep();
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(onStep, 80);
    }, 400);
  }, [onStep]);

  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);

  const Icon = direction === 'up' ? KeyboardArrowUpIcon : KeyboardArrowDownIcon;

  return (
    <IconButton
      size="small"
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) startHold();
      }}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={(e) => {
        e.preventDefault();
        if (!disabled) startHold();
      }}
      onTouchEnd={stopHold}
      disabled={disabled}
      sx={{ p: 0, borderRadius: 0.25, lineHeight: 1, '& .MuiSvgIcon-root': { fontSize: 10 } }}
    >
      <Icon fontSize="inherit" />
    </IconButton>
  );
}

function ZIndexInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const draft = useClearableNumber(value);
  return (
    <TextField
      value={draft.display}
      size="small"
      type="number"
      onChange={(e) => {
        const n = draft.change(e.target.value);
        if (n !== null) onCommit(n);
      }}
      onBlur={() => {
        const t = draft.end();
        if (t === null) return;
        const c = commitNumberDraft(t, { empty: 'keep' });
        if (c !== null && c !== undefined) onCommit(c);
      }}
      sx={{
        ...fieldSx,
        width: 60,
        '& .MuiInputBase-input': { textAlign: 'center', fontSize: 11, fontFamily: 'monospace' },
      }}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );
}

function NumberConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const numMin = field.min ?? -Infinity;
  const numMax = field.max ?? Infinity;
  const numStep = field.step ?? 1;
  const currentVal = (value as number | undefined) ?? (field.defaultValue as number | undefined) ?? 0;
  const canDec = currentVal - numStep >= numMin;
  const canInc = currentVal + numStep <= numMax;
  // 类型级内建诊断：越界时说明「离开输入框会被夹取成什么」（onBlur 确实做了夹取）
  const numDiag = diagnoseNumberValue(value, field.min, field.max, field.label);
  const draft = useClearableNumber(currentVal);
  return (
    <>
      <TextField
        label={field.label}
        type="number"
        value={draft.display}
        size="small"
        fullWidth
        placeholder={field.placeholder}
        slotProps={{
          ...floatedLabelProps,
          htmlInput: {
            min: field.min,
            max: field.max,
            step: field.step,
            sx: {
              MozAppearance: 'textfield',
              '&::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
              '&::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
            },
          },
          input: {
            endAdornment: (
              <InputAdornment
                position="end"
                sx={{
                  mr: -0.75,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0,
                  '& .MuiIconButton-root': {
                    p: 0,
                    borderRadius: 0.25,
                    lineHeight: 1,
                    '& .MuiSvgIcon-root': { fontSize: 10 },
                  },
                }}
              >
                <SpinnerArrow
                  direction="up"
                  disabled={!canInc}
                  onStep={() => onChange(field.key, Math.min(numMax, currentVal + numStep))}
                />
                <SpinnerArrow
                  direction="down"
                  disabled={!canDec}
                  onStep={() => onChange(field.key, Math.max(numMin, currentVal - numStep))}
                />
              </InputAdornment>
            ),
          },
        }}
        onChange={(e) => {
          // 可解析才实时提交（画布即时跟随）；空串/负号只进草稿，绝不把旧值打回输入框
          const n = draft.change(e.target.value);
          if (n !== null) onChange(field.key, n);
        }}
        onBlur={() => {
          const t = draft.end();
          if (t === null) return;
          // 清空 = 未设置 → 提交 undefined，渲染器 `?? 默认值` 回退组件默认配置；
          // 可解析值夹取进 [min,max]（diagnoseNumberValue 的事前提示在此兑现）
          const c = commitNumberDraft(t, { min: field.min, max: field.max, empty: 'unset' });
          if (c !== null) onChange(field.key, c);
        }}
        sx={fieldSx}
      />
      <DiagLine diag={numDiag} />
    </>
  );
}

function CompactNumberInput({
  label,
  value,
  onChange,
  adornment,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  adornment?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const numMin = min ?? -Infinity;
  const numMax = max ?? Infinity;
  const canDec = value - step >= numMin;
  const canInc = value + step <= numMax;
  // 可清空草稿层：X/Y/W/H/旋转是几何值不可为空，清空失焦 = 保持原值（empty: 'keep'）
  const draft = useClearableNumber(value, (n) => String(Math.round(n * 100) / 100));
  return (
    <TextField
      value={draft.display}
      size="small"
      fullWidth
      onChange={(e) => {
        const n = draft.change(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => {
        const t = draft.end();
        if (t === null) return;
        const c = commitNumberDraft(t, { min, max, empty: 'keep' });
        if (c !== null && c !== undefined && c !== value) onChange(c);
      }}
      sx={fieldSx}
      slotProps={{
        htmlInput: {
          style: { textAlign: 'center' },
          step,
          sx: {
            MozAppearance: 'textfield',
            '&::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
            '&::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
          },
        },
        inputLabel: { shrink: true },
        input: {
          startAdornment: adornment ? (
            <InputAdornment
              position="start"
              sx={{
                ml: -0.5,
                mr: -0.5,
                '& .MuiTypography-root': { fontSize: 9, color: 'text.disabled', fontWeight: 600 },
              }}
            >
              {adornment}
            </InputAdornment>
          ) : undefined,
          endAdornment: (
            <InputAdornment
              position="end"
              sx={{
                mr: -0.75,
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                '& .MuiIconButton-root': {
                  p: 0,
                  borderRadius: 0.25,
                  lineHeight: 1,
                  '& .MuiSvgIcon-root': { fontSize: 10 },
                },
              }}
            >
              <SpinnerArrow direction="up" disabled={!canInc} onStep={() => onChange(Math.min(numMax, value + step))} />
              <SpinnerArrow
                direction="down"
                disabled={!canDec}
                onStep={() => onChange(Math.max(numMin, value - step))}
              />
            </InputAdornment>
          ),
        },
      }}
      label={label}
    />
  );
}

function MapLibrarySelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const [maps, setMaps] = useState<MapLibrary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMaps = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const mapType = field.mapType || 'cad';
      const m = await invoke<MapLibrary[]>('get_published_map_libraries_by_type', { mapType });
      setMaps(m);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [field.mapType]);

  useEffect(() => {
    loadMaps();
    let unsubscribeFn: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('map-library-published', async () => {
        setLoading(true);
        await loadMaps();
      }).then((fn) => {
        unsubscribeFn = fn;
      });
    });
    return () => {
      unsubscribeFn?.();
    };
  }, [loadMaps]);

  return (
    <TextField
      label={field.label}
      value={String(value ?? '')}
      size="small"
      fullWidth
      select
      slotProps={{ ...floatedLabelProps }}
      onChange={(e) => onChange(field.key, e.target.value)}
      sx={fieldSx}
    >
      <MenuItem value="" disabled sx={{ fontSize: 11 }}>
        {loading ? '加载中...' : '-- 选择已发布的地图 --'}
      </MenuItem>
      {maps.map((m) => (
        <MenuItem key={m.id} value={m.id} sx={{ fontSize: 11 }}>
          {m.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** 数据源信息展示字段 - 只读显示当前激活数据源的连接信息 */

function FileField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const [picking, setPicking] = useState(false);

  const handlePick = async () => {
    setPicking(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: field.key === 'source' ? [{ name: 'CAD 文件', extensions: ['dxf', 'dwg'] }] : undefined,
      });
      if (selected) {
        const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
        onChange(field.key, filePath);
      }
    } catch {
    } finally {
      setPicking(false);
    }
  };

  const displayValue = String(value ?? '');
  const fileName = displayValue.split(/[\\/]/).pop() || displayValue;

  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>{field.label}</Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.75,
          py: 0.4,
          borderRadius: 0.75,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'action.hover',
          minHeight: 28,
        }}
      >
        <Typography
          sx={{
            flex: 1,
            fontSize: 11,
            color: value ? 'text.primary' : 'text.disabled',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value ? fileName : field.placeholder || '点击选择文件'}
        </Typography>
        <IconButton size="small" onClick={handlePick} disabled={picking} sx={{ p: 0.25 }}>
          {picking ? <CircularProgress size={12} /> : <FolderOpenIcon sx={{ fontSize: 13 }} />}
        </IconButton>
      </Box>
    </Box>
  );
}

// ─── API 字段识别面板（type: "api-field-picker"） ───
// 读取 config 中 API 配置 → 获取返回数据 → 递归枚举字段 →
// 自动识别疑似图片/名称字段（URL/扩展名/字段名提示）→ 勾选写入 avatarField/nameField
interface ApiFieldEntry {
  path: string;
  type: string;
  sample: string;
}

const APFP_IMAGE_URL_RE = /^(https?:)?\/\/|^data:image\//i;
const APFP_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?|#|$)/i;
const APFP_IMAGE_NAME_RE = /(avatar|photo|picture|headimg|head|img|icon|image|face|portrait|thumb|logo)/i;
const APFP_NAME_RE = /(^|\.)(name|nickname|nick|username|user_name|displayname|display_name|fullname|full_name|realname|real_name|login|account)(\.|$)/i;

function flattenApiFields(obj: unknown, prefix: string, out: ApiFieldEntry[], depth: number): void {
  if (obj === null || typeof obj !== "object" || depth > 4) return;
  if (Array.isArray(obj)) {
    if (obj.length > 0) flattenApiFields(obj[0], prefix ? `${prefix}[0]` : "[0]", out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      flattenApiFields(v, path, out, depth + 1);
    } else {
      out.push({ path, type: typeof v, sample: v === null || v === undefined ? "" : String(v).slice(0, 80) });
    }
  }
}

function isApiImageCandidate(f: ApiFieldEntry): boolean {
  if (f.type !== "string") return false;
  if (/^data:image\//i.test(f.sample)) return true;
  if (APFP_IMAGE_URL_RE.test(f.sample) && APFP_IMAGE_EXT_RE.test(f.sample.split(/[?#]/)[0])) return true;
  return APFP_IMAGE_NAME_RE.test(f.path);
}
function isApiNameCandidate(f: ApiFieldEntry): boolean {
  return f.type === "string" && APFP_NAME_RE.test(f.path);
}

function apiGetNested(obj: unknown, path: string): unknown {
  if (!obj || !path) return obj;
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function ApiFieldPickerField({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const apiUrl = String(config.apiUrl ?? "");
  const apiMethod = String(config.apiMethod ?? "GET") || "GET";
  const apiDataPath = String(config.apiDataPath ?? "");
  const authEnabled = config.authEnabled === true;
  // 组件自带的 Token 配置（defaultConfig 提供），无外部依赖（无侵入式）
  const tokenKey = String(config.tokenKey ?? "auth_token");
  const tokenStorage = String(config.tokenStorage ?? "localStorage");

  const avatarSel = String(config.avatarField ?? "");
  const nameSel = String(config.nameField ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<ApiFieldEntry[]>([]);

  const handleFetch = async () => {
    setError("");
    setLoading(true);
    try {
      // 完整地址直连 / 相对路径拼全局 baseUrl（与 __wc_buildUrl 同规则）
      let fullUrl = apiUrl;
      if (fullUrl && !/^https?:\/\//i.test(fullUrl)) {
        const win = window as unknown as Record<string, unknown>;
        const base = String(win.__WC_API_BASE ?? "");
        fullUrl = base ? base.replace(/\/+$/, "") + (fullUrl.startsWith("/") ? fullUrl : "/" + fullUrl) : fullUrl;
      }
      if (!fullUrl) {
        setError("请先填写 API 地址");
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authEnabled) {
        // 与发布端 avatar.ts 同规则：窗口级全局 token 配置优先，否则用组件自带配置
        const win = window as unknown as Record<string, unknown>;
        const storage = String(win.__WC_TOKEN_STORAGE ?? tokenStorage);
        const key = String(win.__WC_TOKEN_KEY ?? tokenKey);
        const hname = String(win.__WC_TOKEN_HEADER ?? "Authorization");
        const prefix = win.__WC_TOKEN_PREFIX !== undefined ? String(win.__WC_TOKEN_PREFIX) : "Bearer ";
        let token: string | null = null;
        try {
          if (storage === "localStorage") token = localStorage.getItem(key);
          else if (storage === "sessionStorage") token = sessionStorage.getItem(key);
          else if (storage === "memory") token = String((win.__webcraft_memory_cache as Record<string, unknown> | undefined)?.[key] ?? "") || null;
        } catch {
          token = null;
        }
        if (token) headers[hname] = prefix + token;
      }
      const res = await fetch(fullUrl, { method: apiMethod, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const target = apiDataPath ? apiGetNested(data, apiDataPath) : data;
      const out: ApiFieldEntry[] = [];
      flattenApiFields(target, "", out, 0);
      setFields(out);
      // 自动识别并勾选：识别出候选且对应字段尚未设置时，自动写入 avatarField/nameField
      const imgCand = out.find(isApiImageCandidate);
      const nameCand = out.find(isApiNameCandidate);
      if (!String(config.avatarField ?? "") && imgCand) onChange("avatarField", imgCand.path);
      if (!String(config.nameField ?? "") && nameCand) onChange("nameField", nameCand.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const imgCandCount = fields.filter(isApiImageCandidate).length;
  const nameCandCount = fields.filter(isApiNameCandidate).length;

  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>API 字段识别</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Button size="small" variant="outlined" onClick={handleFetch} disabled={loading || !apiUrl} sx={{ fontSize: 10, minWidth: 0, px: 1 }}>
          {loading ? <CircularProgress size={10} sx={{ mr: 0.5 }} /> : null}
          {loading ? '获取中…' : '获取字段'}
        </Button>
        {!apiUrl && (
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>请先填写上方 API 地址</Typography>
        )}
      </Box>

      {error && (
        <Typography sx={{ fontSize: 9.5, color: 'error.main', mb: 0.5, wordBreak: 'break-all' }}>
          获取失败：{error}（可改用下方手动填写字段路径）
        </Typography>
      )}

      {fields.length > 0 && (
        <Box sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>
            共 {fields.length} 个字段 · 识别出 {imgCandCount} 个图片候选、{nameCandCount} 个名称候选（已自动勾选，点按钮可调整）
          </Typography>
          <Box sx={{ maxHeight: 180, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 0.75 }}>
            {fields.slice(0, 80).map((f) => {
              const isImg = isApiImageCandidate(f);
              const isName = isApiNameCandidate(f);
              const imgActive = avatarSel === f.path;
              const nameActive = nameSel === f.path;
              return (
                <Box key={f.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, py: 0.25, '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.sample}>
                      {isImg && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'info.main', display: 'inline-block', mr: 0.5 }} />}
                      {isName && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main', display: 'inline-block', mr: 0.5 }} />}
                      {f.path}
                    </Typography>
                    <Typography sx={{ fontSize: 8.5, color: 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.sample || f.type}</Typography>
                  </Box>
                  <Button
                    size="small"
                    variant={imgActive ? 'contained' : 'outlined'}
                    color={imgActive ? 'primary' : 'inherit'}
                    onClick={() => onChange('avatarField', f.path)}
                    sx={{ fontSize: 9, minWidth: 42, px: 0.5 }}
                  >
                    图片
                  </Button>
                  <Button
                    size="small"
                    variant={nameActive ? 'contained' : 'outlined'}
                    color={nameActive ? 'secondary' : 'inherit'}
                    onClick={() => onChange('nameField', f.path)}
                    sx={{ fontSize: 9, minWidth: 42, px: 0.5 }}
                  >
                    名称
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* 手填兜底 */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
        <TextField size="small" label="图片字段" placeholder="如 avatar" value={avatarSel} onChange={(e) => onChange('avatarField', e.target.value)} sx={{ flex: 1, ...fieldSx }} slotProps={{ ...floatedLabelProps }} />
        <TextField size="small" label="名称字段" placeholder="如 name" value={nameSel} onChange={(e) => onChange('nameField', e.target.value)} sx={{ flex: 1, ...fieldSx }} slotProps={{ ...floatedLabelProps }} />
      </Box>
    </Box>
  );
}

/**
 * 解析字段当前值：config[key] 缺省时回退到 legacyKey（自动迁移兼容），
 * 使面板呈现与画布/发布端一致（如 form-select 的旧 options 文本 → items 数组）。
 */
function resolveConfigFieldValue(
  config: Record<string, unknown>,
  field: ConfigField,
): unknown {
  const current = config[field.key];
  if (current !== undefined && current !== null) return current;
  if (field.legacyKey && config[field.legacyKey] !== undefined && config[field.legacyKey] !== null) {
    const raw = config[field.legacyKey];
    return field.legacyParse ? field.legacyParse(raw) : raw;
  }
  return current;
}

/**
 * 诊断条配色 / 前缀标记。
 * 只靠颜色传达状态对色觉障碍不友好，故同时给一个符号前缀。
 */
const DIAG_COLORS: Record<string, string> = {
  ok: 'success.main',
  warn: 'warning.main',
  error: 'error.main',
  info: 'info.main',
};
const DIAG_MARKS: Record<string, string> = { ok: '✓', warn: '!', error: '✕', info: 'i' };

/**
 * 单个 schema 字段的完整行：**控件 + 实时诊断 + 帮助文字**。
 *
 * 为什么需要这一层（此前是裸 `<ConfigFieldRenderer>`）：
 * `field.help` 在 `ConfigFieldRenderer` 的整个 switch 里**从来没有被渲染过**
 * （唯一的消费点是已停用的 DeviceMultiSelectField），于是全部组件写下的帮助文案
 * 全都是死数据 —— 包括级联选择「选项数据」那三种写法的唯一说明。这里统一补齐，
 * 并顺带承载 `field.diagnose` 的状态条。
 *
 * `json-data` 除外：`StaticDataEditor` 自带帮助文字渲染，避免出现两行重复。
 */
/**
 * 「可选可输」字段：候选列表 + 自由输入（MUI Autocomplete freeSolo）。
 *
 * 面板 select 的两种声明共用它，保证行为不漂移：
 *   - `type:"select" + editable`                    → 候选来自 `field.options`
 *   - `type:"select" + editable + dynamicOptions`   → 候选来自回调（如级联的合法路径）
 *
 * 为什么必须有：`dynamicOptions` 分支此前**提前 return 并忽略 `editable`**，
 * 于是「候选由组件自身计算」的字段既不能手输、候选为空时还会整条消失 ——
 * 而恰恰是这些字段（接口模式、数据未填）最需要手输。
 */
function EditableSelectInput({
  field,
  value,
  onChange,
  options,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  options: Array<{ label: string; value: unknown }>;
}) {
  const currentVal = String(value ?? field.defaultValue ?? '');
  const matched = options.find((o) => String(o.value) === currentVal);
  return (
    <Autocomplete
      size="small"
      fullWidth
      freeSolo
      value={
        matched
          ? { label: matched.label, value: String(matched.value) }
          : { label: currentVal, value: currentVal }
      }
      options={options.map((o) => ({ label: o.label, value: String(o.value) }))}
      getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.label)}
      isOptionEqualToValue={(a, b) => {
        const av = typeof a === 'string' ? a : a.value;
        const bv = typeof b === 'string' ? b : b.value;
        return av === bv;
      }}
      onChange={(_, newVal) => {
        if (newVal && typeof newVal === 'object' && 'value' in newVal) {
          onChange(field.key, newVal.value);
        } else if (typeof newVal === 'string' && newVal) {
          onChange(field.key, newVal);
        }
      }}
      blurOnSelect
      renderInput={(params) => (
        <TextField
          {...params}
          label={field.label}
          size="small"
          sx={fieldSx}
          placeholder={field.placeholder}
          slotProps={autocompleteSlotProps(params)}
        />
      )}
      sx={fieldSx}
    />
  );
}

function SchemaFieldRow({
  field,
  value,
  onChange,
  config,
  allComponents,
  componentId,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
  allComponents?: Array<{ id: string; type: string; name?: string }>;
  componentId?: string;
}) {
  // 与 ConfigFieldRenderer 的 hidden 判定一致：隐藏字段整行（含帮助/诊断）都不渲染
  if (field.hidden?.(config)) return null;
  const diag = field.diagnose?.(config) ?? null;
  const showHelp = Boolean(field.help) && field.type !== 'json-data';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <ConfigFieldRenderer
        field={field}
        value={value}
        onChange={onChange}
        config={config}
        allComponents={allComponents}
        componentId={componentId}
      />
      <DiagLine diag={diag} />
      {showHelp && (
        <Typography sx={{ fontSize: 9, lineHeight: 1.5, color: 'text.disabled', mt: 0.4, px: 0.25 }}>
          {field.help}
        </Typography>
      )}
    </Box>
  );
}

/**
 * 诊断条的**唯一渲染点**。
 *
 * 两种来源共用它，保证外观永远一致：
 *   1. 字段级 —— `ConfigField.diagnose`（组件 schema 逐个声明，SchemaFieldRow 调用）；
 *   2. 类型级 —— `editor/data/fieldDiagnose`（面板按 `type` 统一判定，color / number 等分支调用）。
 * 只靠颜色传达状态对色觉障碍不友好，故同时给一个符号前缀（`✓ / ! / ✕ / i`）。
 */
function DiagLine({ diag }: { diag: FieldDiag | null }) {
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

/**
 * `ConfigFieldRenderer` 的 switch 支持的字段类型清单 —— 必须与 switch 的 case 一一对应。
 *
 * 为什么必须有这份清单：
 * `ConfigField.type` 是联合类型，switch 又有 `default` 兜底，两者之间**没有任何机械约束** ——
 * 往联合里加一个成员却忘了加 case，面板只会安静地少渲染一行，tsc / vitest / vite build 全都不会报错。
 * `group` 就是这样一个漂移样本：声明在联合里、长期没有 case（实测全仓仅 `dataConfigMixin` 用了它）。
 *
 * 下面的 `assertAllFieldTypesHandled` 把这件事变成**编译期错误**：联合里一旦出现清单外的成员，
 * `MissingFieldTypes` 就不再是 `never`，函数返回类型变成 `false`，而函数体 `return true` ——
 * tsc 会直接在这一行报「true 不能赋给 false」，把新成员的名字一并指出来。
 */
export const HANDLED_FIELD_TYPES = [
  "group",
  "button-action",
  "text",
  "number",
  "select",
  "color",
  "toggle",
  "slider",
  "textarea",
  "menu-items",
  "pane-editor",
  "tab-editor",
  "icon-picker",
  "metric-icon-picker",
  "map-editor",
  "json",
  "json-data",
  "table-editor",
  "cascader-options",
  "file",
  "api-field-picker",
  "list-editor",
  "form-fields",
  "global-datasource",
  "mapLibrary",
  "dataSourceInfo",
  "datasource",
  "datafield",
  "dbTable",
  "dbColumn",
  "deviceSelect",
  "action",
  "deviceMultiSelect",
  "keyValueMapping",
  "tagMultiSelect",
] as const;

/** 联合里存在、但上面的清单未覆盖的字段类型（正常应恒为 `never`） */
type MissingFieldTypes = Exclude<NonNullable<ConfigField["type"]>, (typeof HANDLED_FIELD_TYPES)[number]>;

/**
 * 编译期守卫（**无需调用**，导出只是为了让 `noUnusedLocals` 不把它当死代码）：
 * 返回类型里带着 `MissingFieldTypes`，一旦它不为 `never`，返回类型即 `false`，函数体的 `return true` 立刻 tsc 报错。
 *
 * 用 `[T] extends [never]` 而不是 `T extends never`：后者会按 naked 类型参数分发，`never` 会直接分发成 `never`，
 * 那时候连「一切正常」的情况都会报错。
 */
export function assertAllFieldTypesHandled(): [MissingFieldTypes] extends [never] ? true : false {
  return true;
}

function ConfigFieldRenderer({
  field,
  value,
  onChange,
  config,
  allComponents,
  componentId,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
  allComponents?: Array<{ id: string; type: string; name?: string }>;
  componentId?: string;
}) {
  if (field.hidden?.(config)) return null;

  switch (field.type) {
    // 分组标题（`dataConfigMixin` 的 `__dataGroupTitle`）。
    // 注意：当前「数据源」整组在字段列表阶段就被过滤掉了（遍历处的 `field.group === '数据源'`），
    // 所以这个分支现在**到不了**。保留它是为了让 `ConfigField.type` 的联合与 switch 严格一致
    // （否则 assertAllFieldTypesHandled 在编译期就会红），也让这段声明将来若被放出来时
    // 能正确渲染成标题、而不是静默消失。
    case 'group':
      return (
        <Box sx={{ pt: 0.75, mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 10, fontWeight: 500, color: 'text.secondary' }}>{field.label}</Typography>
        </Box>
      );
    case 'button-action':
      return <ButtonActionEditor componentId={componentId} />;
    case 'text':
      return (
        <TextField
          label={field.label}
          value={value ?? field.defaultValue ?? ''}
          size="small"
          fullWidth
          placeholder={field.placeholder}
          slotProps={{ ...floatedLabelProps }}
          onChange={(e) => onChange(field.key, e.target.value)}
          disabled={field.readOnly}
          // readOnly: 灰色背景，提示用户这是固定值
          sx={{
            ...fieldSx,
            ...(field.readOnly && {
              '& .MuiInputBase-input': {
                color: 'text.disabled',
                fontStyle: 'italic',
                cursor: 'not-allowed',
              },
              '& .MuiOutlinedInput-root': {
                bgcolor: 'action.disabledBackground',
              },
            }),
          }}
        />
      );

    case 'number':
      // 数字字段抽成组件：草稿态需要 useState（ConfigFieldRenderer 是普通函数调用，case 内不能挂 hook）
      return <NumberConfigField field={field} value={value} onChange={onChange} />;

    case 'select':
      // 动态选项：选项由组件自身 config 计算（如内容面板的激活面板联动 panes 列表）
      // 回调返回 undefined 时该字段不渲染（无可选项）
      if (field.dynamicOptions) {
        const dynOpts = field.dynamicOptions(config);
        // editable：候选为空也要保留输入框（数据未填 / 接口模式全靠手输）；
        // 非 editable 时维持原行为「无可选项就不渲染该字段」
        if (field.editable) {
          return (
            <EditableSelectInput
              field={field}
              value={value}
              onChange={onChange}
              options={dynOpts ?? []}
            />
          );
        }
        if (!dynOpts || dynOpts.length === 0) {
          // 候选算不出来时不再整条静默消失。只在「字段已有值」时才出声 ——
          // 那种情况等于面板对一个**正在生效**的配置失明（看不到、改不了，值却还在产物里）；
          // 值本身为空则保持安静（该字段在当前配置下本就无意义）。
          const emptyDiag = diagnoseDynamicOptionsEmpty(value, field.label);
          if (!emptyDiag) return null;
          return (
            <Box>
              <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>
                {field.label}
              </Typography>
              <DiagLine diag={emptyDiag} />
            </Box>
          );
        }
        return (
          <TextField
            label={field.label}
            value={selectDisplayValue(field, value, dynOpts)}
            size="small"
            fullWidth
            select
            slotProps={{ ...floatedLabelProps }}
            onChange={(e) => onChange(field.key, resolveSelectValue(field, e.target.value, dynOpts))}
            sx={fieldSx}
          >
            {dynOpts.map((opt) => (
              <MenuItem key={String(opt.value)} value={String(opt.value)} sx={{ fontSize: 11 }}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        );
      }
      // P2-10: loginFormId 字段动态生成页面上所有 LoginForm 组件作为选项
      if (field.key === 'loginFormId' && allComponents) {
        const loginForms = allComponents.filter((c) => c.type === 'auth-login-form');
        const opts = loginForms.map((c) => ({ label: c.name ? `${c.name} (${c.id})` : c.id, value: c.id }));
        const currentVal = String(value ?? field.defaultValue ?? '');
        const matched = opts.find(o => String(o.value) === currentVal);
        return (
          <Autocomplete
            size="small"
            fullWidth
            freeSolo
            value={matched ? { label: matched.label, value: String(matched.value) } : { label: currentVal, value: currentVal }}
            options={opts}
            getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.label}
            isOptionEqualToValue={(a, b) => {
              const av = typeof a === 'string' ? a : a.value;
              const bv = typeof b === 'string' ? b : b.value;
              return av === bv;
            }}
            onChange={(_, newVal) => {
              if (newVal && typeof newVal === 'object' && 'value' in newVal) {
                onChange(field.key, newVal.value);
              } else if (typeof newVal === 'string' && newVal) {
                onChange(field.key, newVal);
              }
            }}
            blurOnSelect
            renderInput={(params) => (
              <TextField {...params} label={field.label} size="small" sx={fieldSx} placeholder={field.placeholder ?? '选择登录表单组件或输入 ID'} slotProps={autocompleteSlotProps(params)} />
            )}
            sx={fieldSx}
          />
        );
      }
      if (field.editable) {
        const opts = field.options ?? [];
        const currentVal = String(value ?? field.defaultValue ?? '');
        const matched = opts.find(o => String(o.value) === currentVal);
        return (
          <Autocomplete
            size="small"
            fullWidth
            freeSolo
            value={matched ? { label: matched.label, value: String(matched.value) } : { label: currentVal, value: currentVal }}
            options={opts.map(o => ({ label: o.label, value: String(o.value) }))}
            getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.label}
            isOptionEqualToValue={(a, b) => {
              const av = typeof a === 'string' ? a : a.value;
              const bv = typeof b === 'string' ? b : b.value;
              return av === bv;
            }}
            onChange={(_, newVal) => {
              if (newVal && typeof newVal === 'object' && 'value' in newVal) {
                onChange(field.key, newVal.value);
              } else if (typeof newVal === 'string' && newVal) {
                onChange(field.key, newVal);
              }
            }}
            blurOnSelect
            renderInput={(params) => (
              <TextField {...params} label={field.label} size="small" sx={fieldSx} placeholder={field.placeholder} slotProps={autocompleteSlotProps(params)} />
            )}
            sx={fieldSx}
          />
        );
      }
      return (
        <TextField
          label={field.label}
          value={selectDisplayValue(field, value)}
          size="small"
          fullWidth
          select
          slotProps={{ ...floatedLabelProps }}
          onChange={(e) => onChange(field.key, resolveSelectValue(field, e.target.value))}
          sx={fieldSx}
        >
          {field.options?.map((opt) => (
            <MenuItem key={String(opt.value)} value={String(opt.value)} sx={{ fontSize: 11 }}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'color': {
      // 类型级内建诊断：非法颜色（拼错的 #12345 之类）/ 含透明度（取色器改色会丢 alpha）。
      // 命名色、transparent、渐变等无法可靠判定的写法一律静默 —— 宁可漏报也不误报。
      const colorDiag = diagnoseColorValue(value, field.label);
      return (
        <Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>
            {field.label}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                position: 'relative',
                width: 24,
                height: 24,
                borderRadius: 0.75,
                border: 1,
                borderColor: 'divider',
                overflow: 'hidden',
                flexShrink: 0,
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <input
                type="color"
                value={String(value ?? field.defaultValue ?? '#000000')}
                onInput={(e) => onChange(field.key, (e.target as HTMLInputElement).value)}
                onChange={(e) => onChange(field.key, e.target.value)}
                style={{
                  position: 'absolute',
                  inset: -4,
                  width: 'calc(100% + 8px)',
                  height: 'calc(100% + 8px)',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0,
                }}
              />
            </Box>
            <TextField
              value={value ?? field.defaultValue ?? ''}
              size="small"
              fullWidth
              onChange={(e) => onChange(field.key, e.target.value)}
              sx={{
                ...fieldSx,
                '& .MuiInputBase-input': { fontSize: 10.5, fontFamily: 'monospace' },
              }}
              placeholder="#000000"
            />
          </Box>
          <DiagLine diag={colorDiag} />
        </Box>
      );
    }

    case 'toggle':
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.25 }}>
          <Typography sx={{ fontSize: 11, color: 'text.primary' }}>{field.label}</Typography>
          <Switch
            checked={Boolean(value ?? field.defaultValue ?? false)}
            onChange={(e) => onChange(field.key, e.target.checked)}
            size="small"
          />
        </Box>
      );

    case 'slider': {
      const sliderVal = Number(value ?? field.defaultValue ?? 0);
      const sliderMin = field.min ?? 0;
      const sliderMax = field.max ?? 100;
      const sliderStep = field.step ?? 1;
      return (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 500 }}>{field.label}</Typography>
            <Typography sx={{ fontSize: 10, color: 'text.primary', fontFamily: 'monospace', fontWeight: 500 }}>
              {String(sliderVal)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => {
                const next = Math.max(sliderMin, sliderVal - sliderStep);
                onChange(field.key, next);
              }}
              sx={{ width: 22, height: 22, p: 0, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>-</Typography>
            </IconButton>
            <Slider
              size="small"
              value={sliderVal}
              min={sliderMin}
              max={sliderMax}
              step={sliderStep}
              onChange={(_, v) => onChange(field.key, v)}
              sx={{ flex: 1, py: 0.25 }}
            />
            <IconButton
              size="small"
              onClick={() => {
                const next = Math.min(sliderMax, sliderVal + sliderStep);
                onChange(field.key, next);
              }}
              sx={{ width: 22, height: 22, p: 0, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>+</Typography>
            </IconButton>
          </Box>
        </Box>
      );
    }

    case 'textarea':
      return (
        <TextField
          label={field.label}
          value={typeof value === 'string'
            ? value
            : value != null
              ? JSON.stringify(value, null, 2)
              : (field.defaultValue != null && typeof field.defaultValue !== 'string'
                  ? JSON.stringify(field.defaultValue, null, 2)
                  : (field.defaultValue as string | undefined) ?? '')}
          size="small"
          fullWidth
          multiline
          rows={3}
          placeholder={field.placeholder}
          slotProps={{ ...floatedLabelProps }}
          onChange={(e) => onChange(field.key, e.target.value)}
          sx={fieldSx}
        />
      );

    case 'menu-items':
      return (
        <MenuItemsEditor
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(field.key, v)}
          activeKey={typeof config.activeKey === 'string' ? config.activeKey : undefined}
          onActiveKeyChange={(k) => onChange('activeKey', k)}
          nested={field.nested !== false}
        />
      );

    case 'pane-editor':
      return (
        <PaneEditor
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(field.key, v)}
          activePaneId={typeof config.activePaneId === 'string' ? config.activePaneId : undefined}
          onActivePaneChange={(id) => onChange('activePaneId', id)}
        />
      );

    case 'tab-editor':
      return (
        <TabEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
          activeTabId={typeof config.activeTabId === 'string' ? config.activeTabId : undefined}
          onActiveTabIdChange={(id) => onChange('activeTabId', id)}
          parentConfig={config}
        />
      );

    case 'icon-picker':
      return (
        <IconPicker
          value={typeof value === 'string' ? value : ''}
          defaultValue="folder"
          onChange={(v) => onChange(field.key, v || '')}
        />
      );

    case 'metric-icon-picker':
      return (
        <MetricIconPicker
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'map-editor':
      return (
        <MapEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
          label={field.label}
          keyPlaceholder={field.placeholder || "字段名"}
        />
      );

    case 'json':
      return (
        <TextField
          label={field.label}
          value={typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? '')}
          size="small"
          fullWidth
          multiline
          rows={4}
          placeholder={field.placeholder || 'JSON 格式'}
          slotProps={{ ...floatedLabelProps }}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(field.key, parsed);
            } catch {
              onChange(field.key, e.target.value);
            }
          }}
          sx={fieldSx}
        />
      );

    case 'json-data': {
      // 表格数据字段：从当前组件的 columnDefs 提取字段名，作为数据编辑器的预置列
      let suggestedColumns: string[] | undefined;
      if (field.key === 'data' && config.columnDefs) {
        try {
          const defs = Array.isArray(config.columnDefs) ? config.columnDefs : [];
          suggestedColumns = defs
            .map((c: unknown) => {
              if (c && typeof c === 'object' && !Array.isArray(c)) {
                return String((c as Record<string, unknown>).field ?? '');
              }
              return '';
            })
            .filter(Boolean);
        } catch { /* ignore */ }
      }
      return (
        <StaticDataEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
          help={field.help}
          suggestedColumns={suggestedColumns}
        />
      );
    }

    case 'table-editor':
      return (
        <TableDataEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
          help={field.help}
        />
      );

    case 'file':
      return <FileField field={field} value={value} onChange={onChange} />;

    case 'api-field-picker':
      return <ApiFieldPickerField config={config} onChange={onChange} />;

    case 'list-editor':
      return (
        <ObjectListEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
          field={field}
        />
      );

    case 'cascader-options':
      return (
        <CascaderOptionsEditor
          value={value}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'form-fields':
      return <FormFieldsEditor />;

    case 'global-datasource':
      return (
        <GlobalDataSourceSelect
          value={String(value ?? '')}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'mapLibrary':
      return <MapLibrarySelectField field={field} value={value} onChange={onChange} />;

    case 'dataSourceInfo':
    case 'datasource':
    case 'datafield':
    case 'dbTable':
    case 'dbColumn':
    case 'deviceSelect':
    case 'action':
    case 'deviceMultiSelect':
    case 'keyValueMapping':
      return (
        <Box sx={{ p: 1, fontSize: 11, color: "text.disabled", fontStyle: "italic" }}>
          此字段类型 ({field.type}) 在网站编辑器中不可用
        </Box>
      );

    case 'tagMultiSelect': {
      // 从 store 动态获取最新 product tags（不依赖 dynamicOptions 闭包）
      const productCode = config.productCode as string | undefined;
      const currentProduct = productCode ? useDeviceStore.getState().getProduct(productCode) : undefined;
      // 兜底：当 deviceStore.products 未加载时（如 provider 尚未返回），
      // 从 productCode 直接推断 isAlarmProduct / devCategory / tags，
      // 确保组件库拖入的模板也能正确显示报警传感器专属字段
      const pcStr = currentProduct?.productCode ?? productCode ?? '';
      const isAlarmProduct = pcStr.includes('-Alarm-');
      // ─── 独立设备类型（不复用通用分支） ───
      // 清洗煤壁传感器（18035）：独立报警型，不归入 alarmSensors 位域
      const isCleanWall = pcStr.includes('-CleanWall');
      // 流量计（18040）/ 压力泵（18041）：独立 auxiliary 设备
      const isFlowMeter = pcStr === 'FY002-FlowMeter';
      const isPump = pcStr === 'FY002-Pump';
      const isCollector = pcStr === 'FY002-Collector-Wireless' || pcStr === 'FY002-Collector-Wired';
      const devCategory =
        currentProduct?.category ??
        (isCleanWall || pcStr.includes('-Alarm-') || pcStr.includes('-Sensor-')
          ? 'sensor'
          : isFlowMeter || isPump
            ? 'auxiliary'
            : pcStr.includes('MainController')
              ? 'main'
              : pcStr.includes('SubController') || pcStr.includes('Collector')
                ? 'sub'
                : ((config.category as string | undefined) ?? ''));
      // tags 兜底：当 store 中无产品定义时，用 edgeConductorDefaults 生成
      const tags = currentProduct?.tags ?? (pcStr ? generateDefaultTags(devCategory as DeviceCategory, pcStr) : []);
      const isFace = field.key === 'faceContent';
      // 内置字段（不来自 product tags，不参与互斥）—— 按设备类型区分
      // 协议依据：0x061e 实时状态返回
      //   数值型传感器（frequencySensors 数组）：sensorId / sensorType / sensorFrequency / sensorValue / sensorStatusCode
      //   报警型传感器（controllers 数组中的位域）：alarmSensors / batteryWarning / alarmSensorInfo
      //   sensorStatusCode（2字节位域）：bit0=未设置 bit1=读配置错误 bit2=写配置错误 bit3=未连接设备
      //                                bit4=断网 bit5=超预设置 bit6=超量程
      const builtInOpts = isFace
        ? isCleanWall
          ? [
              // 清洗煤壁传感器 faceContent（独立实现，不复用报警型通用字段）
              // 协议来源：0x061e clean 字段（utf8 字符串，清洗支架列表）
              { label: '设备名称', value: '__builtin_name__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
              // cleanTrigger tag 由后端从 0x061e clean 字段解析后推送
            ]
          : isFlowMeter
            ? [
                // 流量计 faceContent（独立设备类型）
                // 协议来源：0x0626 流量计数据上传
                { label: '设备名称', value: '__builtin_name__', builtIn: true },
                { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
              ]
            : isPump
              ? [
                  // 压力泵 faceContent（独立设备类型）
                  // 协议来源：0x0627 压力泵数据上传，仅 startStatus 一个字段
                  { label: '设备名称', value: '__builtin_name__', builtIn: true },
                  { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                ]
            : isCollector
              ? [
                  // 信号采集器 faceContent（18002 无线 / 18003 有线）
                  // 协议来源：wirelessAddressRules，subController 类型
                  { label: '设备名称', value: '__builtin_name__', builtIn: true },
                  { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                  { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
                ]
              : isAlarmProduct
                ? [
                    // 报警型传感器 faceContent（面板显示字段）
                    { label: '设备名称', value: '__builtin_name__', builtIn: true },
                    { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                    { label: '所属分控器', value: '__builtin_parentName__', builtIn: true },
                  ]
                : devCategory === 'main'
                  ? [
                      { label: '设备名称', value: '__builtin_name__', builtIn: true },
                      { label: '设备ID', value: '__builtin_id__', builtIn: true },
                      { label: 'IP地址', value: '__builtin_ip__', builtIn: true },
                    ]
                  : devCategory === 'sub'
                    ? [
                        { label: '设备名称', value: '__builtin_name__', builtIn: true },
                        { label: '分控器编号', value: '__builtin_controllerId__', builtIn: true },
                        { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
                      ]
                    : [
                        // 数值型传感器 faceContent（CH4/CO/温度/粉尘/风速/风压）
                        // 协议 0x061e frequencySensors：sensorId（1B 分控器内编号），没有独立 deviceId
                        { label: '设备名称', value: '__builtin_name__', builtIn: true },
                        { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                      ]
        : isCleanWall
          ? [
              // 清洗煤壁传感器 screenContent（屏幕显示字段）
              // 协议字段：cleanTrigger（清洗触发状态）
              { label: '清洗触发', value: '__builtin_cleanTrigger__', builtIn: true },
              { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
            ]
          : isFlowMeter
            ? [
                // 流量计 screenContent（屏幕显示字段）
                // 协议字段：instantFlow（瞬时流量）/ totalFlow（累计流量）
                { label: '瞬时流量', value: '__builtin_instantFlow__', builtIn: true },
                { label: '累计流量', value: '__builtin_totalFlow__', builtIn: true },
                { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
              ]
            : isPump
              ? [
                  // 压力泵 screenContent（屏幕显示字段）
                  // 协议字段：startStatus（启动状态：0=停止 1=运行）
                  { label: '启动状态', value: '__builtin_startStatus__', builtIn: true },
                  { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                ]
            : isCollector
              ? [
                  // 信号采集器 screenContent（18002 无线 / 18003 有线）
                  // 协议来源：subController，采集传感器数据
                  { label: '传感器数', value: '__builtin_subSensorCount__', builtIn: true },
                  { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                ]
              : isAlarmProduct
                ? [
                    // 报警型传感器 screenContent（屏幕显示字段）
                    // 协议字段：alarmSensors 位域 → 触发状态
                    { label: '触发状态', value: '__builtin_alarmTrigger__', builtIn: true },
                    // 协议字段：batteryWarning 位域 → 电池预警
                    { label: '电池预警', value: '__builtin_batteryWarn__', builtIn: true },
                    // 协议字段：alarm + batteryWarning 两位独立可读，合法组合解读
                    { label: '告警源', value: '__builtin_alarmSource__', builtIn: true },
                    // 协议字段：sensorStatusCode（字段解析规则.json:532-588）2字节位域
                    { label: '状态码', value: '__builtin_statusCode__', builtIn: true },
                    // 协议字段：alarmSensorInfo（字段解析规则.json:376-469）已注册/未注册
                    { label: '告警注册', value: '__builtin_alarmRegistered__', builtIn: true },
                    { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                    { label: '所属分控器', value: '__builtin_parentName__', builtIn: true },
                  ]
                : devCategory === 'main'
                  ? [
                      { label: '分控器数', value: '__builtin_subCount__', builtIn: true },
                      { label: '传感器数', value: '__builtin_sensorCount__', builtIn: true },
                    ]
                  : devCategory === 'sub'
                    ? [
                        // 协议：controllerState 位域（1字节）
                        //   bit0=前喷 bit1=后喷 bit2=清洗 → 合并为"喷洒状态"
                        //   bit3=电池预警 → "电池预警"
                        //   bit4=通讯故障 → "通讯故障"
                        //   bit5/6=前/后强喷（强喷状态，可后续扩展）
                        { label: '喷洒状态', value: '__builtin_sprayStatus__', builtIn: true },
                        { label: '电池预警', value: '__builtin_batteryWarn__', builtIn: true },
                        { label: '通讯故障', value: '__builtin_commFault__', builtIn: true },
                        { label: '传感器数', value: '__builtin_subSensorCount__', builtIn: true },
                        { label: '所属集控器', value: '__builtin_parentName__', builtIn: true },
                      ]
                    : [
                        // 数值型传感器 screenContent（CH4/CO/温度/粉尘/风速/风压）
                        // 协议 0x061e frequencySensors：sensorId（1B 分控器内编号），没有独立 deviceId
                        { label: '在线状态', value: '__builtin_onlineStatus__', builtIn: true },
                        // 协议字段：sensorStatusCode（2字节位域）
                        { label: '状态码', value: '__builtin_statusCode__', builtIn: true },
                      ];
      // 动态 tag 字段（来自 product tags，参与互斥）
      // 协议依据：屏幕/面板"内容"选择器只展示**实时数据字段（0x061e 实时状态返回）**和**内置字段**
      //   0x060f 配置型字段（minRange/maxRange/alarmLow/alarmHigh/calibrationZero）是配置参数，
      //   不是实时数据，不应在内容选择器中出现，仅在 configSchema 的"量程配置/报警阈值/校准"组暴露
      const CONFIG_TAG_IDS = new Set([
        'minRange',
        'maxRange',
        'alarmLow',
        'alarmHigh',
        'calibrationZero',
        // 小写兼容（后端可能推 snake_case 名字到 product.tags，需过滤）
        'min_range',
        'max_range',
        'alarm_low',
        'alarm_high',
        'calibration_zero',
      ]);
      // 与内置字段重复的 tag：内置字段已提供位域解析/语义化文案，不再作为 tag 选项暴露
      //   online           → __builtin_onlineStatus__（内置字段解析 device.online）
      //   alarm            → __builtin_alarmTrigger__（内置字段按位域解析 + 语义化文案）
      //   batteryWarning   → __builtin_batteryWarn__（内置字段按位域解析）
      //   alarmSensorInfo  → __builtin_alarmRegistered__（内置字段按位域解析 + 匹配传感器类型）
      //   sensorStatusCode → __builtin_statusCode__（内置字段按位域解析 bit0-bit6）
      // ─── 独立设备重复 tag ───
      //   cleanTrigger    → __builtin_cleanTrigger__（清洗煤壁传感器）
      //   instantFlow     → __builtin_instantFlow__（流量计）
      //   totalFlow       → __builtin_totalFlow__（流量计）
      //   startStatus     → __builtin_startStatus__（压力泵）
      const BUILTIN_DUPLICATE_TAGS = new Set([
        'online',
        'alarm',
        'batteryWarning',
        'alarmSensorInfo',
        'sensorStatusCode',
        'cleanTrigger',
        'instantFlow',
        'totalFlow',
        'startStatus',
      ]);
      // writable tag（可写控制 tag）不应出现在"内容选择器"中：
      //   它们是控制指令（如 spray.frontSpray），不是实时数据展示字段
      //   控制指令通过 configSchema 的"控制"组暴露，不参与面板/屏幕内容选择
      const realtimeTags = tags.filter(
        (t) => !CONFIG_TAG_IDS.has(t.id) && !BUILTIN_DUPLICATE_TAGS.has(t.id) && !t.writable,
      );
      const tagOpts = realtimeTags.map((t) => ({
        label: `${t.name}${t.unit ? ` (${t.unit})` : ''}`,
        value: t.id,
        builtIn: false,
      }));
      const opts = [...builtInOpts, ...tagOpts];
      if (opts.length === 0) return null;
      // 值：字符串数组 或 逗号分隔字符串
      const selected: string[] = (() => {
        if (Array.isArray(value)) return value as string[];
        if (typeof value === 'string' && value) return value.split(',').filter(Boolean);
        return [];
      })();
      // 另一个字段的 key 和已选值（仅 tag 类字段互斥，内置字段不互斥）
      const otherKey = isFace ? 'screenContent' : 'faceContent';
      const otherSelected: string[] = (() => {
        const ov = config[otherKey];
        if (Array.isArray(ov)) return ov as string[];
        if (typeof ov === 'string' && ov) return ov.split(',').filter(Boolean);
        return [];
      })();
      const toggleTag = (tagValue: string, isBuiltIn: boolean) => {
        const next = selected.filter((v) => !v.startsWith('__default__'));
        const idx = next.indexOf(tagValue);
        if (idx >= 0) {
          next.splice(idx, 1);
        } else {
          next.push(tagValue);
          // 非内置字段：如果另一侧已选同一 tag，自动从另一侧移除
          if (!isBuiltIn && otherSelected.includes(tagValue)) {
            const otherNext = otherSelected.filter((v) => v !== tagValue);
            onChange(otherKey, otherNext.length > 0 ? otherNext : []);
          }
        }
        onChange(field.key, next.length > 0 ? next : []);
      };
      return (
        <Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', mb: 0.25, fontWeight: 500 }}>
            {field.label}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.15, maxHeight: 180, overflow: 'auto' }}>
            {builtInOpts.length > 0 && tagOpts.length > 0 && (
              <Typography sx={{ fontSize: 8.5, color: 'text.disabled', px: 0.5, mt: 0.25 }}>内置字段</Typography>
            )}
            {builtInOpts.map((opt) => {
              const optVal = String(opt.value);
              const isSelected = selected.includes(optVal);
              return (
                <Box
                  key={optVal}
                  onClick={() => toggleTag(optVal, true)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.5,
                    py: 0.15,
                    borderRadius: 0.5,
                    cursor: 'pointer',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: 0.5,
                      border: 1,
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isSelected && (
                      <Typography sx={{ fontSize: 9, color: 'primary.contrastText', lineHeight: 1 }}>✓</Typography>
                    )}
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: isSelected ? 'text.primary' : 'text.secondary',
                      fontWeight: isSelected ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </Typography>
                </Box>
              );
            })}
            {tagOpts.length > 0 && (
              <Typography sx={{ fontSize: 8.5, color: 'text.disabled', px: 0.5, mt: 0.25 }}>数据字段</Typography>
            )}
            {tagOpts.map((opt) => {
              const optVal = String(opt.value);
              const isSelected = selected.includes(optVal);
              const isConflict = otherSelected.includes(optVal);
              return (
                <Box
                  key={optVal}
                  onClick={() => !isConflict && toggleTag(optVal, false)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.5,
                    py: 0.15,
                    borderRadius: 0.5,
                    cursor: isConflict ? 'not-allowed' : 'pointer',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    opacity: isConflict ? 0.4 : 1,
                    '&:hover': isConflict ? {} : { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: 0.5,
                      border: 1,
                      borderColor: isSelected ? 'primary.main' : isConflict ? 'warning.main' : 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isSelected && (
                      <Typography sx={{ fontSize: 9, color: 'primary.contrastText', lineHeight: 1 }}>✓</Typography>
                    )}
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: isSelected ? 'text.primary' : isConflict ? 'warning.main' : 'text.secondary',
                      fontWeight: isSelected ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </Typography>
                  {isConflict && (
                    <Typography sx={{ fontSize: 8, color: 'warning.main', flexShrink: 0 }}>已选另一侧</Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      );
    }

    default:
      // ⚠️ 绝不静默 `return null`。
      // 面板「凭空少一行」是最难定位的一类问题：用户以为字段不存在、开发者以为组件没声明它，
      // 真实原因往往只是 type 拼错、或往 `ConfigField.type` 联合里加了成员却忘了补 case。
      // 这里渲染一条显性占位（把类型名与 key 都写出来），并在编译期由 assertAllFieldTypesHandled 拦住新增类型。
      return (
        <Box sx={{ border: '1px dashed', borderColor: 'error.main', borderRadius: 0.75, px: 0.75, py: 0.5 }}>
          <Typography
            sx={{ fontSize: 9, lineHeight: 1.5, color: 'error.main', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {`✕ 未支持的字段类型「${String(field.type ?? '（缺失）')}」\nkey: ${field.key}`}
          </Typography>
        </Box>
      );
  }
}




const ComponentConfigPanel = memo(function ComponentConfigPanel({ component }: { component: SceneComponent }) {
  const updateComponentConfig = useEditorStore((s) => s.updateComponentConfig);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const updateComponentTransform = useEditorStore((s) => s.updateComponentTransform);
  const allComponents = useEditorStore((s) => s.components);
  const definition = componentRegistry.get(component.type);

  const handleChange = useCallback(
    (key: string, value: unknown) => {
      const patch: Record<string, unknown> = { [key]: value };

      // productCode 变更联动：清除旧 deviceId，更新组件名称
      if (key === 'productCode' && value !== component.config.productCode) {
        patch.deviceId = '';
        const product = useDeviceStore.getState().getProduct(value as string);
        if (product) {
          updateComponent(component.id, { name: product.productName });
        }
      }

      // progress 切到圆形联动改框：线性默认框 280×20 会把圆压扁（factor=min(w/80,h/80)=0.25→20px）。
      // 框改成方形，边长 = clamp(max(w,h), circleSize, circleSize×2)：缩放系数恰落在 [1,2]
      // （progressCircleFit 的 max），圆正好铺满方框、无多余留白。圆环直径范围 40~200（面板同款夹取）。
      if (component.type === 'progress' && key === 'shape' && value === 'circle' && component.config.shape !== 'circle') {
        const t = component.transform;
        const circleSize = Math.min(Math.max(Number(component.config.circleSize ?? 80), 40), 200);
        const side = Math.round(Math.min(Math.max(Math.max(t.width, t.height), circleSize), circleSize * 2));
        if (Math.round(t.width) !== side || Math.round(t.height) !== side) {
          updateComponentTransform(component.id, { width: side, height: side });
        }
      }

      updateComponentConfig(component.id, patch);
    },
    [component.id, component.type, component.config, component.transform, updateComponentConfig, updateComponent, updateComponentTransform],
  );

  const schema = definition?.configSchema || [];

  // 网站编辑器不再提供数据源相关字段（含"全局数据源"下拉、"数据模式/静态数据/接口读取"等），
  // 直接过滤，属性面板不再出现"数据源"分组/字段，界面更简洁。数据源改由系统设置统一管理。
  const WEBSITE_UNAVAILABLE_FIELD_TYPES = new Set([
    'dataSourceInfo', 'datasource', 'datafield', 'dbTable', 'dbColumn',
    'deviceSelect', 'deviceMultiSelect', 'keyValueMapping', 'action',
    'global-datasource',
  ]);

  const groups = new Map<string, ConfigField[]>();
  schema.forEach((field) => {
    if (field.type && WEBSITE_UNAVAILABLE_FIELD_TYPES.has(field.type)) return;
    if (field.group === '数据源') return;
    const group = field.group || '通用';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  });

  if (schema.length === 0) return null;

  // 核心分组默认展开（组数 >3 时仅展开这些，其余折叠）
  const PRIORITY_GROUPS = new Set([
    '内容', '排版', '颜色', '动画',  // 基础分组
    '面板', '数据源', '面板样式',  // 内容面板核心分组
    '类型选择',  // 折线图预设类型选择器（最重要）
    '基础', '线条样式', '数据点', '轴配置', '交互', '主题',  // 折线图核心分组
    '数据源', '样式',  // 其他图表常用分组
    'API 配置', '表单字段', 'UI 样式', '注册后行为',  // 认证表单基础分组
    'SSO 配置', 'Token 交换', '认证联动', '登录后行为', 'OAuth 配置',  // SSO/OAuth 基础分组
    'API Key 配置', '基本配置', '行为',  // API Key / LogoutButton 基础分组
    '未登录内容', '门禁行为', '认证校验', '联动配置',  // AuthGuard 分组
    '高级配置', '端点配置', '响应字段映射', 'Token 存储配置', 'Token 刷新配置',  // LoginForm 高级分组
    '自定义请求头（多租户等）', '动态表单参数',  // LoginForm 高级分组
    '快速开始', '表单配置', '高级选项',  // RegisterForm 分组
    '显示选项', '动态展示配置（从缓存键映射）',  // UserProfile 分组
  ]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {Array.from(groups.entries()).map(([group, fields]) => (
        <CollapsibleSection key={group} title={group} defaultExpanded={groups.size <= 3 || PRIORITY_GROUPS.has(group)}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5, px: 0.25 }}>
            {fields.map((field) => (
              <SchemaFieldRow
                key={field.key}
                field={field}
                value={resolveConfigFieldValue(component.config, field)}
                onChange={handleChange}
                config={component.config}
                allComponents={allComponents}
                componentId={component.id}
              />
            ))}
          </Box>
        </CollapsibleSection>
      ))}

      {/* ━━━ 喷雾控制工具栏专属：动态传感器喷雾参数配置面板（协议0614） ━━━ */}
      {component.type === 'industrial-spray-control-toolbar' && (
        <SensorSprayConfigSection
          mainControllerIds={(component.config.selectedDeviceIds as string[]) ?? []}
          config={component.config}
          onChange={handleChange}
        />
      )}
    </Box>
  );
});

export function EditorPropertyPanelContent() {
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const components = useEditorStore((s) => s.components);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const updateComponentTransform = useEditorStore((s) => s.updateComponentTransform);
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const duplicateComponent = useEditorStore((s) => s.duplicateComponent);
  const reorderComponent = useEditorStore((s) => s.reorderComponent);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);

  const selectedComponents = components.filter((c) => selectedIds.includes(c.id));

  if (selectedComponents.length === 0) {
    return (
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12 }}>属性</Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            gap: 1,
          }}
        >
          <WidgetsIcon sx={{ fontSize: 28, color: 'text.disabled', opacity: 0.4 }} />
          <Typography sx={{ textAlign: 'center', fontSize: 11, color: 'text.secondary' }}>选择画布中的组件</Typography>
          <Typography sx={{ textAlign: 'center', fontSize: 9.5, color: 'text.disabled' }}>以编辑其属性</Typography>
        </Box>
      </Box>
    );
  }

  const comp = selectedComponents[0];
  const definition = componentRegistry.get(comp.type);
  const hasConfig = (definition?.configSchema?.length ?? 0) > 0;
  const sameLayerComps = components.filter((c) => c.layerId === comp.layerId);
  const maxZIndex = sameLayerComps.reduce((max, c) => Math.max(max, c.zIndex), 0);
  const effectiveTransform = getEffectiveTransform(comp, activeBreakpoint);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <TextField
            value={comp.name}
            size="small"
            fullWidth
            onChange={(e) => updateComponent(comp.id, { name: e.target.value })}
            sx={{
              ...fieldSx,
              '& .MuiInputBase-input': { fontSize: 12, fontWeight: 600, py: 0.2 },
              '& .MuiOutlinedInput-root': { borderRadius: 0.75, pr: 0.5 },
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Chip
            label={definition?.name || comp.type}
            size="small"
            variant="outlined"
            sx={{ height: 16, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }}
          />
          <Box sx={{ display: 'flex', gap: 0 }}>
            <Tooltip title={comp.visible ? '隐藏' : '显示'} arrow enterDelay={400}>
              <IconButton
                size="small"
                onClick={() => updateComponent(comp.id, { visible: !comp.visible })}
                sx={{ p: 0.2 }}
              >
                {comp.visible ? <VisibilityIcon sx={{ fontSize: 13 }} /> : <VisibilityOffIcon sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title={comp.locked ? '解锁' : '锁定'} arrow enterDelay={400}>
              <IconButton
                size="small"
                onClick={() => updateComponent(comp.id, { locked: !comp.locked })}
                sx={{ p: 0.2 }}
              >
                {comp.locked ? <LockIcon sx={{ fontSize: 13 }} /> : <LockOpenIcon sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="复制" arrow enterDelay={400}>
              <IconButton size="small" onClick={() => duplicateComponent(comp.id)} sx={{ p: 0.2 }}>
                <ContentCopyIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除" arrow enterDelay={400}>
              <IconButton size="small" onClick={() => removeComponent(comp.id)} sx={{ p: 0.2, color: 'error.main' }}>
                <DeleteIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 2 },
        }}
      >
        <CollapsibleSection title="位置与大小">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            <CompactNumberInput
              label="X"
              value={effectiveTransform.x}
              onChange={(v) => updateComponentTransform(comp.id, { x: v })}
            />
            <CompactNumberInput
              label="Y"
              value={effectiveTransform.y}
              onChange={(v) => updateComponentTransform(comp.id, { y: v })}
            />
            <CompactNumberInput
              label="W"
              value={effectiveTransform.width}
              onChange={(v) => updateComponentTransform(comp.id, { width: v })}
            />
            <CompactNumberInput
              label="H"
              value={effectiveTransform.height}
              onChange={(v) => updateComponentTransform(comp.id, { height: v })}
            />
          </Box>
          {definition?.capabilities.rotatable && (
            <Box sx={{ mt: 0.5 }}>
              <CompactNumberInput
                label="旋转"
                value={effectiveTransform.rotation}
                onChange={(v) => updateComponentTransform(comp.id, { rotation: v })}
                adornment="°"
              />
            </Box>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="层级顺序">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25 }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Z-Index</Typography>
            <ZIndexInput value={comp.zIndex} onCommit={(n) => reorderComponent(comp.id, n)} />
            <Box sx={{ flex: 1 }} />
            <Tooltip title="上移一层" arrow enterDelay={400}>
              <span>
                <IconButton
                  size="small"
                  disabled={comp.zIndex >= maxZIndex}
                  onClick={() => reorderComponent(comp.id, comp.zIndex + 1)}
                  sx={{ p: 0.25 }}
                >
                  <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="下移一层" arrow enterDelay={400}>
              <span>
                <IconButton
                  size="small"
                  disabled={comp.zIndex <= 0}
                  onClick={() => reorderComponent(comp.id, Math.max(0, comp.zIndex - 1))}
                  sx={{ p: 0.25 }}
                >
                  <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </CollapsibleSection>

        {hasConfig && (
          <>
            <Divider sx={{ borderColor: 'divider', opacity: 0.5 }} />
            <ComponentConfigPanel component={comp} />
          </>
        )}
      </Box>
    </Box>
  );
}


export function EditorPropertyPanel({ collapsed, onToggle }: EditorPropertyPanelProps) {
  return (
    <PanelWrapper collapsed={collapsed} onToggle={onToggle} width={280} position="right" borderSide="left">
      <EditorPropertyPanelContent />
    </PanelWrapper>
  );
}
