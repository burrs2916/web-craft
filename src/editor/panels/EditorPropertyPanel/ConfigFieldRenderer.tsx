import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';

import type { ConfigField } from '../../../types/editor';
import { FormFieldsEditor } from '../../fields/FormFieldsEditor';
import { GlobalDataSourceSelect } from '../../fields/GlobalDataSourceSelect';
import { ButtonActionEditor } from '../../fields/ButtonActionEditor';
import { MenuItemsEditor } from '../../components/MenuItemsEditor';
import { PaneEditor } from '../../components/PaneEditor';
import { TabEditor } from '../../components/TabEditor';
import { IconPicker } from '../../../components/component';
import { MetricIconPicker } from '../../components/MetricIconPicker';
import { StaticDataEditor } from '../../components/StaticDataEditor';
import { TableDataEditor } from '../../components/TableDataEditor';
import { MapEditor } from '../../components/MapEditor';
import { ObjectListEditor } from '../../components/ObjectListEditor';
import { CascaderOptionsEditor } from '../../components/CascaderOptionsEditor';
import { resolveSelectValue, selectDisplayValue } from '../../data/fieldSelect';
import { diagnoseColorValue, diagnoseDynamicOptionsEmpty } from '../../data/fieldDiagnose';
import { fieldSx, floatedLabelProps, autocompleteSlotProps } from '../property/sharedStyles';
import { DiagLine } from './DiagLine';
import { NumberConfigField, MapLibrarySelectField, FileField, EditableSelectInput } from './inputs';
import { ApiFieldPickerField } from './ApiFieldPicker';
import { TagMultiSelectField } from './TagMultiSelectField';
import type { FieldRendererProps } from './shared';

export function SchemaFieldRow({
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

export function ConfigFieldRenderer({
  field,
  value,
  onChange,
  config,
  allComponents,
  componentId,
}: FieldRendererProps) {
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

    case 'tagMultiSelect':
      return <TagMultiSelectField field={field} value={value} onChange={onChange} config={config} />;

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