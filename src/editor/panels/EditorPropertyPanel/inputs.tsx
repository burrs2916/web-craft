import { useState, useEffect, useCallback, useRef } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import type { ConfigField } from '../../../types/editor';
import type { MapLibrary } from '../../../types/mapLibrary';
import { diagnoseNumberValue } from '../../data/fieldDiagnose';
import { commitNumberDraft, useClearableNumber } from '../../data/numberDraft';
import { fieldSx, floatedLabelProps, autocompleteSlotProps } from '../property/sharedStyles';
import { DiagLine } from './DiagLine';

export function SpinnerArrow({
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

export function ZIndexInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
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

export function NumberConfigField({
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

export function CompactNumberInput({
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

export function MapLibrarySelectField({
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

export function FileField({
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
export function EditableSelectInput({
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