import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveFieldStyle } from "../data/fieldStyle";
import { validateFieldValue } from "../data/fieldValidate";
import {
  fitFactor,
  RATE_FIT,
  scaleStageCss,
  scaleInnerBaseCss,
  stageAlignOf,
  stageVAlignOf,
} from "../data/scaleFit";
import { resolveRateStyle, rateInnerCss, rateTextCss, rateTextOf, rateSubmitValue } from "../data/rateStyle";
import { useBoxSize } from "../hooks/useBoxSize";
import { FieldShell } from "./fieldShell";

/**
 * 评分（form-rate）编辑区渲染器。
 *
 * 与发布端 `codegen/components/rate.ts` **结构同构**：
 * 同一份字段外壳（FieldShell ↔ fieldShellHTML，ring:false）、同一份样式口径（`resolveFieldStyle`）、
 * 同一份取值口径（`editor/data/rateStyle.ts`：图标路径 / 尺寸档位 / 分值文案 / 外观层）、
 * 同一份缩放骨架（`scaleStageCss` + `scaleInnerBaseCss` + `RATE_FIT`）。
 *
 * ── 本轮（#9）相对旧实现修掉的三处 ──
 * 1. **摆放默认值与表单族相反**：旧实现两端各自维护一张对齐映射表、且把缺省值兜成左对齐，
 *    于是评分是表单组里唯一默认靠左的控件（其余成员走 `STAGE_ALIGN_DEFAULT = "center"`），
 *    且面板里没有 `vAlign`。现改调 `stageAlignOf` / `stageVAlignOf` —— 常量与"求值"都只有一份。
 * 2. **缩放基准与 defaultSize 不符**：旧 `RATE_FIT` 为 126×30，默认框 220×40 里星条被放大 1.33 倍，
 *    破坏「拖进来即 1 倍」不变式；已改为 220×40（`scaleFit.ts`）。
 * 3. **没有 `scaleFit` 开关**：面板无法退回"始终原始尺寸"。现与其余成员一致（默认开）。
 *
 * ── 本轮（#27）相对旧实现修掉的四处 ──
 * 1. **校验取值与发布端相反**：0 分（未评分）在编辑区当空串、发布端却写 `value="0"` 被
 *    判为已填。现两端都走口径层的 `rateSubmitValue`。
 * 2. **开「允许半星」时点击永远给整数**：click 只看第几颗星，不看横坐标 → hover 预告 2.5、
 *    一松手跳 3。现按鼠标横坐标取半，与 `mousemove` / 发布端同一判定。
 * 3. **预览态零键盘**：没有 tabIndex / onKeyDown / aria，预览里键盘完全不可用。
 *    现与发布端同键位（方向键 ±1 或 ±0.5，夹取到 [0, max]）。
 * 4. **无 `radiogroup` / 无 `aria-label` / 星片无 `aria-disabled`**：补齐，与发布端逐项对应。
 *
 * 「必填」语义：必须给出评分（0 分 = 未评分 → 校验不通过），与发布端隐藏 input 同口径。
 */
export function RateRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const s = resolveFieldStyle(config, { bgColor: "transparent", radius: 0 });
  const r = useMemo(() => resolveRateStyle(config), [config]);
  const isEdit = mode !== "preview";
  const scaleFit = config.scaleFit !== false;
  const align = stageAlignOf(config);
  const vAlign = stageVAlignOf(config);
  // 无障碍名称：标签优先，回退字段名，最后兜「评分」（与发布端 `ariaLabel` 同口径）
  const ariaLabel =
    String(config.label ?? "").trim() || String(config.fieldName ?? "").trim() || "评分";

  // 实测字段层尺寸 → 等比缩放（发布端脚本读的也是这一层，两端同源）
  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, RATE_FIT) : 1;
  // 星/文字一律按**自然尺寸**写，缩放只由内层一次 `transform: scale(factor)` 完成 ——
  // 旧实现是把 factor 乘进每个 `width/height/fontSize`（不做 transform），发布端却用 transform，
  // 两套机制恰好等价。本轮统一到 transform 后若再乘一次，就会出现**双重缩放**（实测 1.35²）。
  const starSize = r.baseSize;

  const [activeValue, setActiveValue] = useState(r.value);
  const [hoverValue, setHoverValue] = useState(-1);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setActiveValue(r.value);
  }, [r.value]);

  const displayValue = isEdit ? r.value : activeValue;
  const currentDisplay = hoverValue >= 0 ? hoverValue : displayValue;

  // 提交值口径与发布端同源：0 分 = 未评分 → 空串（必填校验据此判定）
  const error = validateFieldValue(config, rateSubmitValue(displayValue));
  const showError = !!error && (touched || displayValue > 0);
  const displayText = rateTextOf(currentDisplay, r.allowHalf);

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <FieldShell
        s={s}
        hasValue={displayValue > 0}
        error={showError ? error : ""}
        ring={false}
        fieldSx={{ alignItems: "stretch" }}
      >
        {/* 三层骨架：字段层（实测） → 舞台（铺满 + 按 align/vAlign 摆放） → 内层（自然尺寸，只被 transform 缩放）。
            ref 必须挂在字段层而**不是**最外层 —— 发布端测量的就是字段层，
            挂外层会把「顶部标签/帮助文字」的高度也算进去，两端缩放系数不一致。 */}
        <Box ref={box.ref} data-wc-rate-stage="1" sx={{ ...scaleStageCss(align, vAlign) }}>
          <Box
            data-wc-rate-inner="1"
            role="radiogroup"
            aria-label={ariaLabel}
            aria-disabled={r.disabled}
            // 编辑态不进入 Tab 序（画布是编辑面，不是运行时）；预览态与发布端一致可聚焦
            tabIndex={isEdit || r.disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (isEdit || r.disabled) return;
              const step = r.allowHalf ? 0.5 : 1;
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                setHoverValue(-1);
                setActiveValue((v) => Math.min(r.max, v + step));
                setTouched(true);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                setHoverValue(-1);
                setActiveValue((v) => Math.max(0, v - step));
                setTouched(true);
              }
            }}
            sx={{
              ...scaleInnerBaseCss(),
              ...rateInnerCss(r),
              ...(scaleFit ? { transform: `scale(${factor})` } : null),
              // 键盘聚焦环：与发布端 `.{uid}-in:focus-visible` 同一处、同一色
              "&:focus-visible": {
                outline: `2px solid ${r.color}`,
                outlineOffset: "2px",
                borderRadius: "4px",
              },
            }}
            onMouseLeave={() => {
              if (!isEdit) setHoverValue(-1);
            }}
          >
            {Array.from({ length: r.max }, (_, index) => {
              const starValue = index + 1;
              const filled = currentDisplay >= starValue;
              const half = r.allowHalf && !filled && currentDisplay >= starValue - 0.5;
              return (
                <Box
                  key={index}
                  role="radio"
                  aria-checked={filled}
                  aria-disabled={r.disabled}
                  onClick={(e) => {
                    if (isEdit || r.disabled) return;
                    // 允许半星时按鼠标横坐标取半（旧实现恒取整颗星：hover 预告 2.5、点下去跳 3）
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const isHalf = r.allowHalf && e.clientX - rect.left < rect.width / 2;
                    const next = isHalf ? starValue - 0.5 : starValue;
                    setActiveValue(next);
                    // 与发布端一致：点击即把 hover 落到提交值上，避免"预览值压住已选值"
                    setHoverValue(next);
                    setTouched(true);
                  }}
                  onMouseEnter={() => {
                    if (isEdit || r.disabled) return;
                    setHoverValue(r.allowHalf ? starValue - 0.5 : starValue);
                  }}
                  onMouseMove={(e) => {
                    if (isEdit || r.disabled || !r.allowHalf) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const isHalf = e.clientX - rect.left < rect.width / 2;
                    setHoverValue(isHalf ? starValue - 0.5 : starValue);
                  }}
                  sx={{
                    position: "relative",
                    width: `${starSize}px`,
                    height: `${starSize}px`,
                    flexShrink: 0,
                    cursor: !isEdit && !r.disabled ? "pointer" : "default",
                  }}
                >
                  {/* 底层未激活色（恒在） */}
                  <svg
                    width={starSize}
                    height={starSize}
                    viewBox="0 0 24 24"
                    style={{ display: "block", pointerEvents: "none" }}
                  >
                    <path d={r.path} fill={r.inactiveColor} />
                  </svg>
                  {/* 顶层激活色：由 filled/half 控制显隐与裁切（非行内状态样式） */}
                  {(filled || half) && (
                    <svg
                      width={starSize}
                      height={starSize}
                      viewBox="0 0 24 24"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        display: "block",
                        pointerEvents: "none",
                        clipPath: half ? "inset(0 50% 0 0)" : "none",
                      }}
                    >
                      <path d={r.path} fill={r.color} />
                    </svg>
                  )}
                </Box>
              );
            })}
            {r.showText && (
              <Box component="span" sx={rateTextCss(r)}>
                {displayText}
              </Box>
            )}
          </Box>
        </Box>
      </FieldShell>
    </Box>
  );
}
