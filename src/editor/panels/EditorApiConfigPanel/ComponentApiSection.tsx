import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../../../store/editorStore";
import { GlobalDataSourceSelect } from "../../fields/GlobalDataSourceSelect";
import { componentRegistry } from "../../registry";
import { createDefaultApiConfig } from "../../../types/scene";
import { jsonObjectOf, jsonTextError, jsonTextOfRows } from "../../data/requestExtras";
import TuneIcon from "@mui/icons-material/Tune";
import LinkIcon from "@mui/icons-material/Link";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import BoltIcon from "@mui/icons-material/Bolt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import FilterListIcon from "@mui/icons-material/FilterList";
import { SectionHeader, Hint, SettingRow, inputSx, type HeaderRow } from "../apiPanelShared";
import { ApiColumnsPickerField } from "../EditorPropertyPanel/ApiColumnsPicker";
import { RowFiltersEditorField } from "../EditorPropertyPanel/RowFiltersEditor";

/**
 * 「接口字段映射」的排除表 —— 这几个键**本面板已经渲染**（`apiFields` 生成的那批：
 * 接口地址 / 路径 / 方式 / 请求头 / 请求体 / 数据取用），不能在通用映射区重复出现。
 */
const API_MAPPING_RENDERED_KEYS = new Set([
  "apiUrl", "apiPath", "apiMethod", "apiHeaders", "apiBody", "apiDataPath", "apiInterval",
]);

interface ComponentApiSectionProps {
  /** 当前选中组件 id；传入后启用组件级接口视口（需组件存在且匹配） */
  componentId?: string;
  /** 从 API 面板跳转到事件 Tab 并定位指定事件绑定的回调（由 SceneEditor 提供） */
  onNavigateToEvent?: (bindingId: string) => void;
}

/**
 * 「当前组件 · 接口」可编辑视口。
 *
 * 组件级接口区（componentId 传入时启用）针对当前选中组件可直接编辑，
 * 字段与属性面板「数据源」一致（apiMethod / apiUrl / apiDataPath / apiInterval / authEnabled），
 * 通过 updateComponentConfig 写回，两处实时同步。
 *
 * 本区块是全局数据源绑定的**唯一 UI 入口**，由组件 schema 驱动（档位读 dataMode.options、
 * 显隐读各字段 hidden），契约测试守卫本文件源码中的这些标记。
 */
export function ComponentApiSection({ componentId, onNavigateToEvent }: ComponentApiSectionProps) {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const updateComponentConfig = useEditorStore((s) => s.updateComponentConfig);
  const config = apiConfig ?? createDefaultApiConfig();

  // ── 当前组件（组件级接口视口）──
  const allComponents = useEditorStore((s) => s.components);
  const selComponent = componentId ? allComponents.find((c) => c.id === componentId) : undefined;
  const selCfg = selComponent?.config ?? {};
  // 数据模式取值（static | api | datasource | realtime …），档位列表与可见性均由组件自身 schema 决定。
  // 两类接法（勿混）：
  //   · 绑定型（metric/progress/form-slider/form-date/form-time）：dataMode 本身就是绑定开关，
  //     取 "datasource" 后由发布端 scaffold/data.ts 派生 value 绑定 → 运行时派发 data-update；
  //   · 展示型（echarts 全族/table/list/icon/媒体/部分表单 共 52 个）：dataMode 只有 static/api，
  //     绑定靠 dataSourceId 独立字段（引擎 withEffectiveConfig 用全局源配置覆盖本地取数配置）。
  // 因此面板**不硬编码** mode 档位、也不硬编码 dataSourceId 的显隐——一律读 schema，
  // 否则就是"假控件"（例如把 gauge 的 realtime 档吃掉、给展示型组件塞进语义不符的 datasource）。
  const selMode = String(selCfg.dataMode ?? "static");
  const selDef = selComponent ? componentRegistry.get(selComponent.type) : undefined;
  const schemaFields = selDef?.configSchema ?? [];
  const fieldOf = (key: string) => schemaFields.find((f) => f.key === key);
  /** 逐字段求 hidden(selCfg)：面板可见性与属性栏 schema 完全同源 */
  const isHidden = (key: string) => {
    const f = fieldOf(key);
    return Boolean(f?.hidden && f.hidden(selCfg));
  };
  /** 数据模式档位（含 datasource / realtime 等全部档位，读 schema options） */
  const modeOptions = (fieldOf("dataMode")?.options ?? []).map((o) => ({ v: String(o.value), label: o.label }));
  // 仅当组件 schema 声明了 dataSourceId 才提供「数据源绑定」——不给不消费该字段的组件放假控件
  const supportsDatasource = Boolean(fieldOf("dataSourceId"));
  // 仅当 schema 声明了请求头/请求体才渲染「高级请求」——同上，不给不消费的组件放假控件
  const supportsReqExtras = Boolean(fieldOf("apiHeaders") || fieldOf("apiBody"));
  // 「接口字段映射」：schema 里 group「数据源」的 api* 文本字段（接口响应中的取值/显示/子级字段名）。
  // 属性栏把「数据源」整组过滤，而本面板此前只按 key 取已知取数键 → 这批字段**有能力却无入口**
  // （form-cascader 的 apiValueField/apiLabelField/apiChildrenField、form-select、segmented、
  // form.ts、媒体族 apiSrcField 等同病）。此处按 schema 通用渲染，未声明该键的组件不受影响；
  // 排除表避开本面板已渲染的取数键，避免重复输入框。
  const mappingFields = schemaFields.filter(
    (f) =>
      f.group === "数据源" &&
      f.type === "text" &&
      f.key.startsWith("api") &&
      !API_MAPPING_RENDERED_KEYS.has(f.key) &&
      !(f.hidden && f.hidden(selCfg)),
  );
  // 数据字段键：绑定型用 field，图表族用 dataField；都没有则不渲染该输入
  const fieldKey = fieldOf("field") ? "field" : fieldOf("dataField") ? "dataField" : "";
  const compFieldValue = fieldKey ? String(selCfg[fieldKey] ?? "") : "";
  // 认证三级：null/undefined 跟随全局；true=强制认证；false=强制不认证
  const selAuthRaw = (selCfg.authEnabled as boolean | null | undefined) ?? null;
  const selAuthEffective = selAuthRaw ?? Boolean(config.authEnabled);

  // ── 被组件事件 callApi 引用（联动角标）──
  // 关联条件 = 事件 callApi 且（其 url 匹配本组件接口 或 其 refreshSourceIds 含本组件 id）
  const eventBindings = useEditorStore((s) => s.eventBindings);
  const linkedEvents = useMemo(
    () =>
      (selComponent
        ? eventBindings.filter((b) => {
            if (b.targetAction !== "callApi") return false;
            const bUrl = typeof b.params?.url === "string" ? (b.params.url as string) : "";
            const refreshIds = Array.isArray(b.params?.refreshSourceIds)
              ? (b.params.refreshSourceIds as string[])
              : [];
            const urlMatches = !!bUrl && (!!(selCfg.apiUrl as string) && bUrl.includes(selCfg.apiUrl as string));
            const refreshMatches = refreshIds.includes(selComponent.id);
            return urlMatches || refreshMatches;
          })
        : []) as typeof eventBindings,
    [eventBindings, selComponent, selCfg.apiUrl],
  );

  const [colsExpanded, setColsExpanded] = useState(true);
  const [rowFilterExpanded, setRowFilterExpanded] = useState(false);
  const [selExpanded, setSelExpanded] = useState(true);

  // ── 当前组件 · 接口可编辑（本地暂存 + blur 提交，字段与属性面板一致）──
  const compUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      if (selComponent) updateComponentConfig(selComponent.id, patch);
    },
    [selComponent, updateComponentConfig],
  );

  const [compMethod, setCompMethod] = useState<string>(String(selCfg.apiMethod ?? "GET"));
  useEffect(() => setCompMethod(String(selCfg.apiMethod ?? "GET")), [selCfg.apiMethod]);
  const [compUrlInput, setCompUrlInput] = useState<string>(String(selCfg.apiUrl ?? ""));
  useEffect(() => setCompUrlInput(String(selCfg.apiUrl ?? "")), [selCfg.apiUrl]);
  const commitCompUrl = useCallback(() => {
    const v = compUrlInput.trim();
    if (v !== (selCfg.apiUrl ?? "")) compUpdate({ apiUrl: v });
  }, [compUrlInput, selCfg.apiUrl, compUpdate]);
  const [compPathInput, setCompPathInput] = useState<string>(String(selCfg.apiDataPath ?? ""));
  useEffect(() => setCompPathInput(String(selCfg.apiDataPath ?? "")), [selCfg.apiDataPath]);
  const commitCompPath = useCallback(() => {
    const v = compPathInput.trim();
    if (v !== (selCfg.apiDataPath ?? "")) compUpdate({ apiDataPath: v });
  }, [compPathInput, selCfg.apiDataPath, compUpdate]);
  const [compIntervalInput, setCompIntervalInput] = useState<string>(String(selCfg.apiInterval ?? ""));
  useEffect(() => setCompIntervalInput(String(selCfg.apiInterval ?? "")), [selCfg.apiInterval]);
  const commitCompInterval = useCallback(() => {
    const n = parseInt(compIntervalInput, 10);
    const v = isNaN(n) || n < 0 ? 0 : Math.round(n);
    setCompIntervalInput(String(v === 0 ? "" : v));
    if (v !== Number(selCfg.apiInterval ?? 0)) compUpdate({ apiInterval: v });
  }, [compIntervalInput, selCfg.apiInterval, compUpdate]);

  // 数据字段（datasource 绑定用，本地暂存 + blur 提交）；键名随组件族：表单族 field / 图表族 dataField
  const [compFieldInput, setCompFieldInput] = useState<string>(compFieldValue);
  useEffect(() => setCompFieldInput(compFieldValue), [compFieldValue]);
  const commitCompField = useCallback(() => {
    if (!selComponent || !fieldKey) return;
    const v = compFieldInput.trim();
    if (v !== String(selCfg[fieldKey] ?? "")) compUpdate({ [fieldKey]: v });
  }, [selComponent, fieldKey, compFieldInput, selCfg, compUpdate]);

  // ── 组件级「高级请求」：请求头（行式）/ 请求体（JSON 文本）──
  // 与全局「默认请求头」段同一范式（行编辑 + blur/增删整体提交），差别只在落库形状：
  // 全局 defaultHeaders 存对象（引擎按 __WC_* 注入），组件级 apiHeaders/apiBody 存 **JSON 文本**
  // —— schema 声明为 text、编辑端 safeParseJSON、发布端 dataLoader JSON.parse，三处同源。
  // 编码/校验一律走 `requestExtras` 口径，面板不得自己拼字符串（否则又是"多处字面量漂移"）。
  const [advExpanded, setAdvExpanded] = useState(false);
  const compHeaderRowsFrom = useCallback(
    (): HeaderRow[] => Object.entries(jsonObjectOf(selCfg.apiHeaders)).map(([key, value]) => ({ key, value })),
    [selCfg.apiHeaders],
  );
  const [compHeaderRows, setCompHeaderRows] = useState<HeaderRow[]>(compHeaderRowsFrom);
  useEffect(() => setCompHeaderRows(compHeaderRowsFrom()), [compHeaderRowsFrom]);
  const compHeaderRowsRef = useRef(compHeaderRows);
  compHeaderRowsRef.current = compHeaderRows;
  const commitCompHeaders = useCallback(
    (rows: HeaderRow[]) => {
      const text = jsonTextOfRows(rows);
      if (text !== String(selCfg.apiHeaders ?? "")) compUpdate({ apiHeaders: text });
    },
    [selCfg.apiHeaders, compUpdate],
  );
  const updateCompHeaderRow = useCallback((idx: number, patch: Partial<HeaderRow>) => {
    setCompHeaderRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);
  const blurCompHeaderRow = useCallback(() => commitCompHeaders(compHeaderRowsRef.current), [commitCompHeaders]);
  const addCompHeaderRow = useCallback(() => {
    const next = [...compHeaderRowsRef.current, { key: "", value: "" }];
    setCompHeaderRows(next);
    commitCompHeaders(next);
  }, [commitCompHeaders]);
  const removeCompHeaderRow = useCallback(
    (idx: number) => {
      const next = compHeaderRowsRef.current.filter((_, i) => i !== idx);
      setCompHeaderRows(next);
      commitCompHeaders(next);
    },
    [commitCompHeaders],
  );

  const [compBodyInput, setCompBodyInput] = useState<string>(String(selCfg.apiBody ?? ""));
  useEffect(() => setCompBodyInput(String(selCfg.apiBody ?? "")), [selCfg.apiBody]);
  const commitCompBody = useCallback(() => {
    const v = compBodyInput.trim();
    if (v !== String(selCfg.apiBody ?? "")) compUpdate({ apiBody: v });
  }, [compBodyInput, selCfg.apiBody, compUpdate]);
  const compBodyError = jsonTextError(compBodyInput);
  const compHeadersConfigured = compHeaderRows.some((r) => r.key.trim() !== "");
  const compExtrasConfigured = compHeadersConfigured || String(selCfg.apiBody ?? "") !== "";

  // 认证三级：跟随全局=true(全局开时跟随)/强制认证/强制不认证
  const setCompAuth = useCallback(
    (v: boolean | null) => {
      if (!selComponent) return;
      if (v === null) {
        const { authEnabled: _, ...rest } = selCfg;
        void _;
        updateComponentConfig(selComponent.id, rest as Record<string, unknown>);
      } else {
        compUpdate({ authEnabled: v });
      }
    },
    [selComponent, selCfg, compUpdate, updateComponentConfig],
  );

  const navigateToEvent = useCallback(
    (bindingId: string) => {
      onNavigateToEvent?.(bindingId);
    },
    [onNavigateToEvent],
  );

  return (
    <Box>
      <SectionHeader
        title={`当前组件 · 接口`}
        icon={<LinkIcon sx={{ fontSize: 16 }} />}
        expanded={selExpanded}
        onToggle={() => setSelExpanded(!selExpanded)}
        extra={
          selComponent ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
              <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", fontStyle: "italic", flexShrink: 0 }}>
                仅当前组件
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {selComponent.name}
              </Typography>
              {linkedEvents.length > 0 && (
                <Tooltip title={`${linkedEvents.length} 个事件调用或依赖此接口`} arrow placement="top">
                  <Chip
                    icon={<BoltIcon sx={{ fontSize: 12 }} />}
                    size="small"
                    label={`关联 ${linkedEvents.length} 事件`}
                    sx={{ fontSize: 9.5, height: 18, bgcolor: "action.selected", color: "primary.main" }}
                  />
                </Tooltip>
              )}
            </Box>
          ) : undefined
        }
      />
      <Collapse in={selExpanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pl: 0.5, pt: 0.5 }}>
          {!selComponent ? (
            <Hint>在画布中选择一个组件，在其接口区配置数据来源。</Hint>
          ) : (
            <>
              {/* 数据来源：档位与显隐全部来自组件 schema（不再硬编码 static/api） */}
              {modeOptions.length > 0 && !isHidden("dataMode") && (
                <SettingRow label="数据来源">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                    {modeOptions.map((m) => (
                      <Chip
                        key={m.v}
                        size="small"
                        label={m.label}
                        variant={selMode === m.v ? "filled" : "outlined"}
                        color={selMode === m.v ? "primary" : "default"}
                        onClick={() => compUpdate({ dataMode: m.v })}
                        sx={{ fontSize: 10, height: 22, cursor: "pointer" }}
                      />
                    ))}
                  </Box>
                </SettingRow>
              )}

              {/* 数据源绑定：显隐同 schema。展示型组件绑定后 dataMode/api* 被 isBoundToGlobal
                  隐藏，此下拉成为唯一入口（正是此前完全不可达的那条链路）。 */}
              {supportsDatasource && !isHidden("dataSourceId") ? (
                <>
                  <SettingRow label="数据源">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <GlobalDataSourceSelect
                        value={String(selCfg.dataSourceId ?? "")}
                        onChange={(v) => compUpdate({ dataSourceId: v })}
                      />
                    </Box>
                  </SettingRow>
                  {fieldKey && !isHidden(fieldKey) && (
                    <SettingRow label="数据字段">
                      <TextField
                        size="small"
                        value={compFieldInput}
                        onChange={(e) => setCompFieldInput(e.target.value)}
                        onBlur={commitCompField}
                        placeholder="如 orderDate（留空取整个数据）"
                        sx={{ flex: 1, minWidth: 0, ...inputSx }}
                      />
                    </SettingRow>
                  )}
                  <Hint>
                    绑定后本组件数据取自该数据源，本地数据配置被忽略。
                    {selCfg.dataSourceId ? "" : " 请先选择数据源。"}
                  </Hint>
                </>
              ) : selMode === "api" && !isHidden("apiUrl") ? (
                <>
              {/* 接口方式 + 地址 */}
              <SettingRow label="接口">
                <TextField
                  select
                  size="small"
                  value={compMethod}
                  onChange={(e) => {
                    setCompMethod(e.target.value);
                    compUpdate({ apiMethod: e.target.value });
                  }}
                  sx={{ width: 104, ...inputSx }}
                >
                  <MenuItem value="GET">GET</MenuItem>
                  <MenuItem value="POST">POST</MenuItem>
                  <MenuItem value="PUT">PUT</MenuItem>
                  <MenuItem value="DELETE">DELETE</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  value={compUrlInput}
                  onChange={(e) => setCompUrlInput(e.target.value)}
                  onBlur={commitCompUrl}
                  placeholder="https://api.example.com/v1/users"
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                />
              </SettingRow>
              <Hint>
                {selCfg.apiUrl && /^https?:\/\//i.test(String(selCfg.apiUrl))
                  ? "完整 URL 直连，不受全局基地址影响。"
                  : selCfg.apiUrl
                    ? `相对路径，将自动拼接全局基地址（${config.baseUrl || "未配置基地址"}）。`
                    : "填写完整网址或相对路径；留空则用全局基地址兜底。"}
              </Hint>

              <SettingRow label="数据取用">
                <TextField
                  size="small"
                  value={compPathInput}
                  onChange={(e) => setCompPathInput(e.target.value)}
                  onBlur={commitCompPath}
                  placeholder="如 data.list（返回数组的字段路径）"
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                />
                <TextField
                  size="small"
                  type="number"
                  value={compIntervalInput}
                  onChange={(e) => setCompIntervalInput(e.target.value)}
                  onBlur={commitCompInterval}
                  placeholder="轮询"
                  sx={{ width: 84, ...inputSx }}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </SettingRow>

              {/* 认证三级 */}
              <SettingRow label="认证方式">
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  <Chip
                    size="small"
                    label={`跟随全局 · ${config.authEnabled ? "开" : "关"}`}
                    variant={selAuthRaw == null ? "filled" : "outlined"}
                    color={selAuthRaw == null ? "primary" : "default"}
                    onClick={() => setCompAuth(null)}
                    sx={{ fontSize: 10, height: 22, cursor: "pointer" }}
                  />
                  <Chip
                    size="small"
                    label="强制认证"
                    color={selAuthRaw === true ? "warning" : "default"}
                    variant={selAuthRaw === true ? "filled" : "outlined"}
                    onClick={() => setCompAuth(true)}
                    sx={{ fontSize: 10, height: 22, cursor: "pointer" }}
                  />
                  <Chip
                    size="small"
                    label="强制不认证"
                    color={selAuthRaw === false ? "default" : "default"}
                    variant={selAuthRaw === false ? "filled" : "outlined"}
                    onClick={() => setCompAuth(false)}
                    sx={{ fontSize: 10, height: 22, cursor: "pointer" }}
                  />
                </Box>
              </SettingRow>
              <Typography variant="caption" sx={{ color: selAuthEffective ? "warning.main" : "text.disabled", fontSize: 10, lineHeight: 1.5, px: 0.5 }}>
                {selAuthEffective
                  ? "运行时将自动注入认证 Token（来自登录组件）"
                  : "此接口按公开访问处理，不注入认证 Token"}
              </Typography>

              {/* 表格专用决策段（schema 驱动：组件声明 apiColumns / rowFilters 键且未 hidden 才渲染，
                  不硬编码组件类型）。与左侧属性栏是同一组受控件，配置写回
                  config.tableData.columns / config.rowFilters，经 mergeColumnDefs /
                  行过滤口径在编辑区与发布端双端生效。 */}
              {fieldOf("apiColumns") && !isHidden("apiColumns") && (
                <Box sx={{ mt: 1 }}>
                  <SectionHeader
                    title="列识别与勾选"
                    icon={<ViewColumnIcon sx={{ fontSize: 16 }} />}
                    expanded={colsExpanded}
                    onToggle={() => setColsExpanded(!colsExpanded)}
                  />
                  <Collapse in={colsExpanded} unmountOnExit>
                    <Box sx={{ pl: 0.5, pt: 0.5 }}>
                      <ApiColumnsPickerField
                        config={selCfg}
                        onChange={(key, value) => compUpdate({ [key]: value })}
                      />
                    </Box>
                  </Collapse>
                </Box>
              )}
              {fieldOf("rowFilters") && !isHidden("rowFilters") && (
                <Box sx={{ mt: 1 }}>
                  <SectionHeader
                    title="行过滤"
                    icon={<FilterListIcon sx={{ fontSize: 16 }} />}
                    expanded={rowFilterExpanded}
                    onToggle={() => setRowFilterExpanded(!rowFilterExpanded)}
                  />
                  <Collapse in={rowFilterExpanded} unmountOnExit>
                    <Box sx={{ pl: 0.5, pt: 0.5 }}>
                      <RowFiltersEditorField
                        config={selCfg}
                        onChange={(key, value) => compUpdate({ [key]: value })}
                      />
                    </Box>
                  </Collapse>
                </Box>
              )}

              {/* 接口字段映射：schema 声明了 api* 文本字段的组件在此获得唯一入口
                  （属性栏已把「数据源」整组过滤）。非受控 + blur 提交 ——
                  受控直连会让每敲一个字都改写 config，进而触发一次取数请求。 */}
              {mappingFields.map((f) => {
                const cur = String(selCfg[f.key] ?? "");
                return (
                  <SettingRow key={f.key} label={f.label}>
                    <TextField
                      size="small"
                      key={`${selComponent?.id ?? ""}-${f.key}-${cur}`}
                      defaultValue={cur}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== String(selCfg[f.key] ?? "")) compUpdate({ [f.key]: v });
                      }}
                      placeholder={typeof f.placeholder === "string" ? f.placeholder : undefined}
                      sx={{ flex: 1, minWidth: 0, ...inputSx }}
                    />
                  </SettingRow>
                );
              })}
              {mappingFields.length > 0 && (
                <Hint>
                  接口响应里的字段名。留空按内置回退链自动识别：取值 value→id、显示 label→name→text、
                  子级 children→items。
                </Hint>
              )}

              {/* 高级请求：请求头 / 请求体。schema 里这两键是 group「数据源」的 text 字段，
                  而属性栏把「数据源」整组过滤 → 此处是唯一可编辑入口（与下方全局「默认请求头」段同一范式）。
                  落库形状 = JSON 文本（schema text / 编辑端 safeParseJSON / 发布端 JSON.parse 三处同源），
                  编码与校验一律走 requestExtras 口径，面板不自己拼字符串。 */}
              {supportsReqExtras && (
                <Box sx={{ mt: 0.5 }}>
                  <SectionHeader
                    title="高级请求"
                    icon={<TuneIcon sx={{ fontSize: 16 }} />}
                    expanded={advExpanded}
                    onToggle={() => setAdvExpanded(!advExpanded)}
                    extra={
                      compExtrasConfigured ? (
                        <Typography variant="caption" sx={{ fontSize: 10, color: "primary.main", fontWeight: 700 }}>
                          已配置
                        </Typography>
                      ) : undefined
                    }
                  />
                  <Collapse in={advExpanded} unmountOnExit>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pl: 0.5, pt: 0.5 }}>
                      <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary" }}>
                        请求头（与全局默认请求头合并）
                      </Typography>
                      {compHeaderRows.map((row, i) => (
                        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                          <TextField
                            size="small"
                            value={row.key}
                            onChange={(e) => updateCompHeaderRow(i, { key: e.target.value })}
                            onBlur={blurCompHeaderRow}
                            placeholder="Header"
                            sx={{ flex: 1, minWidth: 0, ...inputSx }}
                          />
                          <TextField
                            size="small"
                            value={row.value}
                            onChange={(e) => updateCompHeaderRow(i, { value: e.target.value })}
                            onBlur={blurCompHeaderRow}
                            placeholder="Value"
                            sx={{ flex: 1, minWidth: 0, ...inputSx }}
                          />
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              onClick={() => removeCompHeaderRow(i)}
                              sx={{ color: "text.disabled", "&:hover": { color: "error.main" }, flexShrink: 0 }}
                            >
                              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                        onClick={addCompHeaderRow}
                        sx={{ textTransform: "none", fontSize: 12, alignSelf: "flex-start" }}
                      >
                        添加请求头
                      </Button>

                      <Divider sx={{ my: 0.5 }} />

                      <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "text.secondary" }}>
                        请求体（仅非 GET/HEAD 请求发送）
                      </Typography>
                      <TextField
                        size="small"
                        multiline
                        minRows={2}
                        maxRows={6}
                        value={compBodyInput}
                        onChange={(e) => setCompBodyInput(e.target.value)}
                        onBlur={commitCompBody}
                        placeholder='{"id":1}'
                        error={Boolean(compBodyError)}
                        helperText={compBodyError ?? undefined}
                        sx={{ "& .MuiInputBase-input": { fontSize: 12, fontFamily: "monospace" } }}
                      />
                      <Hint>
                        请求头按行填写，键为空的行会被忽略；请求体填 JSON 文本。校验不通过时发布端会忽略该配置。
                      </Hint>
                    </Box>
                  </Collapse>
                </Box>
              )}

              {/* 联动角标：被事件 callApi 引用 */}
              {linkedEvents.length > 0 && (
                <Box sx={{ mt: 0.5, borderTop: 1, borderColor: "divider", pt: 1, pl: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "text.primary", display: "flex", alignItems: "center", gap: 0.5 }}>
                    <BoltIcon sx={{ fontSize: 12, color: "primary.main" }} />
                    关联 {linkedEvents.length} 个事件（调用或刷新依赖）
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mt: 0.5 }}>
                    {linkedEvents.map((b) => {
                      const src = allComponents.find((c) => c.id === b.sourceComponentId);
                      const refreshIds = Array.isArray(b.params?.refreshSourceIds)
                        ? (b.params.refreshSourceIds as string[])
                        : [];
                      const isRefreshDep = refreshIds.includes(selComponent?.id ?? "");
                      const rel = isRefreshDep && src ? `${src.name} · 成功后刷新本接口` : `${src?.name ?? b.sourceComponentId} · 调用本接口`;
                      return (
                        <Box key={b.id} sx={{ display: "flex", alignItems: "center", gap: 0.5, fontSize: 10, color: "text.secondary" }}>
                          <BoltIcon sx={{ fontSize: 10, flexShrink: 0 }} />
                          <Typography variant="caption" sx={{ fontSize: 10, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rel}
                          </Typography>
                          <Tooltip title="前往事件 Tab 定位此绑定" arrow placement="top">
                            <IconButton size="small" onClick={() => navigateToEvent(b.id)} sx={{ p: 0.25 }}>
                              <ArrowForwardIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

                </>
              ) : (
                <Hint>
                  {modeOptions.length === 0 && !supportsDatasource
                    ? "该组件不支持数据接入配置。"
                    : "静态数据：使用组件自身默认值。切换到「接口读取」或「数据源绑定」以接入动态数据。"}
                </Hint>
              )}

              {/* 回头路：切成 api / 绑定数据源后，属性栏的「数据源」组恒被过滤，此处是唯一出口。
                  同时清 dataSourceId——展示型组件绑定后模式档位被 schema 隐藏，只剩这一条退路。 */}
              {(selMode !== "static" || Boolean(selCfg.dataSourceId)) && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => compUpdate({ dataMode: "static", dataSourceId: "" })}
                  sx={{ alignSelf: "flex-start", textTransform: "none", fontSize: 10.5, color: "text.secondary" }}
                >
                  切回静态数据
                </Button>
              )}
            </>
          )}
        </Box>
      </Collapse>
      <Divider sx={{ mt: 1.5 }} />
    </Box>
  );
}