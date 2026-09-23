import { DataFrame } from "../dataframe";
import { dataSourceEventBus } from "../events";

export enum BindingTargetType {
  COMPONENT = 'component',
  DATASOURCE = 'datasource',
  VARIABLE = 'variable',
  EXTERNAL = 'external',
}

export enum BindingType {
  PROPERTY = 'property',
  EVENT = 'event',
  TWO_WAY = 'two-way',
  CONDITION = 'condition',
  AGGREGATE = 'aggregate',
}

export enum BindingAction {
  SET = 'set',
  UPDATE = 'update',
  APPEND = 'append',
  REMOVE = 'remove',
  HIGHLIGHT = 'highlight',
  HIDE = 'hide',
  SHOW = 'show',
  NAVIGATE = 'navigate',
  CUSTOM = 'custom',
}

export interface BindingRule {
  id: string;
  name: string;
  type: BindingType;
  sourceId: string;
  sourceField: string;
  targetType: BindingTargetType;
  targetId: string;
  targetProperty: string;
  action: BindingAction;
  transform?: (value: any) => any;
  condition?: (value: any, sourceData: any) => boolean;
  valueMap?: Record<string, any>;
  bidirectional?: boolean;
  debounce?: number;
  throttle?: number;
  enabled?: boolean;
  priority?: number;
}

export interface BindingEvent {
  type: 'bound' | 'unbound' | 'updated' | 'error';
  ruleId: string;
  oldValue?: any;
  newValue?: any;
  error?: string;
  timestamp: number;
}

type BindingActionHandler = (targetId: string, property: string, value: any) => void;

export interface BindingActionExecutor {
  set(targetId: string, property: string, value: any): void;
  update(targetId: string, property: string, value: any): void;
  append(targetId: string, property: string, value: any): void;
  remove(targetId: string, property: string, value: any): void;
  highlight(targetId: string, property: string, value: any): void;
  hide(targetId: string): void;
  show(targetId: string): void;
  navigate(targetId: string, property: string, value: any): void;
  custom(targetId: string, property: string, value: any): void;
}

export class DataBindingEngine {
  private rules: Map<string, BindingRule> = new Map();
  private boundValues: Map<string, any> = new Map();
  private listeners: Map<string, Set<(event: BindingEvent) => void>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastThrottleTime: Map<string, number> = new Map();
  private eventUnsubscribers: Map<string, () => void> = new Map();
  private actionHandlers: Map<BindingAction, BindingActionHandler> = new Map();
  private executor: BindingActionExecutor | null = null;

  constructor() {
    this.registerDefaultActionHandlers();
  }

  setActionExecutor(executor: BindingActionExecutor): void {
    this.executor = executor;
    this.registerDefaultActionHandlers();
  }

  private registerDefaultActionHandlers(): void {
    this.actionHandlers.set(BindingAction.SET, (targetId, property, value) => {
      if (this.executor) {
        this.executor.set(targetId, property, value);
      } else {
        this.boundValues.set(`__direct_set__${targetId}.${property}`, value);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property,
        value,
      });
    });

    this.actionHandlers.set(BindingAction.UPDATE, (targetId, property, value) => {
      if (this.executor) {
        this.executor.update(targetId, property, value);
      } else {
        this.boundValues.set(`__direct_update__${targetId}.${property}`, value);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property,
        value,
      });
    });

    this.actionHandlers.set(BindingAction.HIGHLIGHT, (targetId, property, value) => {
      if (this.executor) {
        this.executor.highlight(targetId, property, value);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property,
        value,
      });
    });

    this.actionHandlers.set(BindingAction.HIDE, (targetId) => {
      if (this.executor) {
        this.executor.hide(targetId);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property: 'visible',
        value: false,
      });
    });

    this.actionHandlers.set(BindingAction.SHOW, (targetId) => {
      if (this.executor) {
        this.executor.show(targetId);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property: 'visible',
        value: true,
      });
    });

    this.actionHandlers.set(BindingAction.APPEND, (targetId, property, value) => {
      if (this.executor) {
        this.executor.append(targetId, property, value);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property,
        value,
      });
    });

    this.actionHandlers.set(BindingAction.REMOVE, (targetId, property, value) => {
      if (this.executor) {
        this.executor.remove(targetId, property, value);
      }
      dataSourceEventBus.emit('binding:added', {
        sourceId: '__binding_engine__',
        componentId: targetId,
        property,
        value,
      });
    });

    this.actionHandlers.set(BindingAction.NAVIGATE, (targetId, property, value) => {
      if (this.executor) {
        this.executor.navigate(targetId, property, value);
      } else if (typeof window !== 'undefined' && typeof value === 'string') {
        window.open(value, '_blank', 'noopener,noreferrer');
      }
    });

    this.actionHandlers.set(BindingAction.CUSTOM, (targetId, property, value) => {
      if (this.executor) {
        this.executor.custom(targetId, property, value);
      }
    });
  }

  registerActionHandler(action: BindingAction, handler: BindingActionHandler): void {
    this.actionHandlers.set(action, handler);
  }

  registerRule(rule: BindingRule): void {
    if (this.rules.has(rule.id)) {
      this.unregisterRule(rule.id);
    }

    this.rules.set(rule.id, rule);
    this.subscribeToDataSource(rule);
  }

  unregisterRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    const unsub = this.eventUnsubscribers.get(ruleId);
    if (unsub) {
      unsub();
      this.eventUnsubscribers.delete(ruleId);
    }

    this.rules.delete(ruleId);
    this.boundValues.delete(ruleId);

    if (this.debounceTimers.has(ruleId)) {
      clearTimeout(this.debounceTimers.get(ruleId)!);
      this.debounceTimers.delete(ruleId);
    }

    this.emitBindingEvent(ruleId, {
      type: 'unbound',
      ruleId,
      timestamp: Date.now(),
    });

    return true;
  }

  getRule(ruleId: string): BindingRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): BindingRule[] {
    return Array.from(this.rules.values());
  }

  getRulesByTarget(targetId: string): BindingRule[] {
    return Array.from(this.rules.values()).filter((rule) => rule.targetId === targetId);
  }

  getRulesBySource(sourceId: string): BindingRule[] {
    return Array.from(this.rules.values()).filter((rule) => rule.sourceId === sourceId);
  }

  private subscribeToDataSource(rule: BindingRule): void {
    const handler = (payload: { sourceId: string; data: unknown }) => {
      if (payload.sourceId === rule.sourceId && rule.enabled !== false) {
        this.applyBinding(rule, payload.data);
      }
    };

    const unsub = dataSourceEventBus.on('data:updated', handler);
    this.eventUnsubscribers.set(rule.id, unsub);
  }

  private async applyBinding(rule: BindingRule, sourceData: DataFrame | any): Promise<void> {
    try {
      if (rule.debounce) {
        this.applyWithDebounce(rule, sourceData);
        return;
      }

      if (rule.throttle) {
        if (!this.checkThrottle(rule.id, rule.throttle)) {
          return;
        }
      }

      const sourceValue = this.getSourceValue(rule, sourceData);

      if (rule.condition && !rule.condition(sourceValue, sourceData)) {
        return;
      }

      let targetValue = sourceValue;
      if (rule.transform) {
        targetValue = rule.transform(sourceValue);
      }

      if (rule.valueMap && sourceValue in rule.valueMap) {
        targetValue = rule.valueMap[sourceValue];
      }

      const oldValue = this.boundValues.get(rule.id);

      await this.executeBindingAction(rule, targetValue);

      this.boundValues.set(rule.id, targetValue);

      this.emitBindingEvent(rule.id, {
        type: 'updated',
        ruleId: rule.id,
        oldValue,
        newValue: targetValue,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`[BindingEngine] 应用绑定规则失败: ${rule.id}`, error);
      this.emitBindingEvent(rule.id, {
        type: 'error',
        ruleId: rule.id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      });
    }
  }

  private applyWithDebounce(rule: BindingRule, sourceData: any): void {
    if (this.debounceTimers.has(rule.id)) {
      clearTimeout(this.debounceTimers.get(rule.id)!);
    }

    const timer = setTimeout(() => {
      this.applyBinding(rule, sourceData);
      this.debounceTimers.delete(rule.id);
    }, rule.debounce);

    this.debounceTimers.set(rule.id, timer);
  }

  private checkThrottle(ruleId: string, throttleMs: number): boolean {
    const lastTime = this.lastThrottleTime.get(ruleId) || 0;
    const now = Date.now();

    if (now - lastTime >= throttleMs) {
      this.lastThrottleTime.set(ruleId, now);
      return true;
    }

    return false;
  }

  private getSourceValue(rule: BindingRule, sourceData: any): any {
    if (sourceData instanceof DataFrame) {
      const field = sourceData.getField(rule.sourceField);
      return field ? field.values : undefined;
    }

    const parts = rule.sourceField.split('.');
    let value = sourceData;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private async executeBindingAction(rule: BindingRule, value: any): Promise<void> {
    const handler = this.actionHandlers.get(rule.action);
    if (handler) {
      handler(rule.targetId, rule.targetProperty, value);
    }
  }

  onBindingEvent(ruleId: string, listener: (event: BindingEvent) => void): () => void {
    if (!this.listeners.has(ruleId)) {
      this.listeners.set(ruleId, new Set());
    }

    const set = this.listeners.get(ruleId)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(ruleId);
      }
    };
  }

  private emitBindingEvent(ruleId: string, event: BindingEvent): void {
    const listeners = this.listeners.get(ruleId);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[BindingEngine] 绑定事件处理器错误:`, error);
        }
      });
    }
  }

  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  clearAllRules(): void {
    for (const ruleId of Array.from(this.rules.keys())) {
      this.unregisterRule(ruleId);
    }
  }

  getBoundValue(ruleId: string): any {
    return this.boundValues.get(ruleId);
  }

  setBoundValue(ruleId: string, value: any): void {
    this.boundValues.set(ruleId, value);
  }

  destroy(): void {
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();

    for (const unsub of this.eventUnsubscribers.values()) {
      unsub();
    }
    this.eventUnsubscribers.clear();

    this.rules.clear();
    this.boundValues.clear();
    this.listeners.clear();
    this.lastThrottleTime.clear();
    this.actionHandlers.clear();
  }
}

export const dataBindingEngine = new DataBindingEngine();

export function createPropertyBinding(
  ruleId: string,
  sourceId: string,
  sourceField: string,
  targetId: string,
  targetProperty: string,
  options?: Partial<BindingRule>,
): BindingRule {
  return {
    id: ruleId,
    name: `${sourceId}.${sourceField} -> ${targetId}.${targetProperty}`,
    type: BindingType.PROPERTY,
    sourceId,
    sourceField,
    targetType: BindingTargetType.COMPONENT,
    targetId,
    targetProperty,
    action: BindingAction.SET,
    enabled: true,
    priority: 0,
    ...options,
  };
}

export function createConditionalBinding(
  ruleId: string,
  sourceId: string,
  sourceField: string,
  condition: (value: any, sourceData: any) => boolean,
  targetId: string,
  action: BindingAction,
  options?: Partial<BindingRule>,
): BindingRule {
  return {
    id: ruleId,
    name: `${sourceId}.${sourceField} -> ${targetId} (conditional)`,
    type: BindingType.CONDITION,
    sourceId,
    sourceField,
    targetType: BindingTargetType.COMPONENT,
    targetId,
    targetProperty: 'state',
    action,
    condition,
    enabled: true,
    priority: 0,
    ...options,
  };
}
