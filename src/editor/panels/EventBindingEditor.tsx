import { useState, useMemo, useEffect, Fragment } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";
import type { EventBinding, EventActionStep, SceneComponent } from "../../types/editor";
import { useEditorStore } from "../../store/editorStore";
import { useSceneVariableStore } from "../../store/sceneVariableStore";
import { getEventsForComponent, getActionsForTarget, BUILTIN_ACTIONS, type ActionInfo, type ParamField } from "../utils/eventActionRegistry";
import { NavigateToSceneParamsEditor } from "./NavigateToSceneParamsEditor";

interface EventBindingEditorProps {
  binding: EventBinding;
  onSave: (binding: EventBinding) => void;
  onCancel: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: "block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        color: "text.secondary",
        mb: 0.75,
        mt: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

/** 序列步骤参数字段渲染（A3）：text/number/select/boolean/json；scene/view 类型退化为 ID 文本输入 */
function StepParamsFields({
  schema,
  params,
  onChange,
}: {
  schema: ParamField[];
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <>
      {schema.map((field) => {
        if (field.type === "boolean") {
          return (
            <Box key={field.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", flex: 1 }}>
                {field.label}
              </Typography>
              <input
                type="checkbox"
                style={{ accentColor: "#1976d2", width: 16, height: 16, cursor: "pointer" }}
                checked={Boolean(params[field.key])}
                onChange={(e) => onChange({ ...params, [field.key]: e.target.checked })}
              />
            </Box>
          );
        }
        if (field.type === "select") {
          return (
            <TextField
              key={field.key}
              select
              size="small"
              label={field.label}
              value={String(params[field.key] ?? "")}
              onChange={(e) => onChange({ ...params, [field.key]: e.target.value })}
              fullWidth
            >
              {(field.options ?? []).map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          );
        }
        const isJson = field.type === "json";
        const rawVal = params[field.key];
        const display =
          isJson && rawVal != null && typeof rawVal === "object"
            ? JSON.stringify(rawVal)
            : String(rawVal ?? "");
        const isRef = field.type === "scene" || field.type === "view";
        return (
          <TextField
            key={field.key}
            size="small"
            label={isRef ? `${field.label} (ID)` : field.label}
            type={field.type === "number" ? "number" : "text"}
            value={display}
            onChange={(e) => {
              let v: unknown = e.target.value;
              if (field.type === "number") v = e.target.value === "" ? undefined : Number(e.target.value);
              onChange({ ...params, [field.key]: v });
            }}
            placeholder={field.placeholder}
            required={field.required}
            multiline={isJson}
            minRows={isJson ? 1 : undefined}
            fullWidth
            helperText={field.type === "scene" ? "填场景 ID" : field.type === "view" ? "填视图 ID" : undefined}
          />
        );
      })}
    </>
  );
}

/**
 * ActionSequenceEditor - 动作序列编辑器（A3 IR 的面板 UI）
 * 独立导出便于复用与测试；触发后步骤按序执行，condition/throttle/debounce 作用于整条序列
 */
export function ActionSequenceEditor({
  steps,
  components,
  allActions,
  groupedActions,
  onChange,
}: {
  steps: EventActionStep[];
  components: SceneComponent[];
  allActions: ActionInfo[];
  groupedActions: [string, ActionInfo[]][];
  onChange: (steps: EventActionStep[]) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {steps.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          暂无步骤，点击下方按钮添加（也可由单动作迁移而来）
        </Typography>
      )}
      {steps.map((step, idx) => {
        const stepComp = components.find((c) => c.id === step.targetComponentId);
        const stepDef = allActions.find((a) => a.name === step.targetAction);
        const updateStep = (patch: Partial<EventActionStep>) =>
          onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
        return (
          <Box
            key={idx}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              p: 1.25,
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: "text.primary" }}>
                步骤 {idx + 1}
              </Typography>
              <IconButton
                size="small"
                onClick={() => onChange(steps.filter((_, i) => i !== idx))}
                aria-label="删除步骤"
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
            <Autocomplete<SceneComponent>
              size="small"
              options={components}
              value={stepComp ?? null}
              getOptionLabel={(opt) => opt.name || opt.type}
              onChange={(_, newValue) =>
                updateStep({ targetComponentId: newValue?.id ?? "", targetAction: "", params: {} })
              }
              renderInput={(inputProps) => (
                <TextField {...inputProps} label="目标组件" placeholder="搜索组件..." />
              )}
              noOptionsText="无匹配组件"
              slotProps={{ paper: { sx: { zIndex: 1500 } } }}
            />
            <TextField
              select
              size="small"
              label="执行动作"
              value={step.targetAction}
              onChange={(e) => updateStep({ targetAction: e.target.value, params: {} })}
              fullWidth
              disabled={!step.targetComponentId}
            >
              {groupedActions.map(([cat, list]) => (
                <Fragment key={cat}>
                  <MenuItem disabled sx={{ opacity: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                      {cat}
                    </Typography>
                  </MenuItem>
                  {list.map((action) => (
                    <MenuItem key={action.name} value={action.name}>
                      {action.label}
                    </MenuItem>
                  ))}
                </Fragment>
              ))}
            </TextField>
            {stepDef?.paramsSchema && stepDef.paramsSchema.length > 0 && (
              <StepParamsFields
                schema={stepDef.paramsSchema}
                params={step.params ?? {}}
                onChange={(p) => updateStep({ params: p })}
              />
            )}
          </Box>
        );
      })}
      <Button
        size="small"
        variant="outlined"
        onClick={() => onChange([...steps, { targetComponentId: "", targetAction: "" }])}
        sx={{ textTransform: "none", alignSelf: "flex-start" }}
      >
        + 添加步骤
      </Button>
      <Typography variant="caption" color="text.secondary">
        触发后按顺序依次执行各步骤；条件/节流/防抖作用于整条序列，各步骤参数中可用 {"{{value}}"} 接收事件值。
      </Typography>
    </Box>
  );
}

/**
 * EventBindingEditor - 事件绑定编辑对话框
 * 提供完整的事件绑定配置表单
 */
export function EventBindingEditor({ binding, onSave, onCancel }: EventBindingEditorProps) {
  const components = useEditorStore((s) => s.components);
  const sourceComponent = components.find((c) => c.id === binding.sourceComponentId);

  const [sourceEvent, setSourceEvent] = useState<string>(binding.sourceEvent);
  const [targetComponentId, setTargetComponentId] = useState<string>(binding.targetComponentId);
  const [targetAction, setTargetAction] = useState<string>(binding.targetAction);
  const [params, setParams] = useState<Record<string, unknown>>(binding.params ?? {});
  const [condition, setCondition] = useState<string>(binding.condition ?? "");
  const [triggerSource, setTriggerSource] = useState<string>(binding.triggerSource ?? 'interaction');
  const [enabled, setEnabled] = useState<boolean>(binding.enabled !== false);
  const [throttle, setThrottle] = useState<string>(binding.throttle ? String(binding.throttle) : '');
  const [debounce, setDebounce] = useState<string>(binding.debounce ? String(binding.debounce) : '');

  // 动作类型：目标组件动作 / 调用接口 / 动作序列（A3）
  const isCallApi = binding.targetAction === "callApi";
  const [actionType, setActionType] = useState<"target" | "callApi" | "sequence">(
    binding.actions && binding.actions.length > 0 ? "sequence" : isCallApi ? "callApi" : "target"
  );
  const [steps, setSteps] = useState<EventActionStep[]>(binding.actions ?? []);
  const [apiUrl, setApiUrl] = useState<string>((binding.params?.url as string) ?? "");
  const [apiMethod, setApiMethod] = useState<string>(String(binding.params?.method ?? "GET"));
  const [apiAuth, setApiAuth] = useState<boolean>((binding.params?.authEnabled as boolean) ?? false);
  const [apiBody, setApiBody] = useState<string>((binding.params?.body as string) ?? "");
  // 是否绑定"事件源组件的接口"（true 时接口地址/方式跟随源组件配置）
  const [bindCompApi, setBindCompApi] = useState<boolean>(Boolean(binding.params?.boundCompApi));

  // ── callApi 请求定义扩展 ──
  // headers：以 "key: value" 多行文本暂存
  const [apiHeadersText, setApiHeadersText] = useState<string>(() => {
    const h = binding.params?.headers;
    if (h && typeof h === "object") {
      return Object.entries(h as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    }
    return "";
  });
  const [apiResponsePath, setApiResponsePath] = useState<string>(String(binding.params?.responsePath ?? ""));
  const [apiWriteVar, setApiWriteVar] = useState<string>(String(binding.params?.onSuccessWriteVar ?? ""));
  const [apiRefreshSources, setApiRefreshSources] = useState<string[]>(
    Array.isArray(binding.params?.refreshSourceIds) ? (binding.params?.refreshSourceIds as string[]) : []
  );

  // 场景变量列表（供"成功写入变量"下拉 + 新建）
  const [sceneVarNames, setSceneVarNames] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => setSceneVarNames(Object.keys(useSceneVariableStore.getState().variables));
    refresh();
    const unsub = useSceneVariableStore.subscribe(() => refresh());
    return unsub;
  }, []);

  // 可被刷新重拉的 API 组件（dataMode === 'api'），用于"成功后刷新组件接口"多选
  const apiTargetComponents = useMemo(
    () => components.filter((c) => (c.config?.dataMode ?? "static") === "api"),
    [components]
  );

  // 事件源组件及其接口配置（作为 callApi 绑定的来源）
  const sourceComp = components.find((c) => c.id === binding.sourceComponentId);
  const sourceCompApi = useMemo(() => {
    if (!sourceComp) return null;
    const cfg = sourceComp.config ?? {};
    const dm = (cfg.dataMode ?? "static") === "api";
    const url = String(cfg.apiUrl ?? "");
    if (!dm || !url) return null;
    return { url: url.trim(), method: String(cfg.apiMethod ?? "GET"), interval: Number(cfg.apiInterval ?? 0) };
  }, [sourceComp]);

  const events = useMemo(
    () => getEventsForComponent(sourceComponent?.type, triggerSource),
    [sourceComponent?.type, triggerSource]
  );

  const targetComponent = components.find((c) => c.id === targetComponentId);

  const actions = useMemo(
    () => getActionsForTarget(targetComponent?.type),
    [targetComponent?.type]
  );

  // A3：序列步动作查找（与目标组件无关的恒定清单）
  const allActions = useMemo(() => getActionsForTarget(), []);

  const currentActionDef: ActionInfo | undefined = actions.find((a) => a.name === targetAction);

  // 动作按类别分组，避免 15 项平铺难选（按钮点击配置更清晰）
  const ACTION_CATEGORY: Record<string, string> = {
    navigateToScene: "导航", navigate: "导航",
    highlight: "显示控制", hide: "显示控制", show: "显示控制", toggleVisible: "显示控制",
    setData: "数据", toggleData: "数据", setVariable: "数据", callApi: "接口",
    switchView: "视图", playSound: "交互", openDialog: "交互", closeDialog: "交互",
    executeScript: "脚本",
  };
  const groupedActions = useMemo(() => {
    const map = new Map<string, ActionInfo[]>();
    actions.forEach((a) => {
      const cat = ACTION_CATEGORY[a.name] ?? "其他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(a);
    });
    return Array.from(map.entries());
  }, [actions]);

  const handleSave = () => {
    if (actionType === "sequence") {
      if (!sourceEvent) return;
      // A3：清洗序列（json 字段字符串 → 对象；丢弃未完成的步骤）
      const clean = steps
        .filter((s) => s.targetComponentId && s.targetAction)
        .map((s) => {
          const def = BUILTIN_ACTIONS.find((a) => a.name === s.targetAction);
          const out: Record<string, unknown> = { ...(s.params ?? {}) };
          (def?.paramsSchema ?? []).forEach((f) => {
            if (f.type === "json" && typeof out[f.key] === "string") {
              const t = (out[f.key] as string).trim();
              if (t) {
                try { out[f.key] = JSON.parse(t); } catch { /* 保留原字符串 */ }
              } else {
                delete out[f.key];
              }
            }
          });
          return {
            targetComponentId: s.targetComponentId,
            targetAction: s.targetAction,
            params: Object.keys(out).length > 0 ? out : undefined,
          };
        });
      if (clean.length === 0) return;
      onSave({
        ...binding,
        sourceEvent,
        actions: clean,
        condition: condition.trim() || undefined,
        triggerSource: triggerSource as 'interaction' | 'data' | 'threshold' | 'timer' | 'state',
        enabled,
        throttle: throttle ? parseInt(throttle, 10) : undefined,
        debounce: debounce ? parseInt(debounce, 10) : undefined,
      });
      return;
    }
    if (actionType === "callApi") {
      if (!sourceEvent) return;
      if (bindCompApi && !sourceCompApi) return;
      const finalUrl = bindCompApi ? (sourceCompApi?.url ?? "") : apiUrl.trim();
      if (!finalUrl) return;
      let bodyVal: unknown = apiBody.trim() ? apiBody.trim() : undefined;
      if (bodyVal) {
        try { bodyVal = JSON.parse(apiBody); } catch { /* 保留原文当字符串 */ }
      }
      const finalMethod = bindCompApi ? (sourceCompApi?.method ?? "GET") : apiMethod;
      const p: Record<string, unknown> = { __kind: "callApi", url: finalUrl, method: finalMethod };
      if (bindCompApi) p.boundCompApi = true;
      if (bodyVal !== undefined) p.body = bodyVal;
      if (apiAuth) p.authEnabled = true;
      // ── 请求定义扩展（headers / 响应路径 / 落地）──
      const parsedHeaders: Record<string, string> = {};
      apiHeadersText.split("\n").forEach((line) => {
        const idx = line.indexOf(":");
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k) parsedHeaders[k] = v;
        }
      });
      if (Object.keys(parsedHeaders).length > 0) p.headers = parsedHeaders;
      if (apiResponsePath.trim()) p.responsePath = apiResponsePath.trim();
      if (apiWriteVar.trim()) p.onSuccessWriteVar = apiWriteVar.trim();
      if (apiRefreshSources.length > 0) p.refreshSourceIds = apiRefreshSources;
      onSave({
        ...binding,
        sourceEvent,
        targetAction: "callApi",
        targetComponentId: "",
        params: p,
        condition: condition.trim() || undefined,
        triggerSource: triggerSource as 'interaction' | 'data' | 'threshold' | 'timer' | 'state',
        enabled,
        throttle: throttle ? parseInt(throttle, 10) : undefined,
        debounce: debounce ? parseInt(debounce, 10) : undefined,
      });
      return;
    }
    if (!sourceEvent || !targetComponentId || !targetAction) return;
    onSave({
      ...binding,
      sourceEvent,
      targetComponentId,
      targetAction,
      params: Object.keys(params).length > 0 ? params : undefined,
      actions: undefined, // 切回单动作时清空序列
      condition: condition.trim() || undefined,
      triggerSource: triggerSource as 'interaction' | 'data' | 'threshold' | 'timer' | 'state',
      enabled,
      throttle: throttle ? parseInt(throttle, 10) : undefined,
      debounce: debounce ? parseInt(debounce, 10) : undefined,
    });
  };

  const validStepCount = steps.filter((s) => s.targetComponentId && s.targetAction).length;
  const isValid = actionType === "callApi"
    ? Boolean(sourceEvent && (bindCompApi ? !!sourceCompApi : apiUrl.trim()))
    : actionType === "sequence"
      ? Boolean(sourceEvent && validStepCount > 0)
      : Boolean(sourceEvent && targetComponentId && targetAction);

  return (
    <Dialog
      open
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            maxHeight: "80vh",
          },
        },
      }}
    >
      {/* 标题栏 */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          fontSize: 15,
          fontWeight: 600,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        编辑事件绑定
        <IconButton size="small" onClick={onCancel} sx={{ ml: 1 }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      {/* 表单内容 */}
      <DialogContent
        dividers
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          px: 2.5,
          py: 2,
        }}
      >
        {/* 第零部分：触发源类型 */}
        <Box>
          <SectionLabel>触发源</SectionLabel>
          <TextField
            select
            size="small"
            label="触发类型"
            value={triggerSource}
            onChange={(e) => {
              setTriggerSource(e.target.value);
              setSourceEvent(''); // 切换触发源时重置事件
            }}
            fullWidth
          >
            <MenuItem value="interaction">用户交互（点击/悬停）</MenuItem>
            <MenuItem value="data">数据变化</MenuItem>
            <MenuItem value="threshold">阈值越限</MenuItem>
            <MenuItem value="timer">定时触发</MenuItem>
          </TextField>
        </Box>

        {/* 第一部分：触发事件 */}
        <Box>
          <SectionLabel>触发条件</SectionLabel>
          <TextField
            select
            size="small"
            label="触发事件"
            value={sourceEvent}
            onChange={(e) => setSourceEvent(e.target.value)}
            fullWidth
            required
          >
            {events.map((event) => (
              <MenuItem key={event.name} value={event.name}>
                {event.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* 第二部分：动作类型（目标组件动作 / 调用接口） */}
        <Box>
          <SectionLabel>动作设置</SectionLabel>
          <TextField
            select
            size="small"
            label="动作类型"
            value={actionType}
            onChange={(e) => {
              const v = e.target.value as "target" | "callApi" | "sequence";
              setActionType(v);
              // 切到序列时，把当前单动作预填为第一步（引导式迁移）
              if (v === "sequence" && steps.length === 0 && binding.targetAction && binding.targetComponentId) {
                setSteps([{
                  targetComponentId: binding.targetComponentId,
                  targetAction: binding.targetAction,
                  params: binding.params ? { ...binding.params } : undefined,
                }]);
              }
            }}
            fullWidth
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="target">目标组件动作</MenuItem>
            <MenuItem value="callApi">调用接口（事件触发请求）</MenuItem>
            <MenuItem value="sequence">动作序列（依次执行多步）</MenuItem>
          </TextField>

          {actionType === "callApi" ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* 绑定源：本组件接口 / 自定义 URL */}
              <TextField
                select
                size="small"
                label="请求来源"
                value={bindCompApi ? "boundComp" : "custom"}
                onChange={(e) => {
                  const v = e.target.value === "boundComp";
                  setBindCompApi(v);
                  if (v && sourceCompApi) {
                    setApiUrl(sourceCompApi.url);
                    setApiMethod(sourceCompApi.method);
                  }
                }}
                fullWidth
                slotProps={{
                  select: {
                    native: false,
                  },
                }}
              >
                <MenuItem value="custom">自定义地址</MenuItem>
                <MenuItem value="boundComp" disabled={!sourceCompApi}>
                  {sourceCompApi
                    ? `绑定本组件接口 (${sourceComp?.name ?? "当前组件"})`
                    : "绑定本组件接口（未配置）"}
                </MenuItem>
              </TextField>

              {bindCompApi ? (
                // 绑定组件接口：只读摘要，url/method 跟随组件配置
                <Box sx={{ px: 0.5 }}>
                  <Typography variant="body2" sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-all", mb: 0.25 }}>
                    {sourceCompApi?.url ?? "该组件未配置接口"}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
                    {sourceCompApi?.method ?? "GET"}
                    {sourceCompApi && sourceCompApi.interval > 0 ? ` · 每 ${sourceCompApi.interval}s 轮询` : ""} ·
                    保存时取源组件接口地址，随编辑时刷新
                  </Typography>
                </Box>
              ) : (
                <>
                  <TextField
                    size="small"
                    label="接口地址"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.example.com/xxx"
                    fullWidth
                    required
                    helperText="事件触发时向该地址发起请求"
                  />
                  <TextField
                    select
                    size="small"
                    label="请求方式"
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value)}
                    fullWidth
                  >
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                  </TextField>
                </>
              )}
              <TextField
                size="small"
                label="请求体(JSON，可选)"
                value={apiBody}
                onChange={(e) => setApiBody(e.target.value)}
                placeholder='{"key": "value"}'
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", flex: 1 }}>
                  自动注入认证 Token
                </Typography>
                <input
                  type="checkbox"
                  style={{ accentColor: "#1976d2", width: 16, height: 16, cursor: "pointer" }}
                  checked={apiAuth}
                  onChange={(e) => setApiAuth(e.target.checked)}
                />
              </Box>

              {/* 请求头 */}
              <TextField
                size="small"
                label="自定义请求头(每行 K: V)"
                value={apiHeadersText}
                onChange={(e) => setApiHeadersText(e.target.value)}
                placeholder={'X-Custom-Key: value\nContent-Type: application/json'}
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                slotProps={{ htmlInput: { spellCheck: false } }}
                sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "0.78rem" } }}
              />

              {/* 响应路径 */}
              <TextField
                size="small"
                label="响应取值路径(可选)"
                value={apiResponsePath}
                onChange={(e) => setApiResponsePath(e.target.value)}
                placeholder="如 data.user / data.list"
                fullWidth
                helperText="留空则取整个响应体"
              />

              {/* 成功写入场景变量 */}
              <TextField
                select
                size="small"
                label="成功写入场景变量(可选)"
                value={apiWriteVar}
                onChange={(e) => setApiWriteVar(e.target.value)}
                fullWidth
                slotProps={{
                  select: { native: false },
                }}
              >
                {sceneVarNames.length === 0 && <MenuItem value="" disabled>暂无场景变量，可直接输入新名称</MenuItem>}
                {sceneVarNames.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </TextField>
              {sceneVarNames.length > 0 && (
                <TextField
                  size="small"
                  label="或输入新变量名"
                  value={apiWriteVar}
                  onChange={(e) => setApiWriteVar(e.target.value)}
                  placeholder="customVarName"
                  fullWidth
                />
              )}

              {/* 成功后刷新组件接口 */}
              <TextField
                select
                size="small"
                label="成功后刷新组件接口(可选)"
                value={apiRefreshSources}
                onChange={(e) => setApiRefreshSources(e.target.value as unknown as string[])}
                fullWidth
                slotProps={{ select: { native: false, multiple: true } }}
                helperText={apiTargetComponents.length === 0 ? "无可刷新（尚无组件绑定 API 数据源）" : "请求成功后重拉所选组件的接口数据"}
              >
                {apiTargetComponents.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
            </Box>
          ) : actionType === "sequence" ? (
            <ActionSequenceEditor
              steps={steps}
              components={components}
              allActions={allActions}
              groupedActions={groupedActions}
              onChange={setSteps}
            />
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Autocomplete<SceneComponent>
                size="small"
                options={components}
                value={targetComponent ?? null}
                getOptionLabel={(opt) => opt.name || opt.type}
                onChange={(_, newValue) => {
                  setTargetComponentId(newValue?.id ?? "");
                  setTargetAction(""); // 切换目标时重置动作
                  setParams({});
                }}
                renderInput={(inputProps) => (
                  <TextField
                    {...inputProps}
                    label="目标组件"
                    required
                    placeholder="搜索组件..."
                  />
                )}
                noOptionsText="无匹配组件"
                slotProps={{
                  paper: {
                    sx: { zIndex: 1500 },
                  },
                }}
              />

              <TextField
                select
                size="small"
                label="执行动作"
                value={targetAction}
                onChange={(e) => {
                  setTargetAction(e.target.value);
                  setParams({});
                }}
                fullWidth
                required
                disabled={!targetComponentId}
              >
                {groupedActions.map(([cat, list]) => (
                  <Fragment key={cat}>
                    <MenuItem disabled sx={{ opacity: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                        {cat}
                      </Typography>
                    </MenuItem>
                    {list.map((action) => (
                      <MenuItem key={action.name} value={action.name}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {action.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {action.description}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Fragment>
                ))}
              </TextField>
            </Box>
          )}
        </Box>

        {/* 第三部分：动作参数 */}
        {currentActionDef?.paramsSchema && currentActionDef.paramsSchema.length > 0 && (
          <Box>
            <SectionLabel>动作参数</SectionLabel>
            {targetAction === "navigateToScene" ? (
              <NavigateToSceneParamsEditor params={params} onChange={setParams} />
            ) : targetAction === "navigate" ? (
              <TextField
                size="small"
                label="URL 地址"
                value={(params.url as string) ?? ""}
                onChange={(e) => setParams({ ...params, url: e.target.value })}
                placeholder="https://..."
                fullWidth
                required
              />
            ) : targetAction === "setData" ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <TextField
                  size="small"
                  label="属性名"
                  value={(params.property as string) ?? ""}
                  onChange={(e) => setParams({ ...params, property: e.target.value })}
                  fullWidth
                  required
                />
                <TextField
                  size="small"
                  label="值"
                  value={(params.value as string) ?? ""}
                  onChange={(e) => setParams({ ...params, value: e.target.value })}
                  fullWidth
                  required
                />
              </Box>
            ) : (
              currentActionDef.paramsSchema.map((field, i) => (
                <TextField
                  key={field.key}
                  size="small"
                  label={field.label}
                  value={(params[field.key] as string) ?? ""}
                  onChange={(e) =>
                    setParams({ ...params, [field.key]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  required={field.required}
                  fullWidth
                  sx={i > 0 ? { mt: 1.5 } : undefined}
                />
              ))
            )}
          </Box>
        )}

        {/* 第四部分：条件表达式 */}
        <Box>
          <SectionLabel>条件表达式（可选）</SectionLabel>
          <TextField
            size="small"
            multiline
            minRows={1}
            maxRows={4}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="payload.value > 100"
            fullWidth
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: "monospace",
                fontSize: "0.8rem",
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            可用变量: payload（事件携带的数据）
          </Typography>
        </Box>

        {/* 第五部分：运行时控制 */}
        <Box>
          <SectionLabel>运行时控制</SectionLabel>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <TextField
              select
              size="small"
              label="启用状态"
              value={enabled ? '1' : '0'}
              onChange={(e) => setEnabled(e.target.value === '1')}
              sx={{ flex: '1 1 120px' }}
            >
              <MenuItem value="1">启用</MenuItem>
              <MenuItem value="0">禁用</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="节流(ms)"
              value={throttle}
              onChange={(e) => setThrottle(e.target.value)}
              placeholder="0"
              type="number"
              sx={{ flex: '1 1 100px' }}
            />
            <TextField
              size="small"
              label="防抖(ms)"
              value={debounce}
              onChange={(e) => setDebounce(e.target.value)}
              placeholder="0"
              type="number"
              sx={{ flex: '1 1 100px' }}
            />
          </Box>
        </Box>
      </DialogContent>

      {/* 底部按钮 */}
      <DialogActions
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Button onClick={onCancel} size="small" sx={{ textTransform: "none" }}>
          取消
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          size="small"
          disabled={!isValid}
          sx={{ textTransform: "none", minWidth: 72 }}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
