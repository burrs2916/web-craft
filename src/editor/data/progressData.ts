/**
 * progress 动态数据取数口径（零依赖纯函数）
 *
 * 编辑态渲染器（ProgressRenderer）与发布态 codegen（codegen/components/progress.ts）共用：
 * 把任意响应值收敛为进度条数值。借鉴布局条目型的共享口径文件范式（breadcrumbsData.ts）。
 *
 * ⚠️ 发布端运行时脚本无法 import TS，progressDataJs 里的 coerceNum 是本函数的**手工镜像**
 * （steps 先例：mount 脚本与编辑器解析逐字对齐）——改动两侧必须同步。
 *
 * 接受形态（借鉴 steps 的响应形态自适应）：
 *   - 数字 → 直接用
 *   - 数字字符串 → parseFloat
 *   - 对象 → 依次解包 value | percent | current 兜底键（接口直接返回 {"value":85} 时免配数据路径）
 *   - 其余（空/数组/不可解析）→ null，调用方回退静态值（进度条不闪 0）
 */
export function coerceProgressNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return coerceProgressNumber(obj.value ?? obj.percent ?? obj.current);
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}
