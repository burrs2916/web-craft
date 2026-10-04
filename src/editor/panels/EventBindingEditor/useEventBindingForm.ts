import { useEffect, useMemo, useState } from "react";
import type { EventBinding, EventActionStep, SceneComponent } from "../../../types/editor";
import { useEditorStore } from "../../../store/editorStore";
import { useSceneVariableStore } from "../../../store/sceneVariableStore";
import {
  getEventsForComponent,
  getActionsForTarget,
  BUILTIN_ACTIONS,
  type ActionInfo,
} from "../../utils/eventActionRegistry";

// 动作按类别分组，避免 15 项平铺难选（按钮点击配置更清晰）
const ACTION_CATEGORY: Record<string, string> = {
  navigateToScene: "导航", navigate: "导航",
  highlight: "显示控制", hide: "显示控制", show: "显示控制", toggleVisible: "显示控制",
  setData: "数据", toggleData: "数据", setVariable: "数据", callApi: "接口",
  switchView: "视图", playSound: "交互", openDialog: "交互", closeDialog: "交互",
  executeScript: "脚本",
};

export interface EventBindingForm {
  components: SceneComponent[];
  sourceComponent: SceneComponent | undefined;
  sourceComp: SceneComponent | undefined;
  sourceCompApi: { url: string; method: string; interval: number } | null;
  events: ReturnType<typeof getEventsForComponent>;
  targetComponent: SceneComponent | undefined;
  allActions: ActionInfo[];
  groupedActions: [string, ActionInfo[]][];
  currentActionDef: ActionInfo | undefined;
  apiTargetComponents: SceneComponent[];
  sceneVarNames: string[];

  sourceEvent: string;
  setSourceEvent: (v: string) => void;
  targetComponentId: string;
  setTargetComponentId: (v: string) => void;
  targetAction: string;
  setTargetAction: (v: string) => void;
  params: Record<string, unknown>;
  setParams: (v: Record<string, unknown>) => void;
  condition: string;
  setCondition: (v: string) => void;
  triggerSource: string;
  setTriggerSource: (v: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  throttle: string;
  setThrottle: (v: string) => void;
  debounce: string;
  setDebounce: (v: string) => void;
  actionType: "target" | "callApi" | "sequence";
  setActionType: (v: "target" | "callApi" | "sequence") => void;
  steps: EventActionStep[];
  setSteps: (v: EventActionStep[]) => void;
  apiUrl: string;
  setApiUrl: (v: string) => void;
  apiMethod: string;
  setApiMethod: (v: string) => void;
  apiAuth: boolean;
  setApiAuth: (v: boolean) => void;
  apiBody: string;
  setApiBody: (v: string) => void;
  bindCompApi: boolean;
  setBindCompApi: (v: boolean) => void;
  apiHeadersText: string;
  setApiHeadersText: (v: string) => void;
  apiResponsePath: string;
  setApiResponsePath: (v: string) => void;
  apiWriteVar: string;
  setApiWriteVar: (v: string) => void;
  apiRefreshSources: string[];
  setApiRefreshSources: (v: string[]) => void;

  handleSave: () => void;
  isValid: boolean;
}

/** 事件绑定编辑表单的状态与业务逻辑（供 EventBindingEditor 及其分区组件共用）。 */
export function useEventBindingForm(
  binding: EventBinding,
  onSave: (binding: EventBinding) => void,
): EventBindingForm {
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

  return {
    components,
    sourceComponent,
    sourceComp,
    sourceCompApi,
    events,
    targetComponent,
    allActions,
    groupedActions,
    currentActionDef,
    apiTargetComponents,
    sceneVarNames,
    sourceEvent, setSourceEvent,
    targetComponentId, setTargetComponentId,
    targetAction, setTargetAction,
    params, setParams,
    condition, setCondition,
    triggerSource, setTriggerSource,
    enabled, setEnabled,
    throttle, setThrottle,
    debounce, setDebounce,
    actionType, setActionType,
    steps, setSteps,
    apiUrl, setApiUrl,
    apiMethod, setApiMethod,
    apiAuth, setApiAuth,
    apiBody, setApiBody,
    bindCompApi, setBindCompApi,
    apiHeadersText, setApiHeadersText,
    apiResponsePath, setApiResponsePath,
    apiWriteVar, setApiWriteVar,
    apiRefreshSources, setApiRefreshSources,
    handleSave,
    isValid,
  };
}