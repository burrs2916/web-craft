import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";

/**
 * 间距组件渲染器
 *
 * 两种类型：
 * - blank（空白）：纯留白区域，支持背景色、边框、圆角和占位提示
 * - divider（分隔线）：渲染一条线，支持水平/垂直方向和可选标签文字
 *
 * 编辑模式（mode === "edit"）下，blank 类型未开启任何视觉配置时，
 * 自动显示虚线边框 + "间距" 提示文字，让用户在画布上能清晰看到组件边界。
 * 预览/发布模式下 blank 类型完全透明（除非用户主动开启了配置）。
 */
export function SpaceRenderer({ config, mode }: ComponentRendererProps) {
  const type = (config.type as string) || "blank";

  // —— 分隔线类型 ——
  if (type === "divider") {
    return <DividerView config={config} />;
  }

  // —— 空白类型（原有逻辑） ——
  // 背景色
  const bgEnabled = (config.bgEnabled as boolean) ?? false;
  const bgColor = (config.bgColor as string) || "rgba(255,255,255,0.04)";

  // 边框
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderStyle = (config.borderStyle as string) || "dashed";
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.15)";
  const borderWidth = (config.borderWidth as number) ?? 1;

  // 圆角
  const radius = (config.radius as number) ?? 0;

  // 占位提示
  const showPlaceholder = (config.showPlaceholder as boolean) ?? false;
  const placeholderText = (config.placeholderText as string) || "间距";
  const placeholderColor = (config.placeholderColor as string) || "rgba(255,255,255,0.3)";
  const placeholderFontSize = (config.placeholderFontSize as number) ?? 12;
  const placeholderBgColor = (config.placeholderBgColor as string) || "rgba(255,255,255,0.08)";

  // 编辑模式自动提示：未开启任何视觉配置时，自动显示虚线边框 + 提示
  const isEditMode = mode === "edit";
  const hasVisualConfig = bgEnabled || borderEnabled || showPlaceholder;
  const showEditHint = isEditMode && !hasVisualConfig;

  // 计算最终样式
  const finalBg = bgEnabled ? bgColor : "transparent";
  const finalBorder = borderEnabled
    ? `${borderWidth}px ${borderStyle} ${borderColor}`
    : showEditHint
      ? `1px dashed rgba(255,255,255,0.12)`
      : "none";
  const finalRadius = `${radius}px`;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        backgroundColor: finalBg,
        border: finalBorder,
        borderRadius: finalRadius,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* 用户主动开启的占位提示 */}
      {showPlaceholder && (
        <Box
          sx={{
            fontSize: `${placeholderFontSize}px`,
            color: placeholderColor,
            backgroundColor: placeholderBgColor,
            padding: "2px 8px",
            borderRadius: "4px",
            userSelect: "none",
            lineHeight: 1.4,
          }}
        >
          {placeholderText}
        </Box>
      )}
      {/* 编辑模式自动提示（未开启任何视觉配置时） */}
      {showEditHint && (
        <Typography
          sx={{
            fontSize: 11,
            color: "rgba(255,255,255,0.25)",
            userSelect: "none",
            fontStyle: "italic",
          }}
        >
          {placeholderText}
        </Typography>
      )}
    </Box>
  );
}

/**
 * 分隔线渲染：水平/垂直方向，可选标签文字
 * labelAlign 在水平模式下控制标签左右位置，在垂直模式下映射为上下位置
 */
function DividerView({ config }: { config: Record<string, unknown> }) {
  const orientation = (config.orientation as string) || "horizontal";
  const borderStyle = (config.borderStyle as string) || "dashed";
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.15)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const label = (config.label as string) || "";
  const labelAlign = (config.labelAlign as string) || "center";
  const labelColor = (config.labelColor as string) || "rgba(255,255,255,0.5)";
  const labelFontSize = (config.labelFontSize as number) ?? 12;

  const lineBorder = `${borderWidth}px ${borderStyle} ${borderColor}`;

  // —— 垂直分隔线 ——
  if (orientation === "vertical") {
    if (!label) {
      return (
        <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center" }}>
          <Box sx={{ height: "100%", borderLeft: lineBorder }} />
        </Box>
      );
    }
    // 带标签：left→标签在顶部，center→居中，right→标签在底部
    const showTop = labelAlign !== "left";
    const showBottom = labelAlign !== "right";
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {showTop && <Box sx={{ flex: 1, borderLeft: lineBorder }} />}
        <Box
          sx={{
            color: labelColor,
            fontSize: `${labelFontSize}px`,
            whiteSpace: "nowrap",
            padding: "4px 0",
            userSelect: "none",
          }}
        >
          {label}
        </Box>
        {showBottom && <Box sx={{ flex: 1, borderLeft: lineBorder }} />}
      </Box>
    );
  }

  // —— 水平分隔线 ——
  if (!label) {
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
        <Box sx={{ width: "100%", borderTop: lineBorder }} />
      </Box>
    );
  }
  // 带标签：left→标签在左侧，center→居中，right→标签在右侧
  const showLeft = labelAlign !== "left";
  const showRight = labelAlign !== "right";
  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
      {showLeft && <Box sx={{ flex: 1, borderTop: lineBorder }} />}
      <Box
        sx={{
          color: labelColor,
          fontSize: `${labelFontSize}px`,
          whiteSpace: "nowrap",
          padding: "0 8px",
          userSelect: "none",
        }}
      >
        {label}
      </Box>
      {showRight && <Box sx={{ flex: 1, borderTop: lineBorder }} />}
    </Box>
  );
}
