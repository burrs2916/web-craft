import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { resolveIcon } from "../plugins/IconResolver";
import {
  MONTH_LABELS,
  buildMonthGrid,
  indexCalendarMarks,
  isWeekendColumn,
  parseDateValue,
  resolveCalendarMarks,
  toDateKey,
  weekdayLabels,
} from "../data/tableData";
import { resolveCalendarStyle } from "../data/tableStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 日历（calendar）编辑区渲染器 —— 与发布端 `codegen/components/calendar.ts` 结构同构。
 *
 * 与旧实现的差别：
 * 1. **旧实现完全没有数据源能力** —— 面板没有数据源字段，接口驱动的"日期标记/事件"无处配置。
 *    现补上静态/接口两种模式 + 认证三态 + 全局数据源绑定（与表格族其余组件同一套）。
 * 2. 日期网格/星期表头/月名/周末判定/默认日期解析全部收口到 `data/tableData.ts`（原两端各写一份）。
 * 3. 配色/字号/圆角/网格线/今日高亮全部走 `data/tableStyle.ts`，两端同一批字面量。
 * 4. 补齐：显示月份导航 / 星期栏独立配色 / 网格线开关 / 今日背景色 / 只读。
 */
export function CalendarRenderer({ config, mode }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const s = resolveCalendarStyle(config);
  const disabled = config.disabled === true;
  const interactive = isPreview && !disabled;
  const weekStartsOn = Number(config.weekStartsOn ?? 0) === 1 ? 1 : 0;

  const initial = useMemo(() => parseDateValue(config.value), [config.value]);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [selectedDate, setSelectedDate] = useState(toDateKey(initial.year, initial.month, initial.day));

  useEffect(() => {
    setViewYear(initial.year);
    setViewMonth(initial.month);
  }, [initial.year, initial.month]);

  // ── 数据源：静态 / 接口（认证三态 + 全局数据源绑定），驱动日期标记 ──
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
  const markIndex = useMemo(
    () => indexCalendarMarks(resolveCalendarMarks({ config, fetched })),
    [config, fetched],
  );

  const cells = buildMonthGrid(viewYear, viewMonth, weekStartsOn);
  const rowCount = Math.max(1, cells.length / 7);
  const weekdays = weekdayLabels(weekStartsOn);
  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const cellHeightCss = s.fillHeight ? "100%" : `${s.cellHeight}px`;
  const gridLine = s.showGridLines ? `1px solid ${s.gridLineColor}` : "none";

  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {config.showNav !== false && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px", marginBottom: "4px", flexShrink: 0 }}>
          <Box
            onClick={() => {
              if (!interactive) return;
              if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
              else setViewMonth(viewMonth - 1);
            }}
            sx={{
              cursor: interactive ? "pointer" : "default",
              display: "flex",
              borderRadius: "4px",
              "&:hover": interactive ? { backgroundColor: s.headerBg } : {},
            }}
          >
            {resolveIcon("material:chevron_left", s.headerColor, 18)}
          </Box>
          <Box component="span" sx={{ fontSize: `${s.headerFontSize}px`, color: s.headerColor, fontWeight: 600 }}>
            {viewYear}年 {MONTH_LABELS[viewMonth]}
          </Box>
          <Box
            onClick={() => {
              if (!interactive) return;
              if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
              else setViewMonth(viewMonth + 1);
            }}
            sx={{
              cursor: interactive ? "pointer" : "default",
              display: "flex",
              borderRadius: "4px",
              "&:hover": interactive ? { backgroundColor: s.headerBg } : {},
            }}
          >
            {resolveIcon("material:chevron_right", s.headerColor, 18)}
          </Box>
        </Box>
      )}

      {/* 星期表头 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          backgroundColor: s.headerBg,
          borderRadius: `${s.radius}px ${s.radius}px 0 0`,
          flexShrink: 0,
        }}
      >
        {weekdays.map((wd, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: `${Math.max(16, s.cellHeight * 0.6)}px`,
              color: s.showWeekend && isWeekendColumn(i, weekStartsOn) ? s.weekendColor : s.weekdayColor,
              fontSize: `${s.weekdayFontSize}px`,
              fontWeight: s.showWeekend ? 500 : 400,
            }}
          >
            {wd}
          </Box>
        ))}
      </Box>

      {/* 日期网格 */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          flex: 1,
          minHeight: 0,
          ...(s.fillHeight ? { gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` } : {}),
        }}
      >
        {cells.map((day, i) => {
          const borderBottom = `1px solid ${gridLine === "none" ? "transparent" : s.gridLineColor}`;
          const borderRight = i % 7 !== 6 ? borderBottom : "none";
          if (day === null) {
            return <Box key={i} sx={{ height: cellHeightCss, borderBottom, borderRight }} />;
          }
          const dateKey = toDateKey(viewYear, viewMonth, day);
          const isSelected = dateKey === selectedDate;
          const isToday = s.showToday && dateKey === todayKey;
          const dow = new Date(viewYear, viewMonth, day).getDay();
          const isWeekend = s.showWeekend && (dow === 0 || dow === 6);
          const marks = markIndex.get(dateKey) ?? [];

          return (
            <Box
              key={i}
              onClick={() => {
                if (!interactive) return;
                setSelectedDate(dateKey);
              }}
              sx={{
                height: cellHeightCss,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
                cursor: interactive ? "pointer" : "default",
                borderBottom,
                borderRight,
                backgroundColor: isSelected ? s.selectedBg : isToday && s.todayBg !== "transparent" ? s.todayBg : "transparent",
                color: isSelected ? s.selectedText : isWeekend ? s.weekendColor : s.dayColor,
                fontSize: `${s.fontSize}px`,
                fontWeight: isToday ? 700 : 400,
                "&:hover": interactive && !isSelected ? { backgroundColor: "rgba(255,255,255,0.06)" } : {},
              }}
            >
              {isToday && !isSelected && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: "2px",
                    borderRadius: `${s.radius}px`,
                    border: `1.5px solid ${s.todayBorderColor}`,
                    pointerEvents: "none",
                  }}
                />
              )}
              <Box sx={{ position: "relative", zIndex: 1, lineHeight: 1.1 }}>{day}</Box>
              {config.showMarkDot !== false && marks.length > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    gap: "2px",
                    marginTop: "2px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {marks.slice(0, 3).map((_, mi) => (
                    <Box
                      key={mi}
                      sx={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        backgroundColor: isSelected ? s.selectedText : marks[mi].color || s.markDotColor,
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
