import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

interface StepItem {
  title: string;
  description: string;
}

const DEFAULT_STEPS: StepItem[] = [
  { title: "步骤一", description: "填写信息" },
  { title: "步骤二", description: "确认信息" },
  { title: "步骤三", description: "完成提交" },
];

function parseSteps(input: unknown): StepItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? `步骤 ${i + 1}`),
      description: String((item as Record<string, unknown>)?.description ?? (item as Record<string, unknown>)?.desc ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? `步骤 ${i + 1}`),
            description: String(item?.description ?? item?.desc ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "步骤 1", description: "" }];
        }
      } catch {
        // fall through
      }
    }
    // Plain text: one step per line
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, description: "" }));
    }
  }
  return [...DEFAULT_STEPS];
}

export function StepsRenderer({ config }: ComponentRendererProps) {
  // ── 数据获取 ──
  const dataMode = (config.dataMode as string) || "static";
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  // 与 codegen 一致：dataMode=api 且配置了接口才真正走 API（否则回退静态占位）
  const isApi = dataMode === "api" && (String(config.apiUrl ?? "") || String(config.apiPath ?? ""));

  const { data: fetchedData } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  // ── 解析步骤与当前索引 ──
  // 响应形态（与 codegen mount 对齐）：数组/JSON 字符串 → 步骤列表；
  // 数字 → 当前索引；对象 {steps|items|list, current} → 二者皆可
  let steps = parseSteps(config.steps);
  let current = (config.current as number) ?? 0;
  if (isApi || hasExplicitStaticData) {
    const data = fetchedData;
    if (Array.isArray(data) || typeof data === "string") {
      steps = parseSteps(data);
    } else if (typeof data === "number" && Number.isFinite(data)) {
      current = data;
    } else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const rawList = Array.isArray(obj.steps) ? obj.steps
        : Array.isArray(obj.items) ? obj.items
        : Array.isArray(obj.list) ? obj.list
        : null;
      if (rawList && rawList.length > 0) {
        steps = parseSteps(rawList);
      }
      if (obj.current != null && Number.isFinite(Number(obj.current))) {
        current = Number(obj.current);
      }
    }
  }

  const direction = (config.direction as string) ?? "horizontal";
  const variant = (config.variant as string) ?? "dot";
  const showDescription = (config.showDescription as boolean) ?? true;
  const showLastConnector = (config.showLastConnector as boolean) ?? false;

  const activeColor = (config.activeColor as string) ?? "#FF9800";
  const completedColor = (config.completedColor as string) ?? "#4CAF50";
  const pendingColor = (config.pendingColor as string) ?? "rgba(255,255,255,0.25)";
  const activeBgColor = (config.activeBgColor as string) ?? "rgba(255,152,0,0.15)";
  const completedBgColor = (config.completedBgColor as string) ?? "rgba(76,175,80,0.15)";
  const connectorColor = (config.connectorColor as string) ?? "rgba(255,255,255,0.15)";
  const titleColor = (config.titleColor as string) ?? "rgba(255,255,255,0.85)";
  const titleFontSize = (config.titleFontSize as number) ?? 14;
  const descColor = (config.descColor as string) ?? "rgba(255,255,255,0.45)";
  const descFontSize = (config.descFontSize as number) ?? 12;
  const stepSize = (config.stepSize as number) ?? 28;

  const isHorizontal = direction === "horizontal";
  const safeCurrent = Math.max(0, Math.min(current, steps.length - 1));

  // ── 组件库缩略图：极小画布下采用紧凑示意图，避免挤压裁剪；非缩略图水平模式内容垂直居中 ──
  const isThumb = config._thumbnail === true;
  const thumb = isThumb;
  const effStepSize = thumb ? 16 : stepSize;
  const effPadding = thumb ? 6 : 4;
  // 垂直模式容器不插入行 gap：圆点间的间距由连接线自身承接，
  // 否则容器 gap 会在两圆点之间切断连接线（线断开）；水平模式保留配置间距
  const effGap = thumb ? 0 : (isHorizontal ? ((config.gap as number) ?? 0) : 0);
  // 垂直缩略图：连接线 min-height 足够小（8px），使默认 3 步内容高度不溢出、
  // 避免 flex 居中在溢出时被"不安全居中"拉到起始端而看起来不居中
  const effConnMinLen = thumb ? 8 : 24;

  const getStepState = (index: number): "completed" | "active" | "pending" => {
    if (index < safeCurrent) return "completed";
    if (index === safeCurrent) return "active";
    return "pending";
  };

  const getColor = (state: string): string => {
    if (state === "completed") return completedColor;
    if (state === "active") return activeColor;
    return pendingColor;
  };

  const getBgColor = (state: string): string => {
    if (state === "completed") return completedBgColor;
    if (state === "active") return activeBgColor;
    return "transparent";
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        // 垂直模式：顶部起始、中部连接线撑高填满高度（上下边距小），画像在水平方向居中
        alignItems: thumb ? "center" : (isHorizontal ? "stretch" : "center"),
        justifyContent: thumb ? "center" : "flex-start",
        gap: `${effGap}px`,
        overflow: "auto",
        padding: `${effPadding}px`,
        boxSizing: "border-box",
      }}
    >
      {steps.map((step, i) => {
        const state = getStepState(i);
        const color = getColor(state);
        const bgColor = getBgColor(state);
        const isLast = i === steps.length - 1;
        // 右连接线：水平/垂直统一在"非末步"或"末步且开启闭环"时着色；否则透明占位
        const needsRight = thumb ? !isLast : (!isLast || showLastConnector);
        // 左连接线：仅水平用于对称占位使圆点居中，首步透明
        const needsLeft = !thumb && isHorizontal && i > 0;

        return (
          <Box
            key={i}
            sx={{
              display: "flex",
              flexDirection: isHorizontal ? "column" : "row",
              alignItems: thumb ? "center" : (isHorizontal ? "center" : "flex-start"),
              // 缩略图双向居中、水平模式内容在铺满后的步骤内居中；垂直非缩略图保持圆点左列 + 文字铺满
              justifyContent: thumb || isHorizontal ? "center" : undefined,
              // 水平：步骤铺满整行；垂直：仅带连接线的步骤拉伸撑高（连接线随之增长），
              // 末步无连接线则内容自适应，避免在后一步下方留出大空档
              flex: thumb ? "0 0 auto" : (isHorizontal ? 1 : (needsRight ? "1 1 0" : "0 0 auto")),
              gap: "8px",
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {/* Step indicator */}
            <Box
              sx={{
                display: "flex",
                flexDirection: isHorizontal ? "row" : "column",
                alignItems: "center",
                justifyContent: thumb ? "center" : undefined,
                ...(isHorizontal
                  ? { width: thumb ? "auto" : "100%" }
                  : { flex: "0 0 auto", height: thumb ? "auto" : "100%" }),
              }}
            >
              {/* 水平：左连接线（为圆点留出对称空间使其与下方文字对齐） */}
              {isHorizontal && (
                <Box
                  sx={{
                    flex: 1,
                    height: "2px",
                    minWidth: thumb ? 4 : 0,
                    backgroundColor: needsLeft ? connectorColor : "transparent",
                  }}
                />
              )}

              {/* Circle */}
              <Box
                sx={{
                  width: `${effStepSize}px`,
                  height: `${effStepSize}px`,
                  borderRadius: variant === "square" ? "4px" : "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: bgColor,
                  border: `2px solid ${color}`,
                  color: color,
                  fontSize: `${effStepSize * 0.5}px`,
                  fontWeight: 600,
                  flexShrink: 0,
                  transition: "all 0.3s ease",
                }}
              >
                {state === "completed" ? (
                  <CheckIcon sx={{ fontSize: `${effStepSize * 0.6}px` }} />
                ) : (
                  variant === "number" ? i + 1 : null
                )}
              </Box>

              {/* 右连接线：水平=向后延伸；垂直=向下拉伸填满剩余高度 */}
              {isHorizontal ? (
                <Box
                  sx={{
                    flex: 1,
                    height: "2px",
                    minWidth: thumb ? 4 : 0,
                    backgroundColor: needsRight ? connectorColor : "transparent",
                  }}
                />
              ) : (
                needsRight && (
                  <Box
                    sx={{
                      flex: 1,
                      width: "2px",
                      minHeight: `${effConnMinLen}px`,
                      backgroundColor: connectorColor,
                    }}
                  />
                )
              )}
            </Box>

            {/* Text */}
            {!thumb && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isHorizontal ? "center" : "flex-start",
                  textAlign: isHorizontal ? "center" : "left",
                  gap: "2px",
                  minWidth: 0,
                  ...(isHorizontal ? { width: "100%" } : { marginLeft: "12px" }),
                }}
              >
                <Typography
                  sx={{
                    color: state === "pending" ? descColor : titleColor,
                    fontSize: `${titleFontSize}px`,
                    fontWeight: state === "active" ? 600 : 400,
                    lineHeight: 1.4,
                  }}
                >
                  {step.title}
                </Typography>
                {showDescription && step.description && (
                  <Typography
                    sx={{
                      color: descColor,
                      fontSize: `${descFontSize}px`,
                      lineHeight: 1.3,
                    }}
                  >
                    {step.description}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
