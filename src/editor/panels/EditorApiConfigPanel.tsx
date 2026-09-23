import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Switch from "@mui/material/Switch";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { GlobalDataSourceSelect } from "../fields/GlobalDataSourceSelect";
import { componentRegistry } from "../registry";
import { createDefaultApiConfig } from "../../types/scene";
import type { SceneLoadingFeedback } from "../../types/scene";
import { jsonObjectOf, jsonTextError, jsonTextOfRows } from "../data/requestExtras";
import TuneIcon from "@mui/icons-material/Tune";
import DnsIcon from "@mui/icons-material/Dns";
import LinkIcon from "@mui/icons-material/Link";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
  extra,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        userSelect: "none",
        py: 0.75,
        "&:hover": { opacity: 0.8 },
      }}
    >
      <Box sx={{ color: "primary.main", display: "flex", alignItems: "center", fontSize: 18 }}>
        {icon}
      </Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "text.primary", fontSize: 12.5, flex: 1, letterSpacing: 0.3 }}
      >
        {title}
      </Typography>
      {extra}
      <Box sx={{ color: "text.disabled", display: "flex", alignItems: "center" }}>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
      </Box>
    </Box>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10.5, lineHeight: 1.6, px: 0.5, display: "block" }}>
      {children}
    </Typography>
  );
}

function SettingRow({
  label,
  children,
  labelWidth = 72,
}: {
  label: string;
  children: React.ReactNode;
  labelWidth?: number;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 34 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", width: labelWidth, flexShrink: 0, fontSize: 12, lineHeight: "34px" }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

const inputSx = {
  "& .MuiInputBase-input": { fontSize: 12.5, py: 0.5, px: 1 },
  "& .MuiInputBase-root": { minHeight: 30 },
  "& .MuiInputLabel-root": { fontSize: 12.5 },
} as const;

/**
 * 「接口字段映射」的排除表 —— 这几个键**本面板已经渲染**（`apiFields` 生成的那批：
 * 接口地址 / 路径 / 方式 / 请求头 / 请求体 / 数据取用），不能在通用映射区重复出现。
 */
const API_MAPPING_RENDERED_KEYS = new Set([
  "apiUrl", "apiPath", "apiMethod", "apiHeaders", "apiBody", "apiDataPath", "apiInterval",
]);

type HeaderRow = { key: string; value: string };

const RULE_HINTS: Array<{ title: string; desc: string }> = [
  { title: "完整 URL 直连", desc: "组件 apiUrl 为 http(s):// 开头时原样使用，忽略基地址" },
  { title: "相对路径拼接", desc: "组件 apiUrl 为相对路径时自动拼接基地址（处理首尾斜杠）" },
  { title: "基地址兜底", desc: "组件 apiUrl 为空且使用 apiPath 时，用基地址 + apiPath 拼接" },
  { title: "全局兜底", desc: "apiUrl/apiPath 均为空时，请求基线即基地址本身" },
];

/**
 * 全局 API 配置面板 — 场景级统一数据接入层的配置入口
 *
 * 通过 editorStore 的 apiConfig / setApiConfig 读写以下字段：
 *   - baseUrl:        API 基地址，组件的相对 apiUrl / apiPath 与之拼接（完整 URL 直连不参与拼接）
 *   - authEnabled:    全局认证开关，组件 authEnabled 为 null 时跟随此值
 *   - defaultHeaders: 全局默认请求头，所有 API 请求自动携带（key 为空的行忽略）
 *   - timeout:        请求超时（ms），默认 10000
 *
 * 组件级接口区（componentId 传入时启用）针对当前选中组件可直接编辑，
 * 字段与属性面板「数据源」一致（apiMethod / apiUrl / apiDataPath / apiInterval / authEnabled），
 * 通过 updateComponentConfig 写回，两处实时同步。
 */
interface EditorApiConfigPanelProps {
  /** 当前选中组件 id；传给组件级接口面板进行可编辑（需组件存在且匹配） */
  componentId?: string;
  /** 从 API 面板跳转到事件 Tab 并定位指定事件绑定的回调（由 SceneEditor 提供） */
  onNavigateToEvent?: (bindingId: string) => void;
}

export function EditorApiConfigPanel({ componentId, onNavigateToEvent }: EditorApiConfigPanelProps) {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const setApiConfig = useEditorStore((s) => s.setApiConfig);
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

  const [basicExpanded, setBasicExpanded] = useState(true);
  const [headersExpanded, setHeadersExpanded] = useState(true);
  const [ruleExpanded, setRuleExpanded] = useState(false);
  const [loadingExpanded, setLoadingExpanded] = useState(true);
  const [selExpanded, setSelExpanded] = useState(true);

  // ── 自动加载反馈：配置读写 + 本地暂存（blur 提交） ──
  const LF_DEFAULT = createDefaultApiConfig().loadingFeedback!;
  const lf = config.loadingFeedback ?? LF_DEFAULT;
  const setLF = useCallback(
    (patch: Partial<SceneLoadingFeedback>) => {
      setApiConfig({ loadingFeedback: { ...(config.loadingFeedback ?? LF_DEFAULT), ...patch } });
    },
    [config.loadingFeedback, setApiConfig],
  );

  const [loadingSizeInput, setLoadingSizeInput] = useState(String(lf.size ?? 36));
  useEffect(() => setLoadingSizeInput(String(lf.size ?? 36)), [lf.size]);
  const commitLoadingSize = () => {
    const n = parseInt(loadingSizeInput, 10);
    const v = isNaN(n) ? 36 : Math.min(Math.max(Math.round(n), 16), 120);
    setLoadingSizeInput(String(v));
    if (v !== (lf.size ?? 36)) setLF({ size: v });
  };
  const [loadingSpeedInput, setLoadingSpeedInput] = useState(String(lf.speed ?? 1));
  useEffect(() => setLoadingSpeedInput(String(lf.speed ?? 1)), [lf.speed]);
  const commitLoadingSpeed = () => {
    const n = parseFloat(loadingSpeedInput);
    const v = isNaN(n) ? 1 : Math.min(Math.max(n, 0.3), 3);
    setLoadingSpeedInput(String(v));
    if (v !== (lf.speed ?? 1)) setLF({ speed: v });
  };
  const [loadingStrokeInput, setLoadingStrokeInput] = useState(String(lf.strokeWidth ?? 4));
  useEffect(() => setLoadingStrokeInput(String(lf.strokeWidth ?? 4)), [lf.strokeWidth]);
  const commitLoadingStroke = () => {
    const n = parseInt(loadingStrokeInput, 10);
    const v = isNaN(n) ? 4 : Math.min(Math.max(Math.round(n), 2), 8);
    setLoadingStrokeInput(String(v));
    if (v !== (lf.strokeWidth ?? 4)) setLF({ strokeWidth: v });
  };

  // ── 本地暂存：onChange 只改本地 state，onBlur 才提交 store（避免每按键 pushHistory） ──
  const [baseUrlInput, setBaseUrlInput] = useState(config.baseUrl);
  useEffect(() => setBaseUrlInput(config.baseUrl), [config.baseUrl]);
  const handleBaseUrlBlur = useCallback(() => {
    const v = baseUrlInput.trim();
    if (v !== config.baseUrl) setApiConfig({ baseUrl: v });
  }, [baseUrlInput, config.baseUrl, setApiConfig]);

  const [timeoutInput, setTimeoutInput] = useState(String(config.timeout ?? 10000));
  useEffect(() => setTimeoutInput(String(config.timeout ?? 10000)), [config.timeout]);
  const handleTimeoutBlur = useCallback(() => {
    const n = parseInt(timeoutInput, 10);
    const v = isNaN(n) || n <= 0 ? 10000 : Math.round(n);
    setTimeoutInput(String(v));
    if (v !== (config.timeout ?? 10000)) setApiConfig({ timeout: v });
  }, [timeoutInput, config.timeout, setApiConfig]);

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

  // ── 默认请求头：本地行编辑，blur / 增删时整体提交 ──
  const rowsFromConfig = useCallback(
    (): HeaderRow[] => Object.entries(config.defaultHeaders ?? {}).map(([key, value]) => ({ key, value })),
    [config.defaultHeaders],
  );
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(rowsFromConfig);
  useEffect(() => setHeaderRows(rowsFromConfig()), [rowsFromConfig]);

  const headerRowsRef = useRef(headerRows);
  headerRowsRef.current = headerRows;

  const commitHeaders = useCallback(
    (rows: HeaderRow[]) => {
      const next: Record<string, string> = {};
      for (const r of rows) {
        const k = r.key.trim();
        if (k) next[k] = r.value;
      }
      setApiConfig({ defaultHeaders: next });
    },
    [setApiConfig],
  );

  const updateHeaderRow = useCallback((idx: number, patch: Partial<HeaderRow>) => {
    setHeaderRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const handleHeaderBlur = useCallback(() => {
    commitHeaders(headerRowsRef.current);
  }, [commitHeaders]);

  const addHeaderRow = useCallback(() => {
    const next = [...headerRowsRef.current, { key: "", value: "" }];
    setHeaderRows(next);
    commitHeaders(next);
  }, [commitHeaders]);

  const removeHeaderRow = useCallback(
    (idx: number) => {
      const next = headerRowsRef.current.filter((_, i) => i !== idx);
      setHeaderRows(next);
      commitHeaders(next);
    },
    [commitHeaders],
  );

  const hasBaseUrl = Boolean(config.baseUrl);
  // 站点运行模式：显式配置优先，缺省 auto（按组件动态判定）
  const siteMode: "static" | "dynamic" | "auto" = config.siteMode ?? "auto";

  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* ── 摘要条 ── */}
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1, py: 0.5, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11 }}>
            数据与认证
          </Typography>
          <Chip
            size="small"
            label={siteMode === "static" ? "静态" : siteMode === "dynamic" ? "动态" : "自动"}
            sx={{ fontSize: 9.5, height: 16, bgcolor: siteMode === "static" ? "action.selected" : siteMode === "dynamic" ? "primary.main" : "action.hover", color: siteMode === "dynamic" ? "#fff" : "text.secondary" }}
          />
          <Chip
            size="small"
            icon={config.authEnabled ? undefined : undefined}
            label={config.authEnabled ? "需认证" : "匿名可访问"}
            sx={{ fontSize: 9.5, height: 16, bgcolor: config.authEnabled ? "warning.main" : "action.hover", color: config.authEnabled ? "#fff" : "text.secondary" }}
          />
        </Box>
        {hasBaseUrl ? (
          <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "success.main" }}>已启用</Typography>
        ) : (
          <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "text.disabled" }}>未启用</Typography>
        )}
      </Box>

      {/* ── 滚动内容 ── */}
      <Box sx={{
        flex: 1, overflow: "auto", px: 1.5, py: 1.5,
        display: "flex", flexDirection: "column", gap: 1,
        "&::-webkit-scrollbar": { width: 6 },
        "&::-webkit-scrollbar-thumb": { borderRadius: 3, backgroundColor: "action.disabled" },
        "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "action.disabledOpacity" },
      }}>
        {/* === 当前组件 · 接口：可编辑视口 === */}
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

        {/* === 基础配置 === */}
        <Box>
          <SectionHeader title="基础配置" icon={<TuneIcon sx={{ fontSize: 16 }} />} expanded={basicExpanded} onToggle={() => setBasicExpanded(!basicExpanded)} />
          <Collapse in={basicExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5, pt: 0.5 }}>
              {/* 站点运行模式：静态 / 动态 / 自动 */}
              <SettingRow label="站点模式">
                <TextField
                  select
                  size="small"
                  value={siteMode}
                  onChange={(e) => setApiConfig({ siteMode: e.target.value as "static" | "dynamic" | "auto" })}
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                >
                  <MenuItem value="auto">自动（按组件判定）</MenuItem>
                  <MenuItem value="dynamic">动态（依赖 API）</MenuItem>
                  <MenuItem value="static">静态（离线内联数据）</MenuItem>
                </TextField>
              </SettingRow>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
                <HelpOutlineOutlinedIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
                  {siteMode === "static"
                    ? "纯静态站点：数据内联，可离线发布，无运行时请求。"
                    : siteMode === "dynamic"
                      ? "动态站点：数据通过 API 拉取，需网络与接口运行环境。"
                      : "自动模式：系统按组件是否存在动态数据源自动判定（见右上角站点标识）。"}
                </Typography>
              </Box>

              <Tooltip title="所有数据组件的 API 请求默认基于此地址。组件 apiUrl 为完整 URL 时不受影响" arrow placement="top-start">
                <SettingRow label="基地址">
                  <TextField
                    size="small"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    onBlur={handleBaseUrlBlur}
                    placeholder="https://api.example.com/v1"
                    sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  />
                </SettingRow>
              </Tooltip>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
                <HelpOutlineOutlinedIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
                  组件配置相对 apiUrl / apiPath 时自动与此地址拼接；全部留空时作为请求基线兜底。
                </Typography>
              </Box>

              <SettingRow label="自动认证">
                <Switch
                  size="small"
                  checked={config.authEnabled}
                  onChange={(e) => setApiConfig({ authEnabled: e.target.checked })}
                />
                <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
                  开启后，数据组件请求自动注入认证 Token（来自登录组件）。组件层面可单独覆盖。
                </Typography>
              </SettingRow>

              <SettingRow label="超时时间">
                <TextField
                  type="number"
                  size="small"
                  value={timeoutInput}
                  onChange={(e) => setTimeoutInput(e.target.value)}
                  onBlur={handleTimeoutBlur}
                  sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>ms</Typography>
              </SettingRow>
            </Box>
          </Collapse>
          <Divider sx={{ mt: 1.5 }} />
        </Box>

        {/* === 自动加载反馈 === */}
        <Box>
          <SectionHeader title="全局加载反馈" icon={<AutorenewRoundedIcon sx={{ fontSize: 16 }} />} expanded={loadingExpanded} onToggle={() => setLoadingExpanded(!loadingExpanded)} />
          <Collapse in={loadingExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5, pt: 0.5 }}>
              <SettingRow label="启用">
                <Switch
                  size="small"
                  checked={lf.enabled}
                  onChange={(e) => setLF({ enabled: e.target.checked })}
                />
                <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
                  发布端一旦有进行中的网络请求，自动显示全屏加载指示；请求全部完成自动隐藏。无需在画布摆放加载组件。
                </Typography>
              </SettingRow>

              {lf.enabled && (
                <>
                  <SettingRow label="动画色">
                    <Box
                      sx={{
                        width: 30, height: 30, borderRadius: 1, border: "1px solid",
                        borderColor: "divider", flexShrink: 0, p: 2, background: lf.color ?? "#0D9488",
                      }}
                    />
                    <input
                      type="color"
                      value={lf.color ?? "#0D9488"}
                      onChange={(e) => setLF({ color: e.target.value })}
                      style={{ width: 44, height: 30, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled" }}>{lf.color ?? "#0D9488"}</Typography>
                  </SettingRow>

                  <SettingRow label="尺寸">
                    <TextField
                      type="number"
                      size="small"
                      value={loadingSizeInput}
                      onChange={(e) => setLoadingSizeInput(e.target.value)}
                      onBlur={commitLoadingSize}
                      sx={{ flex: 1, minWidth: 0, ...inputSx }}
                      slotProps={{ htmlInput: { min: 16, max: 120 } }}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>px</Typography>
                  </SettingRow>

                  <SettingRow label="粗细">
                    <TextField
                      type="number"
                      size="small"
                      value={loadingStrokeInput}
                      onChange={(e) => setLoadingStrokeInput(e.target.value)}
                      onBlur={commitLoadingStroke}
                      sx={{ flex: 1, minWidth: 0, ...inputSx }}
                      slotProps={{ htmlInput: { min: 2, max: 8 } }}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>px</Typography>
                  </SettingRow>

                  <SettingRow label="转速">
                    <TextField
                      type="number"
                      size="small"
                      value={loadingSpeedInput}
                      onChange={(e) => setLoadingSpeedInput(e.target.value)}
                      onBlur={commitLoadingSpeed}
                      sx={{ flex: 1, minWidth: 0, ...inputSx }}
                      slotProps={{ htmlInput: { min: 0.3, max: 3, step: 0.1 } }}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>秒/圈</Typography>
                  </SettingRow>

                  <SettingRow label="遮罩">
                    <Switch
                      size="small"
                      checked={lf.masked ?? true}
                      onChange={(e) => setLF({ masked: e.target.checked })}
                    />
                    <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.secondary", lineHeight: 1.5, flex: 1 }}>
                      开启后覆盖层带半透明背景，弱化当前内容；关闭则仅在中央显示动画、不遮挡页面。
                    </Typography>
                  </SettingRow>
                </>
              )}
            </Box>
          </Collapse>
          <Divider sx={{ mt: 1.5 }} />
        </Box>

        {/* === 默认请求头 === */}
        <Box>
          <SectionHeader title="默认请求头" icon={<DnsIcon sx={{ fontSize: 16 }} />} expanded={headersExpanded} onToggle={() => setHeadersExpanded(!headersExpanded)} />
          <Collapse in={headersExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pl: 0.5, pt: 0.5 }}>
              {headerRows.length === 0 && (
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", py: 0.5 }}>
                  未配置请求头，所有 API 请求仅携带默认头。
                </Typography>
              )}
              {headerRows.map((row, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                  <TextField
                    size="small"
                    value={row.key}
                    onChange={(e) => updateHeaderRow(i, { key: e.target.value })}
                    onBlur={handleHeaderBlur}
                    placeholder="Header"
                    sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  />
                  <TextField
                    size="small"
                    value={row.value}
                    onChange={(e) => updateHeaderRow(i, { value: e.target.value })}
                    onBlur={handleHeaderBlur}
                    placeholder="Value"
                    sx={{ flex: 1, minWidth: 0, ...inputSx }}
                  />
                  <Tooltip title="删除">
                    <IconButton size="small" onClick={() => removeHeaderRow(i)} sx={{ color: "text.disabled", "&:hover": { color: "error.main" }, flexShrink: 0 }}>
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                onClick={addHeaderRow}
                sx={{ textTransform: "none", fontSize: 12, mt: 0.25 }}
              >
                添加请求头
              </Button>
              <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
                key 为空的行会被忽略；输入完按回车或点击其他区域生效。
              </Typography>
            </Box>
          </Collapse>
          <Divider sx={{ mt: 1.5 }} />
        </Box>

        {/* === URL 拼接规则说明 === */}
        <Box>
          <SectionHeader title="URL 拼接规则" icon={<LinkIcon sx={{ fontSize: 16 }} />} expanded={ruleExpanded} onToggle={() => setRuleExpanded(!ruleExpanded)} />
          <Collapse in={ruleExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pl: 0.5, pt: 0.5 }}>
              {RULE_HINTS.map((r) => (
                <Box key={r.title} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", flexShrink: 0, width: 88 }}>
                    {r.title}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.6 }}>
                    {r.desc}
                  </Typography>
                </Box>
              ))}
              <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6, pt: 0.5 }}>
                编辑态与发布产物严格遵循同一套规则。
              </Typography>
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
}