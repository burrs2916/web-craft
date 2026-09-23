import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { resolveTableData } from "../data/tableData";
import { resolveTableStyle, tableColumnCount } from "../data/tableStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 表格（table）编辑区渲染器 —— 与发布端 `codegen/components/table.ts` **结构同构**。
 *
 * 与旧实现的差别（都是"双端漂移"或"交互缺陷"级别的问题）：
 * 1. **未透传 dataSourceId** —— 编辑区不消费全局数据源绑定，发布端（engine.withEffectiveConfig）
 *    却消费：同一份配置"画布没数据、发布后有数据"。现两端都走同一套绑定语义。
 * 2. 数据解析各写一份（`parseHeaders/parseRows/resolveApiTableData`）→ 收口到 `data/tableData.ts`。
 * 3. 样式字面量各写一份 → 收口到 `data/tableStyle.ts`（声明对象两端共用）。
 * 4. 补齐：显示表头 / 表头高度 / 密度与单元格内边距 / 边框线型 / 行悬浮高亮 / 固定表头 /
 *    空态（文案+配色）/ 单条记录对象的归一。
 *
 * 「行悬浮高亮」在发布端必须由类规则承载（状态属性不能走 inline），编辑区用 sx 的 `&:hover`，
 * 两者最终色值由同一份 `resolveTableStyle().hoverBg` 决定。
 */
export function TableRenderer({ config }: ComponentRendererProps) {
  const dataMode = (config.dataMode as string) || "static";
  const isApi = dataMode === "api";

  const { data: fetchedData, error: apiError, loading } = useApiDataFetch<unknown>({
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
    /** 全局数据源绑定：编辑区与发布端共用同一套覆盖语义（shared/resolveDataConfig） */
    dataSourceId: (config.dataSourceId as string) || "",
  });

  const { headers, rows } = resolveTableData({ config, fetched: fetchedData, isApi });
  const s = resolveTableStyle(config);

  const colCount = tableColumnCount({ headers, rows });
  const showEmpty = colCount > 0 && rows.length === 0;
  const showNothing = colCount === 0;

  const thSx = s.th;
  const stickySx = s.stickyHeader
    ? { position: "sticky", top: 0, zIndex: 1 }
    : {};

  return (
    <Box sx={s.outer}>
      {showNothing ? (
        <Box sx={{ ...s.emptyTd, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isApi ? "加载中…" : s.emptyText}
        </Box>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: `${s.rowFontSize}px`,
            "& th, & td": { boxSizing: "border-box" },
            ...(s.hoverBg
              ? { "& tbody tr:hover td": { backgroundColor: s.hoverBg } }
              : {}),
          }}
        >
          {s.showHeader && (
            <Box component="thead">
              <Box component="tr">
                {headers.map((h, i) => (
                  <Box component="th" key={i} sx={{ ...thSx, ...stickySx }}>{h}</Box>
                ))}
                {colCount > headers.length &&
                  Array.from({ length: colCount - headers.length }).map((_, i) => (
                    <Box component="th" key={`pad-${i}`} sx={{ ...thSx, ...stickySx }} />
                  ))}
              </Box>
            </Box>
          )}
          <Box component="tbody">
            {showEmpty ? (
              <Box component="tr">
                <Box component="td" colSpan={colCount} sx={{ ...s.emptyTd }}>
                  {isApi && loading ? "加载中…" : isApi && apiError ? apiError : s.emptyText}
                </Box>
              </Box>
            ) : (
              rows.map((row, ri) => (
                <Box component="tr" key={ri}>
                  {Array.from({ length: colCount }).map((_, ci) => (
                    <Box component="td" key={ci} sx={s.td(ri)}>
                      {row[ci] ?? ""}
                    </Box>
                  ))}
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}
      {isApi && apiError && !showNothing && rows.length > 0 && (
        <Box sx={{ color: "#F44336", fontSize: 11, p: 1, textAlign: "center" }}>{apiError}</Box>
      )}
    </Box>
  );
}
