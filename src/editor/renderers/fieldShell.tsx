import Box from "@mui/material/Box";
import type { ReactNode } from "react";
import { FOCUS_LABEL_COLOR, SECONDARY_TEXT, MUI_FONT, type FieldStyle } from "../data/fieldStyle";

/**
 * 编辑区「字段型」控件的统一外壳——与发布端 `codegen/components/form.ts` 的
 * `fieldShellHTML` 结构逐项对应（顶部标签 / 悬浮徽章 / 边框环 / 提示文字）。
 *
 * 为什么独立成组件：date/time/number/file 原各自的渲染器是四套互不相同的 MUI 写法
 * （TextField + InputLabel / Button / IconButton…），既与发布端产物不同构、彼此也不一致，
 * 于是「画布与发布不一致」成了结构性问题。收口到这一个外壳后，
 * 所有字段型控件的几何、标签、提示、聚焦/错误配色只有一份实现。
 *
 * 实现约束（本仓库既有的两条踩坑，勿改）：
 * 1. **不用 MUI 的数字 px 补全**：sx 里所有位置/尺寸一律写显式 `Npx` 字符串
 *    （定制版 @mui/material@9.0.0 对数字补 px 不可信，曾导致 fixed 弹层错位）。
 * 2. **聚焦/已填/错误三态由 props 计算**，不依赖 CSS 级联 —— 画布缩放容器的
 *    层叠上下文复杂，状态类规则容易被压制；显式计算的结果与发布端 `:focus-within`
 *    的最终色值一致。
 */

export interface FieldShellProps {
  s: FieldStyle;
  /** 控件本体（自带 flex:1 撑满字段层） */
  children: ReactNode;
  /** 是否处于聚焦态（由控件 onFocus/onBlur 上报） */
  focused?: boolean;
  /** 是否有值（决定悬浮徽章是否切换「已填」色） */
  hasValue?: boolean;
  /** 校验错误文案（空串=通过） */
  error?: string;
  /** 字段层附加样式（如滑块/开关不需要边框） */
  fieldSx?: Record<string, unknown>;
  /**
   * 是否绘制边框环（开关/滑块/文件拖放区自带边框，传 false）。
   * 注意：`false` 只是不画**常驻**边框 —— 校验错误时仍会补一道 inset 红环，
   * 以对齐发布端 `__WCVALIDATE` 给 `[data-ring]` 层加的 box-shadow（否则两端错误态不一致）。
   */
  ring?: boolean;
  /** 悬浮徽章左缩进，默认 14（与内容起点对齐） */
  floatLeft?: number;
}

export function FieldShell({
  s,
  children,
  focused = false,
  hasValue = false,
  error = "",
  fieldSx,
  ring = true,
  floatLeft = 14,
}: FieldShellProps) {
  const hasError = !!error;
  const ringColor = hasError ? s.errorColor : focused ? s.focusBorderColor : s.borderColor;
  const badgeColor = hasError
    ? s.errorColor
    : focused
      ? FOCUS_LABEL_COLOR
      : hasValue
        ? SECONDARY_TEXT
        : s.labelColor;
  const hint = hasError ? error : s.helperText;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: s.hasFloat ? "center" : "flex-start",
        fontFamily: MUI_FONT,
      }}
    >
      {s.hasTop && (
        <Box
          component="label"
          sx={{
            flexShrink: 0,
            fontSize: `${s.labelFontSize}px`,
            lineHeight: 1.2,
            color: s.labelColor,
            marginBottom: `${s.labelGap}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            userSelect: "none",
          }}
        >
          {s.labelText}
        </Box>
      )}

      <Box
        sx={{
          position: "relative",
          width: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "stretch",
          ...fieldSx,
        }}
      >
        {ring ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              border: `${s.borderWidth}px solid ${ringColor}`,
              borderRadius: s.radiusCss,
              pointerEvents: "none",
              transition: "border-color 0.2s",
            }}
          />
        ) : hasError ? (
          // 无边框控件（评分 / 开关 / 滑块 / 文件拖放区）的错误态：发布端的 `__WCVALIDATE`
          // 会给 `[data-ring]` 层加 `inset 0 0 0 <borderWidth>px <errorColor>` 阴影，而编辑区
          // 旧实现什么都不画 → 「发布页一道红环、画布没有」。这里按同一公式补上（同样无圆角）。← P2-5
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              boxShadow: `inset 0 0 0 ${s.borderWidth}px ${s.errorColor}`,
              pointerEvents: "none",
              transition: "box-shadow 0.2s",
            }}
          />
        ) : null}

        {children}

        {s.hasFloat && (
          <Box
            component="label"
            sx={{
              position: "absolute",
              left: `${floatLeft}px`,
              top: 0,
              transform: "translateY(-50%)",
              fontSize: `${s.labelFontSize}px`,
              lineHeight: 1.2,
              color: badgeColor,
              background: s.labelBgColor,
              borderRadius: `${s.labelRadius}px`,
              padding: "0 4px",
              pointerEvents: "none",
              zIndex: 2,
              whiteSpace: "nowrap",
              userSelect: "none",
              transition: "color 0.2s",
            }}
          >
            {s.label}
            {s.required && <span style={{ color: s.errorColor }}> *</span>}
          </Box>
        )}
      </Box>

      {hint ? (
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            fontSize: "12px",
            lineHeight: 1.4,
            marginTop: "3px",
            color: hasError ? s.errorColor : s.helperColor,
            userSelect: "none",
          }}
        >
          {hint}
        </Box>
      ) : null}
    </Box>
  );
}
