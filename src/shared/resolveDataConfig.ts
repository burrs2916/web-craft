/**
 * 组件绑定全局数据源后的"有效取数配置"解析 —— 编辑端与发布端共享的唯一实现。
 *
 * 语义约定：组件 dataSourceId 命中某个全局数据源时，以该全局源的配置**完全覆盖**
 * 本组件自带的静态/接口数据字段（即"绑定后数据来自全局源，忽略自带配置"），
 * 源字段缺省时使用各自的默认值。未命中或无绑定时返回组件原配置。
 *
 * 编辑端 useApiDataFetch 与发布端 codegen 都必须调用本函数，否则预览与发布取数语义会漂移。
 */

/** 全局数据源中参与覆盖的字段形状（SceneDataSource 的子集） */
export type EffectiveSourceShape = {
  dataMode?: "static" | "api" | null;
  staticData?: unknown;
  apiUrl?: string | null;
  apiPath?: string | null;
  apiMethod?: "GET" | "POST" | string;
  apiBody?: unknown;
  apiHeaders?: unknown;
  apiDataPath?: string | null;
  apiInterval?: number | null;
  authEnabled?: boolean | null;
};

/**
 * 返回绑定后的有效取数配置。
 * @param config 组件原始 config（含 dataSourceId）
 * @param source 命中的全局数据源；null / undefined 表示未绑定或已失效 → 原样返回 config
 */
export function resolveEffectiveDataConfig<T>(
  config: T,
  source?: EffectiveSourceShape | null,
): T {
  if (!source) return config;
  return {
    ...config,
    // 与既有编辑器定义/发布端 default 完全一致：源字段缺省用各自默认值，不回退组件配置
    dataMode: source.dataMode ?? "static",
    staticData: source.staticData,
    apiUrl: source.apiUrl ?? "",
    apiPath: source.apiPath ?? "",
    apiMethod: source.apiMethod ?? "GET",
    apiBody: source.apiBody,
    apiHeaders: source.apiHeaders,
    apiDataPath: source.apiDataPath ?? "",
    apiInterval: source.apiInterval ?? 0,
    authEnabled: source.authEnabled ?? null,
  } as T;
}