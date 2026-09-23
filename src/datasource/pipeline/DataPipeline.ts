import { DataFrame, DataFrameFieldType } from "../dataframe";
import type { FetchRequestConfig } from "../adapters/types";
import { adapterRegistry } from "../adapters/registry";
import { dataSourceEventBus } from "../events";
import { safeRowTransform } from "../utils/safeEval";

export type DataTransform = (df: DataFrame) => Promise<DataFrame>;

export interface DataTransformConfig {
  type: 'filter' | 'map' | 'groupBy' | 'sort' | 'slice' | 'custom' | 'aggregate' | 'distinct' | 'join' | 'rename' | 'derive' | 'pivot';
  config: Record<string, any>;
}

export interface DataBindingConfig {
  componentId: string;
  fieldMapping: Record<string, string>;
  enabled?: boolean;
  refreshInterval?: number;
  label?: string;
}

export interface DataPipelineConfig {
  id: string;
  name: string;
  dataSourceId: string;
  dataSourceType: string;
  query: Record<string, any>;
  transforms?: DataTransformConfig[];
  bindings?: DataBindingConfig[];
  cacheConfig?: {
    ttl: number;
    enabled: boolean;
  };
  errorHandling?: {
    retries: number;
    retryDelay: number;
    fallbackToCache: boolean;
  };
  refreshInterval?: number;
}

export interface DataPipelineResult {
  success: boolean;
  dataFrame?: DataFrame;
  executionTime: number;
  error?: string;
  bindings?: {
    componentId: string;
    success: boolean;
    error?: string;
  }[];
}

export function adapterResultToDataFrame(
  raw: unknown,
  extracted: Record<string, unknown>,
  pipelineName: string,
  sourceId: string,
): DataFrame {
  const df = new DataFrame({
    name: pipelineName,
    source: sourceId,
    timestamp: Date.now(),
  });

  if (extracted && typeof extracted === 'object') {
    for (const [key, value] of Object.entries(extracted)) {
      if (Array.isArray(value)) {
        df.addField({
          name: key,
          type: inferFieldType(value[0]),
          values: value,
        });
      } else {
        df.addField({
          name: key,
          type: inferFieldType(value),
          values: [value],
        });
      }
    }
  }

  if (df.getRowCount() === 0 && raw !== undefined && raw !== null) {
    if (Array.isArray(raw)) {
      if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
        const sample = raw[0] as Record<string, unknown>;
        for (const key of Object.keys(sample)) {
          const values = raw.map((item: any) => item?.[key]);
          df.addField({
            name: key,
            type: inferFieldType(sample[key]),
            values,
          });
        }
      } else {
        df.addField({
          name: 'value',
          type: inferFieldType(raw[0]),
          values: raw,
        });
      }
    } else if (typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        df.addField({
          name: key,
          type: inferFieldType(value),
          values: [value],
        });
      }
    } else {
      df.addField({
        name: 'value',
        type: DataFrameFieldType.OBJECT,
        values: [raw],
      });
    }
  }

  return df;
}

function inferFieldType(value: unknown): DataFrameFieldType {
  if (value === null || value === undefined) return DataFrameFieldType.OBJECT;
  if (typeof value === 'number') return DataFrameFieldType.NUMBER;
  if (typeof value === 'string') return DataFrameFieldType.STRING;
  if (typeof value === 'boolean') return DataFrameFieldType.BOOLEAN;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('lat' in obj && 'lng' in obj) return DataFrameFieldType.GEO;
    if ('x' in obj && 'y' in obj) {
      return 'z' in obj ? DataFrameFieldType.POINT_3D : DataFrameFieldType.POINT;
    }
    return DataFrameFieldType.OBJECT;
  }
  return DataFrameFieldType.OBJECT;
}

export class ManagedDataPipeline {
  private config: DataPipelineConfig;
  private lastResult: DataPipelineResult | null = null;
  private executingPromise: Promise<DataPipelineResult> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private eventUnsubscribers: (() => void)[] = [];

  constructor(config: DataPipelineConfig) {
    this.config = config;
  }

  async execute(): Promise<DataPipelineResult> {
    if (this.executingPromise) {
      return this.executingPromise;
    }

    const startTime = Date.now();
    this.executingPromise = this._executeInternal();
    this.lastResult = await this.executingPromise;
    this.executingPromise = null;

    this.lastResult.executionTime = Date.now() - startTime;
    return this.lastResult;
  }

  private async _executeInternal(): Promise<DataPipelineResult> {
    const result: DataPipelineResult = {
      success: false,
      executionTime: 0,
      bindings: [],
    };

    try {
      let df = await this.fetchDataFromSource();
      df = await this.applyTransforms(df);
      result.bindings = await this.applyBindings(df);

      dataSourceEventBus.emit('data:updated', {
        sourceId: this.config.dataSourceId,
        data: df,
        extracted: this.extractDataForBindings(df),
        timestamp: new Date().toISOString(),
      });

      result.success = true;
      result.dataFrame = df;
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);

      if (this.config.errorHandling?.fallbackToCache && this.lastResult?.dataFrame) {
        console.warn(`[ManagedDataPipeline] ${this.config.name} 执行失败，使用缓存数据`, error);
        result.dataFrame = this.lastResult.dataFrame;
        result.success = true;
      } else {
        console.error(`[ManagedDataPipeline] ${this.config.name} 执行失败:`, error);
      }
    }

    return result;
  }

  private async fetchDataFromSource(): Promise<DataFrame> {
    const adapter = adapterRegistry.getAdapter(this.config.dataSourceType as any);
    const fetchConfig: FetchRequestConfig = {
      url: this.config.query.url ?? '',
      method: (this.config.query.method ?? 'GET') as any,
      headers: this.config.query.headers ?? {},
      params: this.config.query.params ?? [],
      timeout: this.config.query.timeout ?? 30000,
      responseMapping: this.config.query.responseMapping ?? [],
    };

    const adapterResult = await adapter.fetch(fetchConfig);

    return adapterResultToDataFrame(
      adapterResult.raw,
      adapterResult.extracted,
      this.config.name,
      this.config.dataSourceId,
    );
  }

  private async applyTransforms(df: DataFrame): Promise<DataFrame> {
    if (!this.config.transforms || this.config.transforms.length === 0) {
      return df;
    }

    let result = df;
    for (const transformConfig of this.config.transforms) {
      result = await this.applyTransform(result, transformConfig);
    }

    return result;
  }

  private async applyTransform(df: DataFrame, config: DataTransformConfig): Promise<DataFrame> {
    const { type, config: cfg } = config;

    switch (type) {
      case 'filter': {
        const { fieldName, operator, value } = cfg;
        return df.filter((row: any) => {
          const fieldValue = row[fieldName];
          switch (operator) {
            case 'equals': return fieldValue === value;
            case 'notEquals': return fieldValue !== value;
            case 'greaterThan': return fieldValue > value;
            case 'lessThan': return fieldValue < value;
            case 'greaterThanOrEqual': return fieldValue >= value;
            case 'lessThanOrEqual': return fieldValue <= value;
            case 'contains': return String(fieldValue).includes(value);
            case 'notContains': return !String(fieldValue).includes(value);
            case 'in': return Array.isArray(value) && value.includes(fieldValue);
            case 'notIn': return !Array.isArray(value) || !value.includes(fieldValue);
            default: return true;
          }
        });
      }

      case 'sort': {
        const { fieldName, descending = false } = cfg;
        return df.sort(fieldName, descending);
      }

      case 'slice': {
        const { startRow = 0, endRow } = cfg;
        return df.slice(startRow, endRow ?? df.getRowCount());
      }

      case 'groupBy': {
        const { fieldName } = cfg;
        const groups = df.groupBy(fieldName);
        return groups.values().next().value || df;
      }

      case 'map': {
        const { expression } = cfg;
        if (!expression) return df;
        const fn = safeRowTransform(expression);
        if (!fn) return df;
        return df.map((row: any) => {
          try {
            const result = fn(row);
            return { ...row, ...(typeof result === 'object' && result !== null ? result : {}) };
          } catch {
            return row;
          }
        });
      }

      case 'custom': {
        if (typeof cfg.fn === 'function') {
          return cfg.fn(df);
        }
        return df;
      }

      case 'aggregate': {
        const { fieldName, operation = 'sum', groupByField } = cfg;
        if (groupByField) {
          const groups = df.groupBy(groupByField);
          const resultDf = new DataFrame({ name: df.name + '_agg', source: df.source, timestamp: Date.now() });
          const groupNames: string[] = [];
          const aggValues: unknown[] = [];

          for (const [groupKey, groupDf] of groups) {
            groupNames.push(groupKey);
            const field = groupDf.getField(fieldName);
            if (field) {
              aggValues.push(this._aggregateValues(field.values, operation));
            } else {
              aggValues.push(null);
            }
          }

          resultDf.addField({ name: groupByField, type: DataFrameFieldType.STRING, values: groupNames });
          resultDf.addField({ name: `${fieldName}_${operation}`, type: DataFrameFieldType.NUMBER, values: aggValues as number[] });
          return resultDf;
        } else {
          const field = df.getField(fieldName);
          if (!field) return df;
          const resultDf = new DataFrame({ name: df.name + '_agg', source: df.source, timestamp: Date.now() });
          resultDf.addField({
            name: `${fieldName}_${operation}`,
            type: DataFrameFieldType.NUMBER,
            values: [this._aggregateValues(field.values, operation)] as number[],
          });
          return resultDf;
        }
      }

      case 'distinct': {
        const { fieldName } = cfg;
        const field = df.getField(fieldName);
        if (!field) return df;
        const seen = new Set<unknown>();
        const indices: number[] = [];
        for (let i = 0; i < field.values.length; i++) {
          const val = field.values[i];
          const key = typeof val === 'object' ? JSON.stringify(val) : val;
          if (!seen.has(key)) {
            seen.add(key);
            indices.push(i);
          }
        }
        const idxSet = new Set(indices);
        return df.filter((_row: any, idx: number) => idxSet.has(idx));
      }

      case 'join': {
        const { rightData, leftKey, rightKey, joinType = 'inner' } = cfg;
        if (!rightData || !Array.isArray(rightData)) return df;
        const rightMap = new Map<unknown, any>();
        for (const item of rightData) {
          const key = item[rightKey];
          if (key !== undefined) rightMap.set(key, item);
        }

        return df.map((row: any) => {
          const key = row[leftKey];
          const rightRow = rightMap.get(key);
          if (rightRow) {
            return { ...row, ...rightRow };
          }
          if (joinType === 'left') return row;
          return null;
        }).filter((row: any) => row !== null);
      }

      case 'rename': {
        const { mapping } = cfg;
        if (!mapping || typeof mapping !== 'object') return df;
        return df.map((row: any) => {
          const newRow: any = {};
          for (const [key, value] of Object.entries(row)) {
            newRow[mapping[key] ?? key] = value;
          }
          return newRow;
        });
      }

      case 'derive': {
        const { fieldName, expression } = cfg;
        if (!fieldName || !expression) return df;
        const fn = safeRowTransform(expression);
        if (!fn) return df;
        return df.map((row: any) => {
          try {
            return { ...row, [fieldName]: fn(row) };
          } catch {
            return row;
          }
        });
      }

      case 'pivot': {
        const { rowField, colField, valueField, aggFunc = 'sum' } = cfg;
        if (!rowField || !colField || !valueField) return df;

        const pivotMap = new Map<string, Map<string, unknown[]>>();
        const colSet = new Set<string>();

        for (const row of df.getRows()) {
          const rowKey = String(row[rowField] ?? '');
          const colKey = String(row[colField] ?? '');
          const val = row[valueField];
          colSet.add(colKey);

          if (!pivotMap.has(rowKey)) pivotMap.set(rowKey, new Map());
          const colMap = pivotMap.get(rowKey)!;
          if (!colMap.has(colKey)) colMap.set(colKey, []);
          colMap.get(colKey)!.push(val);
        }

        const resultDf = new DataFrame({ name: df.name + '_pivot', source: df.source, timestamp: Date.now() });
        const rowKeys = Array.from(pivotMap.keys());
        const colKeys = Array.from(colSet);

        resultDf.addField({ name: rowField, type: DataFrameFieldType.STRING, values: rowKeys });
        for (const col of colKeys) {
          const values = rowKeys.map(rk => {
            const vals = pivotMap.get(rk)?.get(col) || [];
            return this._aggregateValues(vals, aggFunc);
          });
          resultDf.addField({ name: col, type: DataFrameFieldType.NUMBER, values: values as number[] });
        }

        return resultDf;
      }

      default:
        return df;
    }
  }

  private async applyBindings(df: DataFrame): Promise<DataPipelineResult['bindings']> {
    const results: DataPipelineResult['bindings'] = [];

    if (!this.config.bindings) {
      return results;
    }

    for (const binding of this.config.bindings) {
      if (binding.enabled === false) continue;

      try {
        const componentData: Record<string, unknown> = {};
        for (const [dfField, componentProp] of Object.entries(binding.fieldMapping)) {
          const field = df.getField(dfField);
          if (field) {
            componentData[componentProp] = field.values.length === 1 ? field.values[0] : field.values;
          }
        }

        dataSourceEventBus.emit('data:updated', {
          sourceId: this.config.dataSourceId,
          data: df,
          extracted: { [binding.componentId]: componentData },
          timestamp: new Date().toISOString(),
        });

        dataSourceEventBus.emit('binding:added', {
          sourceId: this.config.dataSourceId,
          componentId: binding.componentId,
          data: componentData,
        });

        results.push({
          componentId: binding.componentId,
          success: true,
        });
      } catch (error) {
        results.push({
          componentId: binding.componentId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private extractDataForBindings(df: DataFrame): Record<string, unknown> {
    const extracted: Record<string, unknown> = {};

    if (!this.config.bindings) {
      return extracted;
    }

    for (const binding of this.config.bindings) {
      if (binding.enabled === false) continue;

      const componentData: Record<string, unknown> = {};
      for (const [dfField, componentProp] of Object.entries(binding.fieldMapping)) {
        const field = df.getField(dfField);
        if (field) {
          componentData[componentProp] = field.values;
        }
      }

      extracted[binding.componentId] = componentData;
    }

    return extracted;
  }

  private _aggregateValues(values: unknown[], operation: string): number | null {
    const nums = values
      .filter(v => v !== null && v !== undefined && typeof v === 'number') as number[];
    if (nums.length === 0) return null;

    switch (operation) {
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
      case 'min': return Math.min(...nums);
      case 'max': return Math.max(...nums);
      case 'count': return nums.length;
      case 'first': return nums[0];
      case 'last': return nums[nums.length - 1];
      default: return nums.reduce((a, b) => a + b, 0);
    }
  }

  startAutoRefresh(): void {
    if (this.refreshTimer) return;

    const interval = this.config.refreshInterval || 5000;
    this.refreshTimer = setInterval(() => {
      this.execute().catch((error) => {
        console.error(`[ManagedDataPipeline] 自动刷新失败:`, error);
      });
    }, interval);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getLastResult(): DataPipelineResult | null {
    return this.lastResult;
  }

  getConfig(): DataPipelineConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DataPipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  destroy(): void {
    this.stopAutoRefresh();
    for (const unsub of this.eventUnsubscribers) {
      unsub();
    }
    this.eventUnsubscribers = [];
  }
}

export class DataPipelineManager {
  private pipelines: Map<string, ManagedDataPipeline> = new Map();

  createPipeline(config: DataPipelineConfig): ManagedDataPipeline {
    if (this.pipelines.has(config.id)) {
      throw new Error(`管道 ${config.id} 已存在`);
    }

    const pipeline = new ManagedDataPipeline(config);
    this.pipelines.set(config.id, pipeline);
    return pipeline;
  }

  getPipeline(id: string): ManagedDataPipeline | undefined {
    return this.pipelines.get(id);
  }

  getAllPipelines(): ManagedDataPipeline[] {
    return Array.from(this.pipelines.values());
  }

  removePipeline(id: string): boolean {
    const pipeline = this.pipelines.get(id);
    if (pipeline) {
      pipeline.destroy();
      this.pipelines.delete(id);
      return true;
    }
    return false;
  }

  async executePipeline(id: string): Promise<DataPipelineResult | null> {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) return null;
    return pipeline.execute();
  }

  async executeAll(): Promise<DataPipelineResult[]> {
    const results: DataPipelineResult[] = [];
    for (const pipeline of this.pipelines.values()) {
      const result = await pipeline.execute();
      results.push(result);
    }
    return results;
  }

  destroyAll(): void {
    for (const pipeline of this.pipelines.values()) {
      pipeline.destroy();
    }
    this.pipelines.clear();
  }
}

export const dataPipelineManager = new DataPipelineManager();
