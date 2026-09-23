import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { resolveFieldStyle } from "../data/fieldStyle";
import { validateChoiceField } from "../data/fieldValidate";
import { useFormChoiceOptions } from "../hooks/useFormChoiceOptions";
import { useBoxSize } from "../hooks/useBoxSize";
import { fitFactor, scaleStageCss, scaleInnerBaseCss, SEGMENTED_FIT, stageAlignOf, stageVAlignOf } from "../data/scaleFit";
// 口径唯一来源：兜底段 / 尺寸表 / 取值归一 / 数值兜底 —— 与发布端 segmented.ts 同一份
import { SEGMENTED_DEFAULT_ITEMS, SEGMENTED_SIZE_MAP, segNormalizeValue, segNum } from "../data/segmentedStyle";
import { FieldShell } from "./fieldShell";

/**
 * 分段控制器（form-segmented）编辑区渲染器。
 *
 * 与发布端 `codegen/components/segmented.ts` **结构同构**：
 * 同一份字段外壳（FieldShell ↔ fieldShellHTML）、同一份样式口径（resolveFieldStyle）、
 * 同一份选项解析（editor/data/optionItems.ts）、同一份兜底段/尺寸表/取值归一
 * （editor/data/segmentedStyle.ts）。
 *
 * 相对旧实现修掉的三处：
 * 1. 圆角口径错位：旧实现把面板值直接当 px（`${borderRadius}px`），而 MUI 的 sx 收到
 *    「数字」时会 × 主题 shape.borderRadius(=10) —— 两端会各显示一种圆角。现统一走
 *    `s.radiusCss`（面板值 × 10），与表单族其余控件一致。
 * 2. 无标签/无校验/无帮助文字：与表单族视觉断裂。现走统一字段外壳。
 * 3. 选项解析自带第二份实现：现复用 `parseOptionItems`（与下拉/单选同源）。
 */
export function SegmentedRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const s = resolveFieldStyle(config, { bgColor: "rgba(255,255,255,0.06)", radius: 8 });
  const isEdit = mode !== "preview";

  // 选项：静态 items / 接口响应（含认证三态 + 全局数据源绑定）统一口径。
  // 内置示例段只在「静态模式且面板为空」时兜底，接口模式下由响应驱动（无数据即保持空）。
  const { items: parsedItems, isApi } = useFormChoiceOptions(config as Record<string, unknown>);
  const items = parsedItems.length ? parsedItems : isApi ? [] : SEGMENTED_DEFAULT_ITEMS;
  // 取值归一（命中选项 else 首项），与发布端 `segNormalizeValue` 同源 ← P1-1
  const defaultValue = segNormalizeValue(items, config.value);

  const [activeValue, setActiveValue] = useState(defaultValue);
  useEffect(() => setActiveValue(defaultValue), [defaultValue]);

  const currentValue = isEdit ? defaultValue : activeValue;
  // 仅预览态且未禁用才可交互（编辑态点击用于选中组件）
  const interactive = !isEdit && !s.disabled;

  const size = String(config.size ?? "medium");
  const dims = SEGMENTED_SIZE_MAP[size] ?? SEGMENTED_SIZE_MAP.medium;
  const fullWidth = config.fullWidth === true;
  const block = config.block === true;
  const isFullW = fullWidth || block;
  const showIcon = config.showIcon === true;
  const iconSize = Number(config.iconSize ?? 16) || 16;
  const bgColor = String(config.bgColor ?? "rgba(255,255,255,0.06)");
  const activeBgColor = String(config.activeBgColor ?? "#FF9800");
  const textColor = String(config.textColor ?? "rgba(255,255,255,0.6)");
  const activeTextColor = String(config.activeTextColor ?? "#ffffff");
  const fontSize = Number(config.fontSize ?? 13) || 13;
  const fontWeight = String(config.fontWeight ?? "normal");
  const activeFontWeight = String(config.activeFontWeight ?? "600");
  // 数值兜底且保留合法 0（`gap: 0` = 无间距） ← P3
  const gap = Math.max(0, segNum(config.gap, 4));
  const innerRadius = Math.max(0, s.radius * 10 - 2);
  // 舞台摆放与发布端同源（此前写死 "left"，与面板声明的默认值 center 相反）
  const align = stageAlignOf(config as Record<string, unknown>);
  const vAlign = stageVAlignOf(config as Record<string, unknown>);
  const scaleFit = config.scaleFit !== false;

  // 枚举型控件：校验只有「必填」有意义（与下拉/单选复用同一口径）
  const error = validateChoiceField(config, !!currentValue);

  // ── 随拖动框等比缩放（与发布端 `scaleSkeleton` 同一公式与骨架） ──
  // 舞台 = 字段层内容区（编辑区这层与发布端 fieldShellHTML 的 `.{uid}` 字段层严格对应），
  // 胶囊本体即「缩放内层」：保持自然尺寸（段宽由文字决定），只被 transform 缩放。
  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  // 全宽/块级时内层已 `width:100%` 铺满，再叠加 transform 缩放会溢出拖动框（编辑区被
  // overflow:hidden 裁掉、发布端溢出）→ 全宽态恒不缩放 ← P2-5
  const factor = scaleFit && !isFullW ? fitFactor(box.w, box.h, SEGMENTED_FIT) : 1;

  // 预览态键盘可达：方向键/Home/End 切换（与发布端同一键位）← P2-1
  const segRefs = useRef<Array<HTMLElement | null>>([]);
  const onGroupKeyDown = (e: ReactKeyboardEvent) => {
    if (!interactive || items.length === 0) return;
    const cur = items.findIndex((it) => it.value === activeValue);
    let next = cur < 0 ? 0 : cur;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(items.length - 1, (cur < 0 ? -1 : cur) + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, (cur < 0 ? items.length : cur) - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    setActiveValue(items[next].value);
    segRefs.current[next]?.focus();
  };

  return (
    <FieldShell s={s} hasValue={!!currentValue} error={error} ring={false}>
      <Box ref={box.ref} data-wc-segmented-stage="1" sx={scaleStageCss(align, vAlign)}>
        <Box
          data-wc-segmented-inner="1"
          role="radiogroup"
          aria-label={s.labelText || String(config.fieldName ?? "") || undefined}
          aria-disabled={s.disabled || undefined}
          onKeyDown={onGroupKeyDown}
          sx={{
            ...scaleInnerBaseCss(),
            ...(scaleFit ? { transform: `scale(${factor})` } : null),
            display: "inline-flex",
            alignItems: "center",
            boxSizing: "border-box",
            width: isFullW ? "100%" : "auto",
            backgroundColor: bgColor,
            borderRadius: s.radiusCss,
            padding: `${gap}px`,
            gap: `${gap}px`,
            flexWrap: "nowrap",
            opacity: s.disabled ? 0.5 : 1,
          }}
        >
          {items.map((item, i) => {
            const isActive = item.value === currentValue;
            const resolvedIcon = showIcon && item.icon ? resolveIcon(item.icon, undefined, iconSize) : null;

            return (
              <Box
                key={item.value + "_" + i}
                ref={(el: HTMLElement | null) => { segRefs.current[i] = el; }}
                role="radio"
                aria-checked={isActive}
                aria-disabled={s.disabled || undefined}
                tabIndex={isActive && interactive ? 0 : -1}
                onClick={() => interactive && setActiveValue(item.value)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  height: `${dims.height}px`,
                  padding: `${dims.padY}px ${dims.padX}px`,
                  borderRadius: `${innerRadius}px`,
                  // 状态属性由 sx 类给出（非行内），切换瞬时生效且可过渡
                  backgroundColor: isActive ? activeBgColor : "transparent",
                  color: isActive ? activeTextColor : textColor,
                  fontSize: `${fontSize}px`,
                  fontWeight: isActive ? activeFontWeight : fontWeight,
                  cursor: interactive ? "pointer" : "default",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                  transition: "background-color .2s cubic-bezier(0, 0, 0.2, 1), color .2s cubic-bezier(0, 0, 0.2, 1)",
                  "&:focus-visible": { outline: `2px solid ${activeBgColor}`, outlineOffset: "1px" },
                  ...(isFullW ? { flex: "1 1 0" } : {}),
                }}
              >
                {resolvedIcon && (
                  <Box sx={{ display: "flex", alignItems: "center", color: "inherit" }}>{resolvedIcon}</Box>
                )}
                <Box
                  component="span"
                  sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: 1, pointerEvents: "none" }}
                >
                  {item.label}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </FieldShell>
  );
}
