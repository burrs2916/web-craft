import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";

/**
 * 分割线组件渲染器（水平 divider / 垂直 divider-vertical 共用）
 * 相对拖动框居中：水平线垂直居中，垂直线水平居中。
 * 支持实线/虚线/点线/渐变，水平支持文字，均支持内边距与对齐。
 */
export function DividerRenderer({ config }: ComponentRendererProps) {
  const isVertical = config.orientation === "vertical";
  const isThumb = config._thumbnail === true;
  const variant = (config.variant as string) ?? "solid";
  const color = (config.color as string) || "rgba(255,255,255,0.12)";
  const gradientColor = (config.gradientColor as string) || color;
  const thickness = isThumb ? Math.max(1, (config.thickness as number) ?? 1) : ((config.thickness as number) ?? 1);

  const borderStyle = variant === "dashed" ? "dashed" : variant === "dotted" ? "dotted" : "solid";
  const isGradient = variant === "gradient";

  // —— 垂直分割线 ——
  if (isVertical) {
    const paddingX = isThumb ? 0 : ((config.paddingX as number) ?? 8);
    const paddingY = isThumb ? 0 : ((config.paddingY as number) ?? 0);
    const align = vAlignToFlex((config.align as string) ?? "center");
    const heightMode = isThumb ? "fixed" : ((config.heightMode as string) || "full");
    const heightValue = isThumb ? 24 : ((config.heightValue as number) ?? 120);
    const height = heightMode === "fixed" ? `${heightValue}px` : "100%";

    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <Box
          sx={{
            width: `${thickness}px`,
            height,
            flexShrink: 0,
            alignSelf: align, // top/center/bottom
            ...(isGradient
              ? { background: `linear-gradient(to bottom, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent)`, borderRadius: `${thickness}px` }
              : { borderLeft: `${thickness}px ${borderStyle} ${color}` }),
          }}
        />
      </Box>
    );
  }

  // —— 水平分割线 ——
  const paddingX = isThumb ? 2 : ((config.paddingX as number) ?? 8);
  const paddingY = isThumb ? 0 : ((config.paddingY as number) ?? 0);
  const gap = isThumb ? 12 : ((config.gap as number) ?? 12);
  const align = (config.align as string) ?? "center";
  const widthMode = isThumb ? "full" : ((config.widthMode as string) || "full");
  const widthValue = isThumb ? 0 : ((config.widthValue as number) ?? 320);
  const width = widthMode === "fixed" ? `${widthValue}px` : "100%";

  const textAlign = (config.textAlign as string) ?? "center";
  const fontSize = isThumb ? 10 : ((config.fontSize as number) ?? 14);
  const textColor = (config.textColor as string) || "rgba(255,255,255,0.6)";
  const textBg = (config.textBg as string) || "transparent";
  const text = String(config.text ?? "");

  const lineBox = (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        ...(isGradient
          ? { height: `${thickness}px`, background: `linear-gradient(to right, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent)`, borderRadius: `${thickness}px` }
          : { borderTop: `${thickness}px ${borderStyle} ${color}` }),
      }}
    />
  );

  // 外层：垂直居中 + 水平位置对齐（align 控制）
  const rowAlign = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

  if (text) {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: rowAlign,
          overflow: "hidden",
          boxSizing: "border-box",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        <Box
          sx={{
            width,
            display: "flex",
            alignItems: "center",
            gap: `${gap}px`,
            flexShrink: 0,
            ...(isThumb ? { maxWidth: "92%" } : {}),
          }}
        >
          {textAlign !== "left" && lineBox}
          <Typography
            component="span"
            sx={{
              fontSize: `${fontSize}px`,
              color: textColor,
              backgroundColor: textBg,
              padding: textBg !== "transparent" ? "2px 8px" : 0,
              borderRadius: textBg !== "transparent" ? 4 : 0,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {text}
          </Typography>
          {textAlign !== "right" && lineBox}
        </Box>
      </Box>
    );
  }

  // 纯水平线：垂直居中 + 水平对齐
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: rowAlign,
        overflow: "hidden",
        boxSizing: "border-box",
        padding: `${paddingY}px ${paddingX}px`,
      }}
    >
      <Box sx={{ width, minHeight: 0, ...(isGradient
        ? { height: `${thickness}px`, background: `linear-gradient(to right, transparent, ${color} 20%, ${gradientColor} 50%, ${color} 80%, transparent)`, borderRadius: `${thickness}px` }
        : { borderTop: `${thickness}px ${borderStyle} ${color}` }) }} />
    </Box>
  );
}

/** 垂直对齐归一化：select 值(top/center/bottom) -> CSS alignSelf */
function vAlignToFlex(v: string): "flex-start" | "center" | "flex-end" {
  if (v === "top") return "flex-start";
  if (v === "bottom") return "flex-end";
  return "center";
}