import { useMemo } from "react";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { useApiDataFetch } from "./useApiDataFetch";
import { resolveFormOptions, type OptionItem } from "../data/optionItems";

export interface FormChoiceOptions {
  /** 最终选项（静态 items 或接口响应归一结果） */
  items: OptionItem[];
  /** 是否由接口响应驱动 */
  fromApi: boolean;
  /** 是否处于可用的接口模式（已配置地址/路径，或绑定了全局数据源） */
  isApi: boolean;
}

/**
 * 选项型表单控件在**编辑区**的取数口径 —— 与发布端 `dataLoaderScript` 同一套语义。
 *
 * 三步与发布端逐项对齐（任一步分叉都会造成"编辑区有选项、发布后为空"）：
 * 1. 全局数据源绑定：`resolveEffectiveDataConfig` 用源配置覆盖本地数据字段
 *    （发布端由 `codegen/engine.ts` 的 `withEffectiveConfig` 完成，语义相同）；
 * 2. 认证三态：`authEnabled` 原样透传 —— `true` 强制注入 Token / `false` 明确不注入 /
 *    `null`（未配置）跟随站点全局认证态。**不得压成布尔**，否则"未配置"会变成"明确禁用"；
 * 3. 选项归一：静态走 `parseOptionItems`（兼容旧 options 文本），接口走 `parseApiOptionItems`
 *    （字段映射 apiValueField/apiLabelField），统一由 `resolveFormOptions` 判定。
 */
export function useFormChoiceOptions(config: Record<string, unknown>): FormChoiceOptions {
  const dataSources = useEditorStore((s) => s.dataSources);
  const dsId = String(config.dataSourceId ?? "");
  const boundSource = dsId ? dataSources.find((d) => d.id === dsId) : undefined;
  const eff = resolveEffectiveDataConfig(config, boundSource) as Record<string, unknown>;

  const isApi =
    String(eff.dataMode ?? "static") === "api" &&
    (!!dsId || !!String(eff.apiUrl ?? "") || !!String(eff.apiPath ?? ""));

  const authEnabled =
    config.authEnabled === undefined || config.authEnabled === null
      ? null
      : config.authEnabled === true;

  const { data } = useApiDataFetch({
    dataMode: isApi ? "api" : "static",
    staticData: isApi ? undefined : eff.staticData,
    apiUrl: String(eff.apiUrl ?? ""),
    apiPath: String(eff.apiPath ?? ""),
    apiMethod: String(eff.apiMethod ?? "GET") as "GET" | "POST",
    apiBody: eff.apiBody,
    apiHeaders: eff.apiHeaders,
    apiInterval: Number(eff.apiInterval ?? 0) || 0,
    apiDataPath: String(eff.apiDataPath ?? ""),
    authEnabled,
    dataSourceId: dsId,
  });

  return useMemo(() => {
    const r = resolveFormOptions(eff, isApi ? data : undefined);
    return { items: r.items, fromApi: r.fromApi, isApi };
    // eff 每次渲染都是新对象（绑定全局源时），但取值稳定，用其关键字段作为依赖即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isApi,
    data,
    eff.dataMode,
    eff.apiValueField,
    eff.apiLabelField,
    config.items,
    config.options,
  ]);
}
