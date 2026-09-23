import { invoke } from '@tauri-apps/api/core';

/** 统一资源目录条目（与后端 resources 表对齐）。 */
export interface ResourceRow {
  id: string;
  kind: string; // connection | site | deployment | terminal | automation | command | media | content
  refId: string;
  name: string;
  metaJson: string;
  createdAt: number;
  updatedAt: number;
}

/** 资源互联边视图：含对端资源，供统一资源中心交叉跳转。 */
export interface ResourceLinkView {
  relation: string; // runs_on | deploys_to | belongs_to | uses | links
  direction: string; // outgoing | incoming
  peer: ResourceRow;
}

/** reconcile_all 的结果统计。 */
export interface ReconcileSummary {
  connections: number;
  sites: number;
  deployments: number;
  terminals: number;
  automations: number;
}

/** 资源种类枚举（与后端 ResourceKind 对齐）。 */
export type ResourceKind =
  | 'connection'
  | 'site'
  | 'deployment'
  | 'terminal'
  | 'automation'
  | 'command'
  | 'media'
  | 'content';

/** 列出统一资源；可选按 kind 过滤。 */
export async function resourceList(
  kind?: ResourceKind,
  limit = 200,
): Promise<ResourceRow[]> {
  return invoke<ResourceRow[]>('resource_list', { kind, limit });
}

/** 获取单个资源详情。 */
export async function resourceGet(id: string): Promise<ResourceRow | null> {
  return invoke<ResourceRow | null>('resource_get', { id });
}

/** 查询某资源的全部互联边（出边 + 入边），附带对端资源信息。 */
export async function resourceLinks(
  kind: ResourceKind,
  refId: string,
): Promise<ResourceLinkView[]> {
  return invoke<ResourceLinkView[]>('resource_links', { kind, refId });
}

/** 把存量数据纳入统一资源体并重建互联边（幂等）。 */
export async function resourceReconcile(): Promise<ReconcileSummary> {
  return invoke<ReconcileSummary>('resource_reconcile');
}

/** 解析资源 meta_json 为对象。 */
export function parseResourceMeta(row: ResourceRow): Record<string, unknown> {
  try {
    return JSON.parse(row.metaJson || '{}');
  } catch {
    return {};
  }
}
