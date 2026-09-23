/**
 * 属性面板数字输入框的「可清空」落点判定 —— **唯一口径**，编辑器各数字输入共用。
 *
 * 为什么必须独立成模块：数字输入框曾经是「受控 value + onChange 里 `if (v === '') return`」——
 * 空串不提交 → React 重渲染把旧值打回输入框 → 最后一个数字永远删不掉（全选删除同理）。
 * 修复姿势是「聚焦期本地草稿 + 失焦确定落点」，而「什么算未完成态、空值提交什么、
 * 越界怎么夹取」一旦在多个输入框各写一份就必然漂移，故收口为纯函数。
 *
 * 两种空值语义（由调用方声明）：
 * - `unset`：清空 = 未设置 → 提交 `undefined`，消费端 `?? 默认值` 回退组件默认配置（如字号）。
 * - `keep`  ：清空 = 无效输入 → 不提交（`null`），保持原值（如 X/Y/W/H 几何值不可为空）。
 */

import { useState } from "react";

export interface NumberDraftOptions {
  min?: number;
  max?: number;
  /** 清空/不可解析时的语义：'unset' = 提交 undefined；'keep' = 不提交（返回 null）。默认 'keep'。 */
  empty?: 'unset' | 'keep';
}

/**
 * 实时提交判定（onChange 用）：可解析才实时提交，其余（空串/负号/小数点开头等未完成态、
 * 非数字）返回 null 表示「只进草稿、不回写」——绝不把旧值打回输入框。
 */
export function parseLiveNumber(text: string): number | null {
  if (text === '' || text === '-' || text === '.' || text === '-.') return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

/**
 * 失焦落点判定（onBlur 用）：
 * - `number`    ：夹取进 [min,max] 后的提交值；
 * - `undefined`：清空且声明了 `empty: 'unset'`（提交 undefined 回退默认）；
 * - `null`     ：不提交，保持原值（空值且 `empty: 'keep'`，或不可解析）。
 */
export function commitNumberDraft(text: string, opts: NumberDraftOptions = {}): number | undefined | null {
  const t = text.trim();
  const blank = t === '' || t === '-' || t === '.' || t === '-.';
  if (blank || Number.isNaN(Number(t))) {
    return opts.empty === 'unset' ? undefined : null;
  }
  const n = Number(t);
  const min = opts.min ?? -Infinity;
  const max = opts.max ?? Infinity;
  return Math.min(max, Math.max(min, n));
}

/**
 * 数字输入框的「可清空」草稿层 hook（配合上面两个落点判定）。
 * 反模式背景：受控 value + onChange 里 `if (v === '') return` —— 空串不提交，
 * React 重渲染把旧值打回输入框，最后一个数字永远删不掉（全选删除同理）。
 * 正确姿势：聚焦期间维护本地草稿文本，可解析才实时提交（画布即时跟随）；
 * 空串/负号等未完成态只进草稿、不回写；失焦时由调用方按字段语义定落点
 * （配置值清空 = unset 回退默认；几何值清空 = keep 保持原值）。
 *
 * 编辑器各面板共用（属性面板 NumberConfigField / CompactNumberInput / ZIndexInput /
 * 喷雾参数 / 数据源轮询间隔）；宿主必须是组件（hook 不能出现在普通函数调用或 map 循环里）。
 */
export function useClearableNumber(committed: number, format: (n: number) => string = String) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    /** 输入框当前应显示的文本（聚焦期 = 草稿；其余 = 格式化的已提交值） */
    display: draft ?? format(committed),
    /** 是否处于编辑态（有未落盘草稿） */
    editing: draft !== null,
    /** onChange：记录草稿；可解析则返回实时提交值，否则返回 null（不提交、不打回旧值） */
    change(v: string): number | null {
      setDraft(v);
      return parseLiveNumber(v);
    },
    /** onBlur：结束编辑并返回草稿文本（从未编辑过返回 null，调用方无需提交） */
    end(): string | null {
      if (draft === null) return null;
      setDraft(null);
      return draft;
    },
  };
}
