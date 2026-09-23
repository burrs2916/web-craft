import type { ComponentRendererProps } from "../../types/editor";
import { DateTimeField } from "./DateTimeField";

/**
 * 时间（编辑区画布）
 * 实现见 `DateTimeField`——与发布端 `formTimeCodegen` 同构（悬浮徽章 / 边框环 / 占位覆盖层 / 清空 / 实时校验）。
 */
export function FormTimeRenderer(props: ComponentRendererProps) {
  return <DateTimeField {...props} type="time" />;
}
