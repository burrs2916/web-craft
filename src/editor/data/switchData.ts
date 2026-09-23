/**
 * 开关（switch）动态状态取数口径（零依赖纯函数）
 *
 * 编辑态渲染器（SwitchRenderer）与发布态 codegen（codegen/components/switch.ts）共用：
 * 把任意响应值收敛为开/关布尔。借鉴 breadcrumbsData.ts / progressData.ts 的共享口径范式。
 *
 * ⚠️ 发布端运行时脚本无法 import TS，switch.ts 运行时里的 coerceState 是本函数的**手工镜像**
 * （steps/progress 先例）——改动两侧必须同步。
 *
 * 接受形态：
 *   - 布尔 → 直接用
 *   - 数字 → 1=true，0=false，其余 null（语义不明不猜）
 *   - 字符串 → 智能词表（true/1/on/open/yes/开/开启/打开/运行… 与 false 对应词），大小写不敏感
 *   - 期望值优先：onValue/offValue 配置（如 running/stopped）命中即判定，先于词表
 *   - 对象 → 依次解包 value | state | status 兜底键
 *   - 其余（空/数组/不可识别）→ null，调用方回退静态 checked（开关不闪unknown态）
 */
const SWITCH_TRUE_WORDS = new Set([
  "true", "1", "on", "open", "opened", "yes", "run", "running", "active",
  "开", "开启", "打开", "运行", "运行中", "启动", "启用", "在线",
]);
const SWITCH_FALSE_WORDS = new Set([
  "false", "0", "off", "close", "closed", "no", "stop", "stopped", "inactive",
  "关", "关闭", "停止", "停机", "停用", "离线",
]);

export function coerceSwitchState(
  v: unknown,
  onValue?: string,
  offValue?: string,
): boolean | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return coerceSwitchState(obj.value ?? obj.state ?? obj.status, onValue, offValue);
  }
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  // 期望值优先（用户配置如 running/stopped），大小写不敏感
  if (onValue && s === onValue.trim().toLowerCase()) return true;
  if (offValue && s === offValue.trim().toLowerCase()) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (SWITCH_TRUE_WORDS.has(s)) return true;
  if (SWITCH_FALSE_WORDS.has(s)) return false;
  return null;
}
