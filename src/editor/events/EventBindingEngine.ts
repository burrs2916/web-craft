import type { SceneEventDispatcher } from "../events/SceneEventDispatcher";
import type { EventBinding } from "../../types/editor";
import type { DataOrchestrator } from "../../datasource/orchestration/DataOrchestrator";
import { logger } from "../../utils/logger";
import type { ComponentTree } from "../utils/componentTree";
import { getParentChain } from "../utils/componentTree";

type EventBindingActionHandler = (targetComponentId: string, action: string, params?: Record<string, unknown>) => void;

/** 按点路径抽取嵌套字段（支持 a.b.c） */
function resolveField(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce((acc: unknown, key: string) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** 节流/防抖状态 */
interface ThrottleState {
  lastFired: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class EventBindingEngine {
  private bindings: Map<string, EventBinding> = new Map();
  private eventDispatcher: SceneEventDispatcher | null = null;
  private dataOrchestrator: DataOrchestrator | null = null;
  private actionHandler: EventBindingActionHandler | null = null;
  private unsubs: (() => void)[] = [];
  private handledEvents: Set<string> = new Set();

  /** 组件树映射（用于事件冒泡） */
  private componentTree: ComponentTree | null = null;

  /** 数据监听取消函数 */
  private dataUnsubs: Map<string, () => void> = new Map();
  /** 定时器 ID 映射 */
  private timerIds: Map<string, ReturnType<typeof setInterval>> = new Map();
  /** 节流/防抖状态 */
  private throttleStates: Map<string, ThrottleState> = new Map();
  /** 上次阈值状态（用于边沿检测） */
  private thresholdStates: Map<string, boolean> = new Map();

  /** 设置组件树（事件冒泡时需要遍历父链） */
  setComponentTree(tree: ComponentTree): void {
    this.componentTree = tree;
  }

  setEventDispatcher(dispatcher: SceneEventDispatcher): void {
    this.eventDispatcher = dispatcher;
    this.rebindAll();
  }

  setDataOrchestrator(orchestrator: DataOrchestrator): void {
    this.dataOrchestrator = orchestrator;
  }

  setActionHandler(handler: EventBindingActionHandler): void {
    this.actionHandler = handler;
  }

  registerBinding(binding: EventBinding): void {
    this.bindings.set(binding.id, binding);
    this.subscribeIfNeeded(binding);
  }

  unregisterBinding(bindingId: string): void {
    this.bindings.delete(bindingId);
    // 清理该绑定的数据监听和定时器
    for (const [key, unsub] of this.dataUnsubs) {
      if (key.startsWith(bindingId + ':')) {
        unsub();
        this.dataUnsubs.delete(key);
      }
    }
    const timerId = this.timerIds.get(bindingId);
    if (timerId) {
      clearInterval(timerId);
      this.timerIds.delete(bindingId);
    }
    const throttleState = this.throttleStates.get(bindingId);
    if (throttleState?.timer) clearTimeout(throttleState.timer);
    this.throttleStates.delete(bindingId);
    this.thresholdStates.delete(bindingId);
  }

  setupFromBindings(bindings: EventBinding[]): void {
    this.clear();
    for (const binding of bindings) {
      this.registerBinding(binding);
    }
  }

  clear(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.handledEvents.clear();
    this.bindings.clear();

    // 清理数据监听
    for (const [, unsub] of this.dataUnsubs) {
      unsub();
    }
    this.dataUnsubs.clear();

    // 清理定时器
    for (const [, timerId] of this.timerIds) {
      clearInterval(timerId);
    }
    this.timerIds.clear();

    // 清理防抖定时器（避免内存泄漏和孤立回调）
    for (const [, state] of this.throttleStates) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.throttleStates.clear();
    this.thresholdStates.clear();
  }

  private subscribeIfNeeded(binding: EventBinding): void {
    const triggerSource = binding.triggerSource ?? 'interaction';

    if (triggerSource === 'interaction') {
      this.subscribeInteraction(binding);
    } else if (triggerSource === 'data' || triggerSource === 'threshold') {
      this.subscribeDataDriven(binding);
    } else if (triggerSource === 'timer') {
      this.subscribeTimer(binding);
    }
  }

  /** 交互事件订阅 */
  private subscribeInteraction(binding: EventBinding): void {
    if (!this.eventDispatcher) return;

    const eventKey = `${binding.sourceComponentId}:${binding.sourceEvent}`;
    if (this.handledEvents.has(eventKey)) return;
    this.handledEvents.add(eventKey);

    const unsub = this.eventDispatcher.on(eventKey, (payload: unknown) => {
      this.handleEvent(binding.sourceComponentId, binding.sourceEvent, payload);
    });
    this.unsubs.push(unsub);

    if (binding.sourceComponentId === '*' || !binding.sourceComponentId) {
      const wildcardKey = `*:${binding.sourceEvent}`;
      if (this.handledEvents.has(wildcardKey)) return;
      this.handledEvents.add(wildcardKey);

      const wildcardUnsub = this.eventDispatcher.on(binding.sourceEvent, (payload: unknown) => {
        this.handleEvent('*', binding.sourceEvent, payload);
      });
      this.unsubs.push(wildcardUnsub);
    }
  }

  /** 数据驱动订阅（onDataChange / onThreshold） */
  private subscribeDataDriven(binding: EventBinding): void {
    const config = binding.triggerSource === 'threshold' ? binding.thresholdTrigger : binding.dataTrigger;
    if (!config) return;

    const sourceId = config.dataSourceId ?? config.componentId;
    if (!sourceId) return;

    const field = config.field ?? 'value';
    const unsubKey = `${binding.id}:${sourceId}:${field}`;

    // 通过 dataOrchestrator 或 editorStore 订阅数据变化
    const checkValue = (newValue: unknown) => {
      if (binding.enabled === false) return;

      if (binding.triggerSource === 'threshold') {
        this.handleThreshold(binding, newValue);
      } else {
        // onDataChange: 条件满足则触发（仅 DataTriggerConfig 有 condition 字段）
        const dataConfig = binding.dataTrigger;
        if (dataConfig?.condition) {
          try {
            const fn = new Function('payload', `"use strict"; return (${dataConfig.condition});`);
            if (!fn(newValue)) return;
          } catch {
            return;
          }
        }
        this.handleEvent(binding.sourceComponentId, binding.sourceEvent, { value: newValue });
      }
    };

    // 场景变量订阅：sourceId 以 "sceneVar:" 前缀标识
    if (sourceId.startsWith('sceneVar:')) {
      const varName = sourceId.slice('sceneVar:'.length);
      import("../../store/sceneVariableStore").then(({ subscribeSceneVariable }) => {
        const unsub = subscribeSceneVariable(varName, checkValue);
        this.dataUnsubs.set(unsubKey, unsub);
      }).catch(() => {
        logger.warn("EventBindingEngine", "Failed to subscribe to scene variable", { varName });
      });
      return;
    }

    // 订阅 componentStore / dataSource 变化
    // 通过 editorStore 的 component update 回调
    const unsub = this.subscribeToData(sourceId, field, checkValue);
    if (unsub) {
      this.dataUnsubs.set(unsubKey, unsub);
    }
  }

  /** 订阅数据变化（通过 editorStore 监听组件配置变化） */
  private subscribeToData(sourceId: string, field: string, callback: (value: unknown) => void): (() => void) | null {
    // 使用 cancelled 标志位处理竞态：清理函数可能在 import 完成前调用
    let cancelled = false;
    let storeUnsub: (() => void) | null = null;

    import("../../store/editorStore").then(({ useEditorStore }) => {
      // 如果在 import 期间已取消，立即退出
      if (cancelled) return;

      let lastValue: unknown = undefined;
      const check = () => {
        const state = useEditorStore.getState();
        const comp = state.components.find((c) => c.id === sourceId);
        if (!comp) return;
        const fieldValue = (comp.config as Record<string, unknown>)?.[field];
        if (fieldValue !== lastValue) {
          lastValue = fieldValue;
          callback(fieldValue);
        }
      };
      // 初始检查
      check();
      // 订阅变化
      storeUnsub = useEditorStore.subscribe(check);
      // 再次检查：如果在 subscribe 期间已取消，立即取消订阅
      if (cancelled) {
        storeUnsub();
        storeUnsub = null;
      }
    }).catch(() => {
      logger.warn("EventBindingEngine", "Failed to subscribe to data", { sourceId, field });
    });

    return () => {
      cancelled = true;
      storeUnsub?.();
    };
  }

  /** 定时触发订阅 */
  private subscribeTimer(binding: EventBinding): void {
    const config = binding.timerTrigger;
    if (!config) return;

    const startTimer = () => {
      const id = setInterval(() => {
        if (binding.enabled === false) return;
        this.handleEvent(binding.sourceComponentId, binding.sourceEvent, { timestamp: Date.now() });
        if (config.once) {
          clearInterval(id);
        }
      }, config.interval);
      this.timerIds.set(binding.id, id);
    };

    if (config.delay) {
      setTimeout(startTimer, config.delay);
    } else {
      startTimer();
    }
  }

  /** 阈值触发（带边沿检测） */
  private handleThreshold(binding: EventBinding, newValue: unknown): void {
    const config = binding.thresholdTrigger;
    if (!config) return;

    const numValue = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
    if (isNaN(numValue)) return;

    const threshold = typeof config.threshold === 'number' ? config.threshold : parseFloat(String(config.threshold));
    if (isNaN(threshold)) return;

    let exceeded = false;
    switch (config.operator) {
      case '>': exceeded = numValue > threshold; break;
      case '>=': exceeded = numValue >= threshold; break;
      case '<': exceeded = numValue < threshold; break;
      case '<=': exceeded = numValue <= threshold; break;
      case '==': exceeded = numValue === threshold; break;
      case '!=': exceeded = numValue !== threshold; break;
    }

    const prevState = this.thresholdStates.get(binding.id) ?? false;
    const edge = config.edge ?? 'both';

    let shouldFire = false;
    if (edge === 'rising' && exceeded && !prevState) shouldFire = true;
    else if (edge === 'falling' && !exceeded && prevState) shouldFire = true;
    else if (edge === 'both' && exceeded !== prevState) shouldFire = true;

    this.thresholdStates.set(binding.id, exceeded);

    if (shouldFire) {
      this.handleEvent(binding.sourceComponentId, binding.sourceEvent, {
        value: numValue,
        threshold,
        exceeded,
        operator: config.operator,
      });
    }
  }

  private handleEvent(sourceComponentId: string, sourceEvent: string, payload: unknown): void {
    // 事件冒泡：从目标组件开始，沿父链向上传播
    // 1. target 阶段：匹配 sourceComponentId === 目标组件
    // 2. bubble 阶段：匹配 sourceComponentId === 父组件（逐级向上）
    // 任意 binding 可通过 condition 返回 false 阻止继续冒泡（在 payload 中设置 _stopPropagation）

    // 构建冒泡链：[目标自身, 父1, 父2, ...根]
    const bubbleChain: string[] = [sourceComponentId];
    if (this.componentTree) {
      bubbleChain.push(...getParentChain(this.componentTree, sourceComponentId));
    }

    let propagationStopped = false;

    for (const currentComponentId of bubbleChain) {
      if (propagationStopped) break;

      for (const [, binding] of this.bindings) {
        const componentMatch = binding.sourceComponentId === currentComponentId
          || binding.sourceComponentId === '*'
          || !binding.sourceComponentId;
        const eventMatch = binding.sourceEvent === sourceEvent;

        if (!componentMatch || !eventMatch) {
          continue;
        }

        // 启用/禁用检查
        if (binding.enabled === false) continue;

        // 节流/防抖
        if (binding.throttle || binding.debounce) {
          if (!this.shouldFire(
            binding.id,
            binding.throttle,
            binding.debounce,
            // 防抖到期后执行动作
            () => this.executeAction(binding, payload),
          )) continue;
        }

        // 条件表达式（支持 _stopPropagation：condition 中可通过 payload._stopPropagation === true 停止冒泡）
        if (binding.condition) {
          try {
            const fn = new Function('payload', `"use strict"; return (${binding.condition});`);
            const result = fn(payload);
            if (!result) continue;
          } catch {
            continue;
          }
        }

        // 检查 payload 是否标记停止冒泡
        if (payload && typeof payload === 'object' && (payload as Record<string, unknown>)._stopPropagation === true) {
          propagationStopped = true;
        }

        this.executeAction(binding, payload);
      }
    }
  }

  /** 节流/防抖判断。防抖到期后通过 onDebounceFire 回调执行动作 */
  private shouldFire(
    bindingId: string,
    throttle?: number,
    debounce?: number,
    onDebounceFire?: () => void,
  ): boolean {
    const now = Date.now();
    let state = this.throttleStates.get(bindingId);

    if (!state) {
      state = { lastFired: 0, timer: null };
      this.throttleStates.set(bindingId, state);
    }

    // 防抖：清除已有定时器，重新计时，到期后触发动作
    if (debounce && debounce > 0) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state!.lastFired = Date.now();
        onDebounceFire?.();
      }, debounce);
      return false; // 本次不触发，等防抖结束
    }

    // 节流：间隔内不触发
    if (throttle && throttle > 0) {
      if (now - state.lastFired < throttle) return false;
      state.lastFired = now;
      return true;
    }

    return true;
  }

  private executeAction(binding: EventBinding, payload: unknown): void {
    // A3：动作序列优先（actions 非空时按序执行）；单动作（targetAction/params）路径保留兼容
    if (binding.actions && binding.actions.length > 0) {
      for (const step of binding.actions) {
        this.runActionStep(step.targetComponentId, step.targetAction, step.params, payload);
      }
      return;
    }
    this.runActionStep(binding.targetComponentId, binding.targetAction, binding.params, payload);
  }

  /** 执行单个动作步骤（A3 IR）：{{value}} 注入 + actionHandler 钩子 + 动作分发 */
  private runActionStep(targetComponentId: string, targetAction: string, rawParams: Record<string, unknown> | undefined, payload: unknown): void {

    // {{value}} 事件值通道（与发布端 scaffold/events.ts 同口径，两侧必须同步）：
    // 数据驱动 payload.value / 自定义事件 detail.value / 原生事件 target.value
    // 替换 params 里所有 "{{value}}" 占位符 —— 拖滑块/按开关下发命令时命令体携带当前值。
    let evVal: unknown;
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      const detail = p.detail as { value?: unknown } | undefined;
      if (detail && detail.value !== undefined) evVal = detail.value;
      else if (p.value !== undefined) evVal = p.value;
      else {
        const target = p.target as { value?: unknown } | undefined;
        if (target && target.value !== undefined) evVal = target.value;
      }
    }
    let params = rawParams;
    if (evVal !== undefined && params && JSON.stringify(params).includes('{{value}}')) {
      params = injectEventValue(params, evVal) as Record<string, unknown>;
    }

    if (this.actionHandler) {
      this.actionHandler(targetComponentId, targetAction, params);
      return;
    }

    if (!this.dataOrchestrator) return;

    switch (targetAction) {
      case 'highlight':
        this.dataOrchestrator.getBridge().updateComponent(targetComponentId, '__highlight', params?.value ?? true);
        break;
      case 'hide':
        this.dataOrchestrator.getBridge().updateComponent(targetComponentId, 'visible', false);
        break;
      case 'show':
        this.dataOrchestrator.getBridge().updateComponent(targetComponentId, 'visible', true);
        break;
      case 'toggleVisible': {
        // 需要读取当前组件状态来切换——通过 editorStore
        import("../../store/editorStore").then(({ useEditorStore }) => {
          const state = useEditorStore.getState();
          const comp = state.components.find((c) => c.id === targetComponentId);
          const currentVisible = comp?.visible !== false;
          this.dataOrchestrator!.getBridge().updateComponent(targetComponentId, 'visible', !currentVisible);
        });
        break;
      }
      case 'setData':
        if (params?.property && params?.value !== undefined) {
          this.dataOrchestrator.getBridge().updateComponent(targetComponentId, String(params.property), params.value);
        }
        break;
      case 'toggleData': {
        if (params?.property && params?.valueA !== undefined && params?.valueB !== undefined) {
          import("../../store/editorStore").then(({ useEditorStore }) => {
            const state = useEditorStore.getState();
            const comp = state.components.find((c) => c.id === targetComponentId);
            const currentVal = (comp?.config as Record<string, unknown>)?.[String(params.property)];
            const newVal = currentVal === params.valueA ? params.valueB : params.valueA;
            this.dataOrchestrator!.getBridge().updateComponent(targetComponentId, String(params.property), newVal);
          });
        }
        break;
      }
      case 'setVariable': {
         if (params?.variableName && params?.value !== undefined) {
           // 场景变量写入 Zustand store（持久化 + 跨窗口同步）
           import("../../store/sceneVariableStore").then(({ setSceneVariable }) => {
             setSceneVariable(String(params.variableName), params.value);
           }).catch(() => {});
         }
         break;
       }
      case 'switchView': {
        if (params?.viewId && typeof params.viewId === 'string') {
          import("../../store/editorStore").then(({ useEditorStore }) => {
            useEditorStore.getState().switchView(params.viewId as string);
          }).catch(() => {});
        }
        break;
      }
      case 'playSound': {
        const soundType = (params?.sound as string) ?? 'alarm';
        try {
          const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          if (soundType === 'alarm') {
            osc.frequency.value = 880;
            gain.gain.value = 0.3;
            osc.start();
            setTimeout(() => { osc.frequency.value = 660; }, 200);
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 600);
          } else if (soundType === 'beep') {
            osc.frequency.value = 1000;
            gain.gain.value = 0.2;
            osc.start();
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 150);
          } else if (soundType === 'success') {
            osc.frequency.value = 523;
            gain.gain.value = 0.2;
            osc.start();
            setTimeout(() => { osc.frequency.value = 659; }, 100);
            setTimeout(() => { osc.frequency.value = 784; }, 200);
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 400);
          } else if (soundType === 'error') {
            osc.frequency.value = 200;
            gain.gain.value = 0.3;
            osc.start();
            setTimeout(() => { osc.stop(); audioCtx.close(); }, 300);
          }
        } catch { /* AudioContext 不支持 */ }
        break;
      }
      case 'openDialog': {
        if (params?.sceneId && typeof params.sceneId === 'string') {
          import("../runtime/NavigationExecutor").then(({ NavigationExecutor }) => {
            NavigationExecutor.execute({
              sceneId: params.sceneId as string,
              openMode: 'dialog',
              dialogOptions: {
                width: (params.width as number) ?? 800,
                height: (params.height as number) ?? 600,
                title: (params.title as string) ?? '',
              },
            });
          });
        }
        break;
      }
      case 'closeDialog': {
        // 通过自定义事件通知对话框关闭
        window.dispatchEvent(new CustomEvent('webcraft:closeDialog'));
        break;
      }
      case 'callApi': {
        const url = params?.url as string;
        const method = (params?.method as string) ?? 'GET';
        const body = params?.body;
        const headers = (params?.headers as Record<string, string> | undefined) ?? {};
        const responsePath = (params?.responsePath as string | undefined) ?? '';
        const writeVar = (params?.onSuccessWriteVar as string | undefined) ?? '';
        const refreshSources = Array.isArray(params?.refreshSourceIds)
          ? (params.refreshSourceIds as string[]).filter(Boolean)
          : [];
        if (!url) break;

        // 动态拉取依赖，避免循环 import
        Promise.all([
          import("../../store/websiteAuthStore"),
          import("../../store/editorStore"),
        ]).then(([authStore, editorStore]) => {
          const authState = authStore.getWebsiteAuthState();
          const authHeaders = authState.isAuthenticated ? authState.buildAuthHeaders() : {};

          let fullUrl = url;
          if (!/^https?:\/\//i.test(url)) {
            const baseUrl = editorStore.useEditorStore.getState().apiConfig?.baseUrl ?? '';
            const baseNoSlash = baseUrl.replace(/\/+$/, '');
            if (baseNoSlash) {
              fullUrl = baseNoSlash + (url.startsWith('/') ? url : '/' + url);
            }
          }

          const requestHeaders: Record<string, string> = {
            ...authHeaders,
            ...headers,
          };

          fetch(fullUrl, {
            method,
            headers: requestHeaders,
            body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
          })
            .then(async (res) => {
              if (!res.ok) {
                logger.warn('EventBindingEngine', 'callApi failed', { url, status: res.status });
                return;
              }
              let data: unknown;
              const ctype = res.headers.get('content-type') || '';
              if (ctype.includes('application/json')) data = await res.json();
              else data = await res.text();

              // 响应落地：写场景变量 + 刷新组件接口
              const extracted = responsePath ? resolveField(data, responsePath) : data;
              if (writeVar) {
                import("../../store/sceneVariableStore").then(({ setSceneVariable }) => {
                  setSceneVariable(writeVar, extracted);
                });
              }
              if (refreshSources.length > 0 && this.dataOrchestrator) {
                refreshSources.forEach((sid) => {
                  this.dataOrchestrator!.refreshBindingsForSource(sid)
                    .catch((e) => logger.warn('EventBindingEngine', 'refresh source failed', { sid, error: e }));
                });
              }
            })
            .catch((e) => logger.warn('EventBindingEngine', 'callApi error', { url, error: e }));
        }).catch((e) => logger.warn('EventBindingEngine', 'callApi auth load failed', { error: e }));
        break;
      }
      case 'executeScript': {
        const script = params?.script as string;
        if (script) {
          try {
            const fn = new Function('payload', `"use strict"; ${script}`);
            fn(payload);
          } catch (e) {
            logger.warn('EventBindingEngine', 'executeScript failed', { error: e });
          }
        }
        break;
      }
      case 'navigate':
        if (params?.url && typeof params.url === 'string') {
          window.open(params.url, '_blank', 'noopener,noreferrer');
        }
        break;
      case 'navigateToScene':
        if (params?.sceneId && typeof params.sceneId === 'string') {
          import("../runtime/NavigationExecutor").then(({ NavigationExecutor }) => {
            NavigationExecutor.execute({
              sceneId: params.sceneId as string,
              viewId: params.viewId as string | undefined,
              openMode: (params.openMode as 'replace' | 'newWindow' | 'dialog') ?? 'replace',
              variables: params.variables as Record<string, unknown> | undefined,
              dialogOptions: params.dialogOptions as { width?: number; height?: number; title?: string } | undefined,
            });
          });
        }
        break;
      default:
        this.dataOrchestrator.getBridge().updateComponent(targetComponentId, targetAction, params ?? true);
        break;
    }
  }

  private rebindAll(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.handledEvents.clear();

    for (const [, binding] of this.bindings) {
      this.subscribeIfNeeded(binding);
    }
  }

  destroy(): void {
    this.clear();
    this.eventDispatcher = null;
    this.dataOrchestrator = null;
    this.actionHandler = null;
  }
}

/**
 * {{value}} 事件值注入（与发布端 scaffold/events.ts#injectEventValue 同口径，两侧必须同步）：
 * 字符串里的 "{{value}}" 占位符替换为事件值；对象/数组递归。其余类型原样返回。
 */
function injectEventValue(x: unknown, val: unknown): unknown {
  if (x === '{{value}}') return val;
  if (typeof x === 'string') return x.split('{{value}}').join(String(val));
  if (Array.isArray(x)) return x.map((v) => injectEventValue(v, val));
  if (x && typeof x === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(x as Record<string, unknown>)) {
      o[k] = injectEventValue((x as Record<string, unknown>)[k], val);
    }
    return o;
  }
  return x;
}
