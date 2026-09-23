import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import {
  collectBranchKeys,
  collectKeysByLevel,
  resolveTreeData,
  type TreeNodeModel,
} from "../data/tableData";
import { resolveTreeStyle } from "../data/tableStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 树形控件（tree）编辑区渲染器 —— 与发布端 `codegen/components/tree.ts` 结构同构。
 *
 * 修掉的既有缺陷：
 * 1. **未透传 dataSourceId**：编辑区不消费全局数据源绑定，发布端（engine.withEffectiveConfig）
 *    却消费 → "画布上是静态树、发布后变成全局源的数据"。现两端同一套绑定语义。
 * 2. 树的默认数据/归一规则/展开键算法两端各写一份 → 收口到 `data/tableData.ts`。
 * 3. 「默认全部展开」只有布尔，没有层级概念 → 改为 `defaultExpandLevel`（0 全折叠 / 99 全展开）。
 * 4. 补齐：显示箭头 / 连接线 / 缩进 / 行高 / 节点圆角 / 选中背景色 / 空态。
 */
export function TreeRenderer({ config }: ComponentRendererProps) {
  const s = resolveTreeStyle(config);
  const disabled = s.disabled;

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

  const data = useMemo(() => resolveTreeData({ config, fetched }), [config, fetched]);
  const expandLevel = Number(config.defaultExpandLevel ?? 99);

  const defaultExpanded = useMemo(() => {
    const keys = expandLevel >= 99 ? collectBranchKeys(data) : collectKeysByLevel(data, expandLevel);
    return new Set<string>(keys);
  }, [data, expandLevel]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);
  const [selected, setSelected] = useState<string>("");

  // 数据/展开层级变化时重置展开集合（否则旧键残留会串到新树上）
  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const toggle = (key: string) => {
    if (disabled) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node: TreeNodeModel, key: string, level: number): React.ReactNode => {
    const hasChildren = !!(node.children && node.children.length > 0);
    const isExpanded = expanded.has(key);
    const isSelected = selected === key;

    return (
      <Box key={key} sx={{ display: "flex", flexDirection: "column", position: "relative" }}>
        {/* 连接线：父级列位置的一条竖线（仅在有子节点且展开时绘制） */}
        {s.showLine && hasChildren && isExpanded && (
          <Box
            sx={{
              position: "absolute",
              left: `${level * s.indent + 7}px`,
              top: `${s.rowHeight || 22}px`,
              bottom: "0px",
              width: "1px",
              backgroundColor: s.lineColor,
              pointerEvents: "none",
            }}
          />
        )}
        <Box
          onClick={() => {
            if (disabled) return;
            if (hasChildren) toggle(key);
            setSelected(key);
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 6px",
            marginLeft: `${level * s.indent}px`,
            height: s.rowHeight > 0 ? `${s.rowHeight}px` : undefined,
            cursor: disabled ? "default" : "pointer",
            borderRadius: `${s.radius}px`,
            backgroundColor: isSelected ? s.activeBg : "transparent",
            "&:hover": disabled ? {} : { backgroundColor: isSelected ? s.activeBg : s.hoverBg },
            userSelect: "none",
            position: "relative",
            zIndex: 1,
          }}
        >
          {hasChildren && s.showIcon ? (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                color: s.iconColor,
                flexShrink: 0,
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                lineHeight: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5z" fill="currentColor" />
              </svg>
            </Box>
          ) : (
            <Box
              component="span"
              sx={{
                display: "inline-flex",
                color: s.leafIconColor,
                flexShrink: 0,
                marginLeft: "5px",
                lineHeight: 0,
              }}
            >
              <svg width="6" height="6" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8" fill="currentColor" />
              </svg>
            </Box>
          )}
          <Box
            component="span"
            sx={{
              fontSize: `${s.fontSize}px`,
              color: isSelected ? s.activeColor : s.textColor,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.label}
          </Box>
        </Box>
        {hasChildren && isExpanded && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: `${s.gap}px` }}>
            {node.children!.map((child, i) => renderNode(child, `${key}-${i}`, level + 1))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={s.outer}>
      {data.length === 0 ? (
        <Box sx={{ color: s.textColor, fontSize: `${s.fontSize}px`, padding: "8px", textAlign: "center", opacity: 0.6 }}>
          {s.emptyText}
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: `${s.gap}px` }}>
          {data.map((node, i) => renderNode(node, `${i}`, 0))}
        </Box>
      )}
    </Box>
  );
}
