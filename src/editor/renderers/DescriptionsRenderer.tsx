import { useMemo } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { padDescriptionItems, resolveDescriptionItems } from "../data/tableData";
import { resolveDescriptionsStyle } from "../data/tableStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 描述列表（descriptions）编辑区渲染器 —— 与发布端 `codegen/components/descriptions.ts` 结构同构。
 *
 * 修掉的既有缺陷：
 * 1. **水平布局的网格模板两端不一致（真实可见的排版差异）**：
 *    编辑区写 `repeat(N, 100/N%)`（N 条轨道，于是 1 条记录占满一行），
 *    发布端写 `repeat(N, 1fr 2fr)`（2N 条轨道，于是 N 条记录挤在一行）——
 *    同一份配置"画布上一列一条、发布后一行多条"。现两端统一为
 *    `repeat(N, minmax(0,1fr) minmax(0,2fr))`（可用"标签列宽度"改成固定像素）。
 * 2. **未透传 dataSourceId**：编辑区不消费全局数据源绑定，发布端消费 → 画布无数据。
 * 3. 数据解析（parseItems/toDescItems/默认项）与样式字面量全部收口到 data 层，两端不再各写一份。
 * 4. 新增：标签列宽度 / 标签与值各自对齐 / 隔行变色 / 标题配色字号 / 标签字重。
 */
export function DescriptionsRenderer({ config }: ComponentRendererProps) {
  const dataMode = (config.dataMode as string) || "static";
  const isApi = dataMode === "api";

  const { data: fetched } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: config.staticData != null && config.staticData !== "" ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
    dataSourceId: (config.dataSourceId as string) || "",
  });

  const items = useMemo(() => resolveDescriptionItems({ config, fetched }), [config, fetched]);
  const s = resolveDescriptionsStyle(config);
  const title = String(config.title ?? "");

  const cellBorder = s.borderEnabled ? `1px solid ${s.borderColor}` : "none";

  if (s.layout === "vertical") {
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
        {title && (
          <Box component="div" sx={{ fontSize: `${s.titleFontSize}px`, fontWeight: 600, color: s.titleColor, marginBottom: "8px", padding: "0 4px" }}>
            {title}
          </Box>
        )}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: `${s.gap}px` }}>
          {items.map((item, i) => (
            <Box
              key={i}
              sx={{
                flex: `0 0 calc(${100 / s.columns}% - ${(s.gap * (s.columns - 1)) / s.columns}px)`,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  padding: "4px 8px",
                  backgroundColor: s.labelBg,
                  color: s.labelColor,
                  fontSize: `${s.fontSize}px`,
                  fontWeight: s.labelFontWeight,
                  textAlign: s.labelAlign,
                  border: s.borderEnabled ? `1px solid ${s.borderColor}` : "none",
                  borderRadius: `${s.radius}px ${s.radius}px 0 0`,
                }}
              >
                {item.label}
              </Box>
              <Box
                sx={{
                  padding: "4px 8px",
                  color: s.valueColor,
                  fontSize: `${s.fontSize}px`,
                  textAlign: s.valueAlign,
                  border: s.borderEnabled ? `1px solid ${s.borderColor}` : "none",
                  borderTop: "none",
                  borderRadius: `0 0 ${s.radius}px ${s.radius}px`,
                }}
              >
                {item.value || "—"}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  // ── 水平布局：标签列 + 值列交替，两端同一张网格模板 ──
  const padded = padDescriptionItems(items, s.columns);
  const labelTrack = s.labelWidth > 0 ? `${s.labelWidth}px` : "minmax(0,1fr)";
  const gridTemplateColumns = `repeat(${s.columns}, ${labelTrack} minmax(0,2fr))`;

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      {title && (
        <Box component="div" sx={{ fontSize: `${s.titleFontSize}px`, fontWeight: 600, color: s.titleColor, marginBottom: "8px", padding: "0 4px" }}>
          {title}
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns,
          border: s.borderEnabled ? `1px solid ${s.borderColor}` : "none",
          borderRadius: `${s.radius}px`,
          overflow: "hidden",
        }}
      >
        {padded.map((item, i) => {
          const isLabelCol = i % 2 === 0;
          const rowIndex = Math.floor(i / (s.columns * 2));
          const striped = s.striped && rowIndex % 2 === 1;
          return (
            <Box
              key={i}
              sx={{
                padding: "6px 10px",
                fontSize: `${s.fontSize}px`,
                backgroundColor: isLabelCol ? s.labelBg : striped ? "rgba(255,255,255,0.03)" : "transparent",
                color: isLabelCol ? s.labelColor : s.valueColor,
                fontWeight: isLabelCol ? s.labelFontWeight : 400,
                textAlign: isLabelCol ? s.labelAlign : s.valueAlign,
                borderBottom: cellBorder,
                borderRight: i % (s.columns * 2) < s.columns * 2 - 1 ? cellBorder : "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isLabelCol ? item.label : item.value || "—"}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
