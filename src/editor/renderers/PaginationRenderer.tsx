import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useBoxSize } from "../hooks/useBoxSize";
import { resolveIcon } from "../plugins/IconResolver";
import { buildPaginationModel, normalizePaginationTotal } from "../data/tableData";
import { PAGINATION_FIT, resolvePaginationStyle, paginationTexts } from "../data/tableStyle";
import { fitFactor } from "../data/scaleFit";
import { readAuthEnabled } from "../data/authMode";

/**
 * 分页（pagination）编辑区渲染器 —— 与发布端 `codegen/components/pagination.ts` 结构同构。
 *
 * 修掉的既有缺陷：
 * 1. **点击页码时逐个改 inline 样式**（发布端）—— 违反「状态切换的属性只能由类规则给」，
 *    悬浮/选中态互相覆盖且过渡失效。现选中态/悬浮态一律由 `.pg-*` 类规则承载，两端同一套。
 * 2. **发布端用 `document.querySelectorAll` 全局选按钮** —— 同一页面放两个分页实例会互相串扰。
 *    现所有选择器都限定在自身 uid 容器内。
 * 3. **页码范围算法两端各写一份** —— 收口到 `data/tableData.ts` 的 `buildPaginationModel`。
 * 4. 新增：接口驱动总数（认证/非认证两种接入）、只读、水平对齐、随拖动框等比缩放（两端同一公式）。
 */
export function PaginationRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const s = resolvePaginationStyle(config);
  const disabled = config.disabled === true;
  const interactive = isPreview && !disabled;
  const scaleFit = config.scaleFit !== false;

  // ── 接口驱动总数（与发布端同一套取数骨架 + 认证三态 + 全局数据源绑定） ──
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
  const totalFromApi = isApi ? normalizePaginationTotal(fetched) : null;
  const total = totalFromApi ?? (config.total as number) ?? 100;

  const model = buildPaginationModel({
    current: config.current,
    pageSize: config.pageSize,
    total,
    maxButtons: config.maxButtons,
  });

  // ── 交互（仅预览模式）：选中页在内部状态里翻转 ──
  const [activePage, setActivePage] = useState(model.current);
  useEffect(() => {
    setActivePage(model.current);
  }, [model.current]);
  const page = isPreview ? activePage : model.current;
  const { totalLabel, pageSizeLabel } = paginationTexts(
    model,
    config.showTotal !== false,
    config.showPageSize === true,
  );
  const showPrevNext = config.showPrevNext !== false;
  const arrowSize = s.fontSize + 4;

  // ── 随拖动框等比缩放（与发布端 scaleFitScript 同一公式） ──
  const box = useBoxSize({ w: typeof width === "number" ? width : 0, h: typeof height === "number" ? height : 0 });
  const factor = scaleFit ? fitFactor(box.w, box.h, PAGINATION_FIT) : 1;

  const itemButton = (key: string, children: React.ReactNode, opts: {
    active?: boolean;
    muted?: boolean;
    clickable?: boolean;
    onClick?: () => void;
  }) => (
    <Box
      key={key}
      data-page-item={opts.active ? "active" : undefined}
      onClick={opts.clickable ? opts.onClick : undefined}
      sx={{
        ...s.btn,
        cursor: opts.clickable ? "pointer" : "default",
        // 选中态/悬浮态：与发布端 `.pg-*-item` / `.pg-*-item.is-active` 类规则等价
        // （这里用 sx 派生规则而不是内联值，保证"状态属性不写死单个值"的一致性）
        ...(opts.muted
          ? { color: s.textColor, opacity: 0.4, pointerEvents: "none" }
          : opts.active
            ? { backgroundColor: s.activeBgColor, color: s.activeTextColor, fontWeight: 600, border: "none" }
            : {
              backgroundColor: s.bgColor,
              color: s.textColor,
              border: s.borderEnabled ? `1px solid ${s.borderColor}` : "none",
              "&:hover": opts.clickable ? { backgroundColor: s.hoverBg } : {},
            }),
      }}
    >
      {children}
    </Box>
  );

  const inner = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: `${s.gap}px`,
        transform: `scale(${factor})`,
        transformOrigin: "center center",
        flexShrink: 0,
      }}
    >
      {totalLabel && (
        <Box component="span" sx={{ fontSize: `${s.fontSize}px`, color: s.textColor, whiteSpace: "nowrap", mr: "8px" }}>
          {totalLabel}
        </Box>
      )}

      {showPrevNext &&
        itemButton("prev", <>{resolveIcon("material:chevron_left", undefined, arrowSize)}</>, {
          muted: !model.canPrev,
          clickable: interactive && model.canPrev,
          onClick: () => setActivePage(Math.max(1, page - 1)),
        })}

      {model.pageItems.map((item, i) => {
        if (item === "ellipsis") {
          return itemButton(`gap-${i}`, <>{`···`}</>, { muted: false, clickable: false });
        }
        const isActive = item === page;
        return itemButton(`p-${item}`, <>{item}</>, {
          active: isActive,
          clickable: interactive && !isActive,
          onClick: () => setActivePage(item as number),
        });
      })}

      {showPrevNext &&
        itemButton("next", <>{resolveIcon("material:chevron_right", undefined, arrowSize)}</>, {
          muted: !model.canNext,
          clickable: interactive && model.canNext,
          onClick: () => setActivePage(Math.min(model.totalPages, page + 1)),
        })}

      {pageSizeLabel && (
        <Box component="span" sx={{ fontSize: `${s.fontSize}px`, color: s.textColor, whiteSpace: "nowrap", ml: "4px" }}>
          {pageSizeLabel}
        </Box>
      )}

      {config.showQuickJumper === true && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px", ml: "4px" }}>
          <Box component="span" sx={{ fontSize: `${s.fontSize}px`, color: s.textColor, whiteSpace: "nowrap" }}>跳至</Box>
          <Box
            component="input"
            type="number"
            disabled={!interactive}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (!interactive || e.key !== "Enter") return;
              const v = Math.floor(Number((e.target as HTMLInputElement).value));
              if (Number.isFinite(v) && v >= 1 && v <= model.totalPages) setActivePage(v);
            }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (!interactive) return;
              const v = Math.floor(Number(e.target.value));
              if (Number.isFinite(v) && v >= 1 && v <= model.totalPages) setActivePage(v);
            }}
            value={page}
            sx={{
              width: "44px",
              height: `${s.btnSize}px`,
              border: s.borderEnabled ? `1px solid ${s.borderColor}` : "none",
              borderRadius: s.radiusCss,
              backgroundColor: "transparent",
              color: s.textColor,
              fontSize: `${s.fontSize}px`,
              textAlign: "center",
              outline: "none",
              fontFamily: "inherit",
              "&::-webkit-inner-spin-button": { WebkitAppearance: "none" },
            }}
          />
          <Box component="span" sx={{ fontSize: `${s.fontSize}px`, color: s.textColor, whiteSpace: "nowrap" }}>页</Box>
        </Box>
      )}
    </Box>
  );

  return (
    <Box ref={box.ref} sx={s.outer}>
      {inner}
    </Box>
  );
}
