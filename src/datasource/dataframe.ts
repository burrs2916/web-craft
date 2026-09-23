/**
 * 统一的数据帧格式（DataFrame）
 * 
 * 所有数据源和组件都通过这个统一格式进行数据交互，确保数据流的一致性。
 * 参考：Grafana DataFrame 的设计
 * 
 * @example
 * ```ts
 * // 来自HTTP数据源的数据帧
 * const df = DataFrame.create({
 *   name: 'metrics',
 *   source: 'http:///api/metrics',
 *   fields: [
 *     { name: 'timestamp', type: 'time', values: [1000, 2000, 3000] },
 *     { name: 'temperature', type: 'number', values: [20, 22, 25] },
 *     { name: 'location', type: 'geo', values: [{lat: 0, lng: 0}, ...] }
 *   ]
 * });
 * 
 * // 数据转换
 * df.addField('anomaly', 'boolean', values.map(v => v > 23));
 * ```
 */

/** 数据类型定义 */
export enum DataFrameFieldType {
  // 基础类型
  NUMBER = 'number',
  STRING = 'string',
  BOOLEAN = 'boolean',
  
  // 时间类型
  TIME = 'time',          // Unix timestamp in ms
  DURATION = 'duration',  // Duration in ms
  
  // 空间类型
  GEO = 'geo',                      // {lat: number, lng: number}
  POINT = 'point',                  // {x: number, y: number, z?: number}
  POINT_3D = 'point3d',             // {x: number, y: number, z: number}
  GEOMETRY = 'geometry',            // WKT or GeoJSON
  
  // 复杂类型
  OBJECT = 'object',                // 任意JSON对象
  ARRAY = 'array',                  // 任意数组
  
  // 特殊类型
  JSON = 'json',                    // JSON字符串或对象
  NESTED = 'nested',                // 嵌套DataFrame
}

/** 数据类型映射到TypeScript类型 */
export interface DataFrameFieldTypeMap {
  [DataFrameFieldType.NUMBER]: number;
  [DataFrameFieldType.STRING]: string;
  [DataFrameFieldType.BOOLEAN]: boolean;
  [DataFrameFieldType.TIME]: number;
  [DataFrameFieldType.DURATION]: number;
  [DataFrameFieldType.GEO]: { lat: number; lng: number };
  [DataFrameFieldType.POINT]: { x: number; y: number; z?: number };
  [DataFrameFieldType.POINT_3D]: { x: number; y: number; z: number };
  [DataFrameFieldType.GEOMETRY]: string | Record<string, any>;
  [DataFrameFieldType.OBJECT]: Record<string, any>;
  [DataFrameFieldType.ARRAY]: any[];
  [DataFrameFieldType.JSON]: any;
  [DataFrameFieldType.NESTED]: DataFrame;
}

/** 数据字段配置 */
export interface DataFrameField {
  name: string;
  type: DataFrameFieldType;
  values: any[];
  
  /** 字段的显示标签 */
  label?: string;
  
  /** 字段的单位 */
  unit?: string;
  
  /** 字段的描述 */
  description?: string;
  
  /** 字段的最小值 */
  min?: number;
  
  /** 字段的最大值 */
  max?: number;
  
  /** 字段是否可见 */
  hidden?: boolean;
  
  /** 自定义元数据 */
  metadata?: Record<string, any>;
  
  /** 字段的配置 */
  config?: {
    /** 数值精度 */
    decimals?: number;
    /** 格式化模板 */
    format?: string;
    /** 颜色映射规则 */
    colorBy?: 'value' | 'series';
    /** 自定义颜色 */
    color?: string;
    [key: string]: any;
  };
}

/** 数据帧配置 */
export interface DataFrameConfig {
  /** 数据帧的唯一标识 */
  id?: string;
  
  /** 数据帧的名称 */
  name: string;
  
  /** 数据来源 */
  source: string;
  
  /** 获取数据时间戳 */
  timestamp: number;
  
  /** 数据有效期（毫秒），为0表示永远有效 */
  ttl?: number;
  
  /** 是否是缓存数据 */
  cached?: boolean;
  
  /** 元数据 */
  meta?: {
    /** 行数 */
    rowCount?: number;
    /** 数据源类型 */
    sourceType?: string;
    /** 查询信息 */
    query?: string;
    /** 其他自定义元数据 */
    [key: string]: any;
  };
}

/**
 * 统一的数据帧类
 * 
 * DataFrame 是所有数据源和组件之间的通用数据格式。
 * 它提供了统一的接口来访问、转换和共享数据。
 */
export class DataFrame {
  id: string;
  name: string;
  source: string;
  timestamp: number;
  ttl: number;
  cached: boolean;
  meta: Record<string, any>;
  
  private fields: Map<string, DataFrameField> = new Map();
  private fieldOrder: string[] = [];

  constructor(config: DataFrameConfig) {
    this.id = config.id || `df_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.name = config.name;
    this.source = config.source;
    this.timestamp = config.timestamp;
    this.ttl = config.ttl || 0;
    this.cached = config.cached || false;
    this.meta = config.meta || {};
  }

  /**
   * 添加字段
   */
  addField(field: DataFrameField): void {
    if (this.fields.has(field.name)) {
      throw new Error(`字段 "${field.name}" 已存在`);
    }
    
    if (field.values.length === 0) {
      console.warn(`字段 "${field.name}" 的值数组为空`);
    }
    
    this.fields.set(field.name, field);
    this.fieldOrder.push(field.name);
  }

  /**
   * 获取字段
   */
  getField(name: string): DataFrameField | undefined {
    return this.fields.get(name);
  }

  /**
   * 获取所有字段
   */
  getFields(): DataFrameField[] {
    return this.fieldOrder.map(name => this.fields.get(name)!);
  }

  /**
   * 获取字段名列表
   */
  getFieldNames(): string[] {
    return [...this.fieldOrder];
  }

  /**
   * 检查字段是否存在
   */
  hasField(name: string): boolean {
    return this.fields.has(name);
  }

  /**
   * 移除字段
   */
  removeField(name: string): boolean {
    if (!this.fields.has(name)) {
      return false;
    }
    this.fields.delete(name);
    this.fieldOrder = this.fieldOrder.filter(n => n !== name);
    return true;
  }

  /**
   * 更新字段值
   */
  updateField(name: string, values: any[]): void {
    const field = this.fields.get(name);
    if (!field) {
      throw new Error(`字段 "${name}" 不存在`);
    }
    field.values = values;
  }

  /**
   * 获取数据行数
   */
  getRowCount(): number {
    const fields = this.getFields();
    if (fields.length === 0) return 0;
    return fields[0].values.length;
  }

  /**
   * 按行获取数据（作为对象）
   */
  getRow(rowIndex: number): Record<string, any> {
    if (rowIndex < 0 || rowIndex >= this.getRowCount()) {
      throw new Error(`行索引 ${rowIndex} 超出范围`);
    }
    
    const row: Record<string, any> = {};
    this.getFields().forEach(field => {
      row[field.name] = field.values[rowIndex];
    });
    return row;
  }

  /**
   * 获取所有行数据
   */
  getRows(): Record<string, any>[] {
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < this.getRowCount(); i++) {
      rows.push(this.getRow(i));
    }
    return rows;
  }

  /**
   * 切片数据帧（返回新的DataFrame）
   */
  slice(startRow: number, endRow: number): DataFrame {
    const sliced = new DataFrame({
      name: `${this.name}_slice_${startRow}_${endRow}`,
      source: this.source,
      timestamp: this.timestamp,
      meta: { ...this.meta, sliced: true }
    });

    this.getFields().forEach(field => {
      sliced.addField({
        ...field,
        values: field.values.slice(startRow, endRow)
      });
    });

    return sliced;
  }

  /**
   * 过滤数据帧
   */
  filter(predicate: (row: Record<string, any>, index: number) => boolean): DataFrame {
    const filtered = new DataFrame({
      name: `${this.name}_filtered`,
      source: this.source,
      timestamp: this.timestamp,
      meta: { ...this.meta, filtered: true }
    });

    const indices: number[] = [];
    for (let i = 0; i < this.getRowCount(); i++) {
      if (predicate(this.getRow(i), i)) {
        indices.push(i);
      }
    }

    this.getFields().forEach(field => {
      filtered.addField({
        ...field,
        values: indices.map(i => field.values[i])
      });
    });

    return filtered;
  }

  /**
   * 映射数据帧（转换每一行）
   */
  map(transform: (row: Record<string, any>, index: number) => Record<string, any>): DataFrame {
    const mapped = new DataFrame({
      name: `${this.name}_mapped`,
      source: this.source,
      timestamp: this.timestamp,
      meta: { ...this.meta, transformed: true }
    });

    const rows = this.getRows();
    const transformedRows = rows.map((row, index) => transform(row, index));

    if (transformedRows.length > 0) {
      const firstRow = transformedRows[0];
      for (const fieldName of Object.keys(firstRow)) {
        const values = transformedRows.map(row => row[fieldName]);
        const sampleValue = values[0];
        let inferredType = DataFrameFieldType.OBJECT;
        if (typeof sampleValue === 'number') inferredType = DataFrameFieldType.NUMBER;
        else if (typeof sampleValue === 'string') inferredType = DataFrameFieldType.STRING;
        else if (typeof sampleValue === 'boolean') inferredType = DataFrameFieldType.BOOLEAN;
        else if (sampleValue && typeof sampleValue === 'object') {
          if ('lat' in sampleValue && 'lng' in sampleValue) inferredType = DataFrameFieldType.GEO;
          else if ('x' in sampleValue && 'y' in sampleValue) inferredType = DataFrameFieldType.POINT;
        }
        mapped.addField({
          name: fieldName,
          type: inferredType,
          values
        });
      }
    }

    return mapped;
  }

  /**
   * 按字段值分组
   */
  groupBy(fieldName: string): Map<any, DataFrame> {
    const field = this.getField(fieldName);
    if (!field) {
      throw new Error(`字段 "${fieldName}" 不存在`);
    }

    const groups = new Map<any, number[]>();
    field.values.forEach((value, index) => {
      if (!groups.has(value)) {
        groups.set(value, []);
      }
      groups.get(value)!.push(index);
    });

    const result = new Map<any, DataFrame>();
    groups.forEach((indices, groupValue) => {
      const grouped = new DataFrame({
        name: `${this.name}_group_${groupValue}`,
        source: this.source,
        timestamp: this.timestamp,
        meta: { ...this.meta, grouped: true, groupBy: fieldName }
      });

      this.getFields().forEach(f => {
        grouped.addField({
          ...f,
          values: indices.map(i => f.values[i])
        });
      });

      result.set(groupValue, grouped);
    });

    return result;
  }

  /**
   * 排序数据帧
   */
  sort(fieldName: string, descending: boolean = false): DataFrame {
    const field = this.getField(fieldName);
    if (!field) {
      throw new Error(`字段 "${fieldName}" 不存在`);
    }

    const indices = Array.from({ length: this.getRowCount() }, (_, i) => i);
    indices.sort((a, b) => {
      const valA = field.values[a];
      const valB = field.values[b];
      
      if (valA < valB) return descending ? 1 : -1;
      if (valA > valB) return descending ? -1 : 1;
      return 0;
    });

    const sorted = new DataFrame({
      name: `${this.name}_sorted`,
      source: this.source,
      timestamp: this.timestamp,
      meta: { ...this.meta, sorted: true, sortBy: fieldName }
    });

    this.getFields().forEach(f => {
      sorted.addField({
        ...f,
        values: indices.map(i => f.values[i])
      });
    });

    return sorted;
  }

  /**
   * 获取时间范围
   */
  getTimeRange(): { start: number; end: number } | null {
    const timeField = this.getFields().find(f => f.type === DataFrameFieldType.TIME);
    if (!timeField || timeField.values.length === 0) {
      return null;
    }

    const times = timeField.values as number[];
    return {
      start: Math.min(...times),
      end: Math.max(...times)
    };
  }

  /**
   * 获取空间范围（针对地理数据）
   */
  getSpatialBounds(): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
    const geoField = this.getFields().find(f => f.type === DataFrameFieldType.GEO);
    if (!geoField || geoField.values.length === 0) {
      return null;
    }

    const geoPoints = geoField.values as Array<{ lat: number; lng: number }>;
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    geoPoints.forEach(point => {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLng = Math.min(minLng, point.lng);
      maxLng = Math.max(maxLng, point.lng);
    });

    return { minLat, maxLat, minLng, maxLng };
  }

  /**
   * 转换为JSON格式
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      source: this.source,
      timestamp: this.timestamp,
      ttl: this.ttl,
      cached: this.cached,
      meta: this.meta,
      fields: this.getFields().map(f => ({
        ...f,
        values: [...f.values]
      }))
    };
  }

  /**
   * 从JSON创建DataFrame
   */
  static fromJSON(json: any): DataFrame {
    const df = new DataFrame({
      id: json.id,
      name: json.name,
      source: json.source,
      timestamp: json.timestamp,
      ttl: json.ttl,
      cached: json.cached,
      meta: json.meta
    });

    json.fields.forEach((field: DataFrameField) => {
      df.addField({
        ...field,
        values: [...field.values] // 深拷贝values
      });
    });

    return df;
  }

  /**
   * 创建DataFrame的工厂方法
   */
  static create(config: DataFrameConfig): DataFrame {
    return new DataFrame(config);
  }

  /**
   * 检查DataFrame是否过期
   */
  isExpired(): boolean {
    if (this.ttl <= 0) return false;
    return Date.now() - this.timestamp > this.ttl;
  }
}
