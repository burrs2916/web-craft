import { openUrl } from '@tauri-apps/plugin-opener';

/// 将域名规范化为可直接访问的 URL：带 http(s) 原样保留，否则补 https://
export function normalizeSiteUrl(domain: string): string {
  const d = domain.trim();
  if (!d) return '';
  if (/^https?:\/\//i.test(d)) return d;
  return `https://${d}`;
}

/// 按运行环境打开外链：Tauri 环境用 openUrl（唤起系统默认浏览器）；
/// 浏览器/Web 预览环境直接用 window.open（此时浏览器即“默认浏览器”）。
export async function openSiteDomain(domain: string): Promise<void> {
  const url = normalizeSiteUrl(domain);
  if (!url) return;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      await openUrl(url);
      return;
    } catch (err) {
      console.error('openSiteDomain: openUrl failed, fallback to window.open', { url, err });
    }
  }
  window.open(url, '_blank', 'noopener');
}

export function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}