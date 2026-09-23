// 自定义图标渲染：从 iconStore 获取 URL，批量接口未命中时单图标兜底
import React, { useEffect } from "react";
import { useIconStore } from "../../store/iconStore";

/**
 * 强制刷新缓存（自定义图标变更时调用）。
 * @deprecated iconStore 的 upload/remove 已自动更新 urls，CustomIconImg 订阅 store 后自动刷新。
 *   此函数保留为 no-op 以兼容现有调用方（CustomIconTabs），后续可移除。
 */
export function invalidateCustomIconCache() {
  // no-op: iconStore 自动管理缓存，无需手动失效
}

/** 判断 icon 字符串是否是自定义图标格式 */
export function isCustomIcon(icon: string | null | undefined): boolean {
  return !!icon && icon.startsWith("custom-");
}

interface CustomIconImgProps {
  icon: string; // "custom-{id}"
  size?: number;
  fallback?: React.ReactElement;
}

/**
 * 自定义图标渲染组件。
 *
 * 数据源统一从 iconStore.urls 获取（Zustand 响应式），不再维护模块级缓存。
 * - 小图标：fetchAll 批量接口直接返回
 * - 大图标：批量接口跳过，通过 getUrl(id) 单图标兜底
 * - 图标切换：url 从 store 派生，不存在 stale state 问题
 */
export function CustomIconImg({ icon, size = 16, fallback }: CustomIconImgProps) {
  const iconId = icon.replace(/^custom-/, "");
  const urls = useIconStore((s) => s.urls);
  const fetchAll = useIconStore((s) => s.fetchAll);
  const getUrl = useIconStore((s) => s.getUrl);

  // 从 store 派生 URL（响应式：urls 变化时自动重渲染）
  const url = urls[iconId] ?? null;

  // 挂载时确保 store 已初始化（批量加载图标列表 + URL）
  useEffect(() => {
    if (!useIconStore.getState().loaded) {
      fetchAll().catch(() => {});
    }
  }, [fetchAll]);

  // 批量接口未命中当前图标时，单图标兜底
  useEffect(() => {
    if (url) return; // 已有 URL，无需兜底
    // fetchAll 尚未完成时等待批量结果，不提前调单图标接口
    if (!useIconStore.getState().loaded) return;
    getUrl(iconId).catch(() => {});
  }, [iconId, url, getUrl, urls]);

  if (!url) return fallback || null;
  return (
    <img
      src={url}
      alt=""
      style={{ maxWidth: size, maxHeight: size, objectFit: "contain", display: "block" }}
    />
  );
}
