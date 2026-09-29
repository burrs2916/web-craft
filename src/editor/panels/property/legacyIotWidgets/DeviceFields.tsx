/**
 * 设备相关字段：设备多选、键值映射、设备单选。
 * 从 legacyIotWidgets.tsx 迁出，仅做代码搬迁。
 */
import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useDataSourceStore } from '../../../../store/datasourceStore';
import { useDeviceStore } from '../../../../store/deviceStore';
import type { ConfigField } from '../../../../types/editor';
import { fieldSx, floatedLabelProps } from '../sharedStyles';

/**
 * deviceMultiSelect 字段：设备多选
 *  - 设备列表直接来自 useDeviceStore.devices（已通过 EdgeConductorProvider 加载 + 过滤）
 *  - 选中值以 string[] 存储在 config[field.key]
 *  - 连接状态从 useDataSourceStore.connectionStatuses 读
 *  - 提供"手动刷新"按钮调用 deviceStore.reload()
 *  - 若没设备 / 适配器未配置 → 给出明确提示
 *  - 支持 deviceFilter.productCode 过滤：只显示指定产品码的设备（扁平列表模式）
 *  - 无 deviceFilter 时显示完整设备树（含隶属关系）
 */
export function DeviceMultiSelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config?: Record<string, unknown>;
}) {
  // deviceFilter：控制显示和可选范围
  const deviceFilter = (field as any).deviceFilter as { productCode?: string[] } | undefined;
  const filterProductCodes = deviceFilter?.productCode;
  // 有 productCode 过滤 → 扁平列表模式（只显示匹配设备，不展示子设备树）
  const flatMode = !!filterProductCodes && filterProductCodes.length > 0;

  // 直接从 deviceStore 拿设备（已加载 + 已过滤 + 包含真实字段）
  const devicesMap = useDeviceStore((s) => s.devices) as unknown as Record<string, Record<string, unknown>>;
  const products = useDeviceStore((s) => s.products) as unknown as Record<string, { productName?: string }>;
  const reloadDevices = useDeviceStore((s) => s.reload);
  const activeProvider = useDeviceStore((s) => s.activeProvider);

  // 连接状态：取第一个启用的 http 数据源
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const connectionStatuses = useDataSourceStore((s) => s.connectionStatuses);
  const dataSource = useMemo(
    () => dataSources.find((ds) => ds.type === "http" && ds.enabled),
    [dataSources]
  );
  const connStatus = dataSource ? connectionStatuses[dataSource.id] : undefined;

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

  // 设备列表 = Object.values(devicesMap) — 已经是 DeviceInstance 完整结构
  // flatMode 下只保留匹配 productCode 的设备
  const devices = useMemo(() => {
    const all = Object.values(devicesMap).map((d) => d as unknown as Record<string, unknown>);
    if (flatMode && filterProductCodes) {
      return all.filter(d => filterProductCodes.includes(String(d.productCode ?? "")));
    }
    return all;
  }, [devicesMap, flatMode, filterProductCodes]);

  // 树形结构：父→子的递归
  //  - 根 = parentDeviceId 为空，或 parent 在设备列表里找不到
  //  - 兄弟排序：main → sub → sensor → other；同 category 按 deviceId 字典序
  //  - 搜索时：保留包含匹配子树的根（即使根本身不匹配），子节点递归过滤
  type TreeNode = {
    device: Record<string, unknown>;
    children: TreeNode[];
  };

  const sortDevices = (arr: Array<Record<string, unknown>>) => {
    const catOrder: Record<string, number> = { main: 0, sub: 1, sensor: 2 };
    return arr.sort((a, b) => {
      const ca = catOrder[String(a.category ?? "other")] ?? 9;
      const cb = catOrder[String(b.category ?? "other")] ?? 9;
      if (ca !== cb) return ca - cb;
      return String(a.deviceId).localeCompare(String(b.deviceId));
    });
  };

  const buildTree = useMemo(() => {
    const byId = new Map<string, Record<string, unknown>>();
    for (const d of devices) byId.set(String(d.deviceId), d);

    const childrenOf = new Map<string, Array<Record<string, unknown>>>();
    for (const d of devices) {
      const p = String(d.parentDeviceId ?? "");
      if (p && byId.has(p)) {
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p)!.push(d);
      }
    }
    for (const arr of childrenOf.values()) sortDevices(arr);

    // 根 = 父设备不在设备列表中
    const roots = sortDevices(
      devices.filter((d) => {
        const p = String(d.parentDeviceId ?? "");
        return !p || !byId.has(p);
      })
    );

    const build = (d: Record<string, unknown>): TreeNode => ({
      device: d,
      children: (childrenOf.get(String(d.deviceId)) || []).map(build),
    });

    return roots.map(build);
  }, [devices]);

  // 设备匹配（搜索关键字）
  const matchSelf = (d: Record<string, unknown>, kw: string): boolean => {
    if (!kw) return true;
    return [d.deviceId, d.productName, d.productCode, d.category, d.ip, d.mac, d.parentDeviceId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(kw));
  };

  // 树形结构 + 搜索过滤
  //  - 节点自身匹配 → 保留整棵子树
  //  - 子孙有匹配 → 保留该节点（即使本身不匹配），子节点递归过滤
  const filterTree = (nodes: TreeNode[], kw: string): TreeNode[] => {
    if (!kw) return nodes;
    const visit = (node: TreeNode): TreeNode | null => {
      const selfMatch = matchSelf(node.device, kw);
      const filteredChildren = node.children.map(visit).filter((c): c is TreeNode => c !== null);
      if (!selfMatch && filteredChildren.length === 0) return null;
      return { device: node.device, children: filteredChildren };
    };
    return nodes.map(visit).filter((n): n is TreeNode => n !== null);
  };

  // 全树统计 = main/sub/sensor
  const groupStats = useMemo(() => {
    const stats: Record<string, number> = { main: 0, sub: 0, sensor: 0, other: 0 };
    for (const d of devices) {
      const c = String(d.category ?? "other");
      stats[c] = (stats[c] ?? 0) + 1;
    }
    return stats;
  }, [devices]);

  // 选中计数 = 已选数 / 全树设备数
  const filteredTree = useMemo(() => {
    return filterTree(buildTree, search.trim().toLowerCase());
  }, [buildTree, search]);

  const collectAllIds = (nodes: TreeNode[]): string[] => {
    const out: string[] = [];
    const walk = (arr: TreeNode[]) => {
      for (const n of arr) {
        out.push(String(n.device.deviceId));
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(field.key, selected.filter((s) => s !== id));
    } else {
      onChange(field.key, [...selected, id]);
    }
  };

  const selectAll = () => onChange(field.key, collectAllIds(buildTree));
  const clearAll = () => onChange(field.key, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 优先调 deviceStore.reload()（使用已设置的 provider）
      if (activeProvider) {
        await reloadDevices();
      } else {
        // 没有 provider → 触发自动加载
        const { autoLoadFromAdapters } = useDeviceStore.getState() as unknown as {
          autoLoadFromAdapters: () => Promise<void>;
        };
        await autoLoadFromAdapters();
      }
    } catch (e) {
      console.warn("[DeviceMultiSelectField] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  // 连接状态文案
  const statusInfo = (() => {
    if (!dataSource) return { color: "error.main", text: "未找到边缘计算（http 类型）数据源", icon: "⚠" };
    if (!connStatus) return { color: "warning.main", text: "未测试连接（点击刷新自动连接）", icon: "?" };
    switch (connStatus.status) {
      case "connected":    return { color: "success.main", text: `已连接 ${dataSource.connection.url}`, icon: "✓" };
      case "connecting":   return { color: "info.main",    text: "正在连接...", icon: "⟳" };
      case "disconnected": return { color: "warning.main", text: "未连接", icon: "○" };
      case "failed":
      case "error":        return { color: "error.main",   text: `连接失败: ${connStatus.message || "未知错误"}`, icon: "✕" };
      default:             return { color: "text.secondary", text: connStatus.status, icon: "·" };
    }
  })();

  // 隶属关系图（父→子缩进）
  // 设备编号 = productCode + deviceId（例：18001-3），不是 productName 也不是纯 productCode
  const formatDeviceNo = (d: Record<string, unknown>): string => {
    const code = String(d.productCode ?? "").trim();
    const id = String(d.deviceId ?? "").trim();
    if (code && id) return `${code}-${id}`;
    return id || code || "—";
  };

  return (
    <Box>
      {/* 头部：标签 + 计数 */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}>{field.label}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
            已选 {selected.length}/{devices.length}
          </Typography>
          <Button
            size="small"
            variant="text"
            disabled={refreshing}
            onClick={handleRefresh}
            sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }}
          >
            {refreshing ? "刷新中..." : "刷新"}
          </Button>
        </Box>
      </Box>

      {/* 连接状态 */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 0.5, mb: 0.75,
        px: 1, py: 0.5, borderRadius: 0.5,
        bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
      }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusInfo.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 10, color: statusInfo.color, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {statusInfo.icon} {statusInfo.text}
        </Typography>
      </Box>

      {flatMode ? (
        // ━━━ 扁平列表模式（deviceFilter 过滤后，只显示匹配设备） ━━━
        <>
          {/* 操作栏 */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={() => onChange(field.key, devices.map(d => String(d.deviceId)))}>
              全选
            </Button>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={() => onChange(field.key, [])}>
              清空
            </Button>
          </Box>

          {/* 扁平设备列表 */}
          <Box sx={{ maxHeight: 200, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {devices.length === 0 ? (
              <Box sx={{ p: 1.5, textAlign: "center" }}>
                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                  {dataSource ? "暂无匹配设备，点击「刷新」重新加载" : "未配置边缘计算数据源"}
                </Typography>
              </Box>
            ) : (
              devices.map((d) => {
                const id = String(d.deviceId);
                const checked = selected.includes(id);
                const productDef = products[String(d.productCode ?? "")];
                const displayName = String(d.productName ?? productDef?.productName ?? id);
                return (
                  <Box
                    key={id}
                    onClick={() => toggle(id)}
                    sx={{
                      display: "flex", alignItems: "center", gap: 0.75,
                      px: 1, py: 0.6, cursor: "pointer",
                      bgcolor: checked
                        ? (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.12)" : "rgba(79,195,247,0.08)"
                        : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                      borderBottom: "1px solid", borderColor: "divider",
                    }}
                  >
                    <Checkbox size="small" checked={checked} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 16 } }} />
                    <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: d.online ? "success.main" : "grey.400", flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }}
                      title={`设备编号: ${formatDeviceNo(d)}`}
                    >
                      {formatDeviceNo(d)}
                    </Typography>
                    {d.online ? (
                      <Typography sx={{ fontSize: 8, color: "success.main", flexShrink: 0 }}>在线</Typography>
                    ) : (
                      <Typography sx={{ fontSize: 8, color: "text.disabled", flexShrink: 0 }}>离线</Typography>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </>
      ) : (
        // ━━━ 完整树形模式（无 deviceFilter，显示全部设备含隶属关系） ━━━
        <>
          {/* 搜索框 */}
          <TextField
            size="small"
            fullWidth
            placeholder="搜索 设备ID/名称/产品码/IP"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              ...fieldSx,
              mb: 0.5,
              '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 },
            }}
          />

          {/* 操作栏 */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.5, alignItems: "center" }}>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={selectAll}>
              全选
            </Button>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={clearAll}>
              清空
            </Button>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
              集{groupStats.main} 分{groupStats.sub} 传{groupStats.sensor}
            </Typography>
          </Box>

          {/* 设备列表（按隶属分组） */}
          <Box sx={{ maxHeight: 240, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 0.75 }}>
            {devices.length === 0 ? (
              <Box sx={{ p: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                  {dataSource
                    ? "点击「刷新」加载设备列表"
                    : "未找到边缘计算数据源，请先在「数据源管理」中创建"}
                </Typography>
                {!activeProvider && dataSource && (
                  <Typography sx={{ fontSize: 9, color: "text.disabled", mt: 0.5 }}>
                    提示：还需在「设备适配器」中创建并启用适配器（关联此数据源）
                  </Typography>
                )}
              </Box>
            ) : filteredTree.length === 0 ? (
              <Box sx={{ p: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: 10, color: "text.disabled" }}>无匹配设备</Typography>
              </Box>
            ) : (
              // 树形结构：每个集控器是一棵独立的子树，子设备用虚线左缩进连接
              (() => {
                // 渲染一行
                const row = (
                  d: Record<string, unknown>,
                  dimmed: boolean, // 搜索时该节点本身不匹配，仅因为有匹配子孙而保留
                  _isLast: boolean
                ) => {
                  const id = String(d.deviceId);
                  const checked = selected.includes(id);
                  const productDef = products[String(d.productCode ?? "")];
                  const displayName = String(d.productName ?? productDef?.productName ?? id);
                  const cat = String(d.category ?? "other");
                  const catColor = cat === "main" ? "#4fc3f7" : cat === "sub" ? "#81c784" : cat === "sensor" ? "#ffb74d" : "#9e9e9e";
                  const dot = d.online ? "success.main" : "grey.400";
                  return (
                    <Box
                      key={id}
                      onClick={() => toggle(id)}
                      sx={{
                        display: "flex", alignItems: "center", gap: 0.5,
                        px: 0.75, py: 0.4, cursor: "pointer",
                        bgcolor: checked ? "action.selected" : "transparent",
                        opacity: dimmed ? 0.55 : 1,
                        "&:hover": { bgcolor: "action.hover" },
                        borderBottom: "1px solid", borderColor: "divider",
                      }}
                    >
                      <Checkbox size="small" checked={checked} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 14 } }} />
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName}
                      </Typography>
                      <Typography
                        sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }}
                        title={`设备编号: ${formatDeviceNo(d)}`}
                      >
                        {formatDeviceNo(d)}
                      </Typography>
                      <Typography sx={{ fontSize: 8, color: catColor, flexShrink: 0, border: `1px solid ${catColor}`, px: 0.4, borderRadius: 0.3, ml: 0.25 }}>
                        {cat}
                      </Typography>
                    </Box>
                  );
                };

                // 递归渲染
                const renderSubTree = (nodes: TreeNode[], depth: number) => {
                  return nodes.map((n) => {
                    const id = String(n.device.deviceId);
                    return (
                      <Box key={id}>
                        {row(n.device, !matchSelf(n.device, search.trim().toLowerCase()) && depth > 0, false)}
                        {n.children.length > 0 && (
                          <Box sx={{
                            ml: 1.25,
                            pl: 1,
                            borderLeft: "1px dashed",
                            borderColor: "divider",
                          }}>
                            {renderSubTree(n.children, depth + 1)}
                          </Box>
                        )}
                      </Box>
                    );
                  });
                };

                return (
                  <Box>
                    {filteredTree.map((root) => {
                      const rootId = String(root.device.deviceId);
                      const rootChildren = root.children.length;
                      return (
                        <Box key={rootId} sx={{ mb: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 0.75, overflow: "hidden" }}>
                          <Box
                            onClick={() => toggle(rootId)}
                            sx={{
                              display: "flex", alignItems: "center", gap: 0.75,
                              px: 0.75, py: 0.5, cursor: "pointer",
                              bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.08)" : "rgba(79,195,247,0.12)",
                              borderBottom: "1px solid", borderColor: "divider",
                              "&:hover": { bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.15)" : "rgba(79,195,247,0.2)" },
                            }}
                          >
                            <Checkbox size="small" checked={selected.includes(rootId)} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 14 } }} />
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: root.device.online ? "success.main" : "grey.400", flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#4fc3f7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {String(root.device.productName ?? formatDeviceNo(root.device))}
                            </Typography>
                            <Typography sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }} title={`设备编号: ${formatDeviceNo(root.device)}`}>
                              {formatDeviceNo(root.device)}
                            </Typography>
                            <Typography sx={{ fontSize: 9, color: "text.disabled", flexShrink: 0 }}>
                              {rootChildren > 0 ? `└ ${rootChildren} 个子设备` : "无子设备"}
                            </Typography>
                          </Box>
                          {rootChildren > 0 && (
                            <Box sx={{ borderLeft: "2px solid", borderColor: "primary.main", ml: 0.5 }}>
                              {renderSubTree(root.children, 1)}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })()
            )}
          </Box>
        </>
      )}
      {field.help && (
        <Typography sx={{ fontSize: 9, color: "text.disabled", mt: 0.5, px: 0.25 }}>{field.help}</Typography>
      )}
    </Box>
  );
}

/**
 * keyValueMapping 字段：键值对列表
 *  - value 存成 Array<{ key: string; value: string }>
 *  - 键=自由输入（表头），值=下拉选（设备字段）
 *  - 用于"列字段映射"：用户自定义表格列+对应设备字段
 */
export function KeyValueMappingField({
  field,
  value,
  onChange,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
}) {
  const pairs: Array<{ key: string; value: string }> = Array.isArray(value)
    ? (value as Array<{ key: string; value: string }>)
    : [];

  // ── 从 deviceStore 动态获取可用字段 ──
  // 1. 基础字段（所有设备都有）
  // 2. 选中设备的 metadata 字段（含 realtime）
  // 如果 field.valueOptions 有值则优先用静态配置（兼容）
  const devices = useDeviceStore((s) => s.devices);
  const dynamicOptions = useMemo(() => {
    if (field.valueOptions && field.valueOptions.length > 0) return field.valueOptions;

    // 基础字段（固定）
    const baseFields: Array<{ label: string; value: string }> = [
      { label: "设备ID (deviceId)", value: "deviceId" },
      { label: "设备名 (productName)", value: "productName" },
      { label: "产品码 (productCode)", value: "productCode" },
      { label: "分类 (category)", value: "category" },
      { label: "在线状态 (online)", value: "online" },
      { label: "在线文字 (onlineText)", value: "onlineText" },
      { label: "状态机 (stateName)", value: "stateName" },
      { label: "IP地址 (ip)", value: "ip" },
      { label: "MAC地址 (mac)", value: "mac" },
      { label: "父设备 (parentDeviceId)", value: "parentDeviceId" },
    ];

    // 从选中设备的 metadata 收集动态字段
    const selectedIds = (config.selectedDeviceIds as string[]) || [];
    const selSet = new Set(selectedIds);
    const seen = new Set<string>();
    const dynamicFields: Array<{ label: string; value: string }> = [];

    const allDevices = Object.values(devices);
    // 如果没有勾选设备，取所有设备
    const targetDevices = selSet.size > 0 ? allDevices.filter((d) => selSet.has(d.deviceId)) : allDevices;

    for (const d of targetDevices) {
      const meta = (d.metadata as Record<string, unknown> | undefined) || {};
      // metadata 顶层字段（排除 realtime 和内部字段）
      for (const k of Object.keys(meta)) {
        if (k === "realtime" || k.startsWith("_") || seen.has(k)) continue;
        seen.add(k);
        dynamicFields.push({ label: `${k} (${k})`, value: k });
      }
      // realtime 子字段
      const rt = (meta.realtime as Record<string, unknown> | undefined) || {};
      for (const k of Object.keys(rt)) {
        if (seen.has(k)) continue;
        seen.add(k);
        dynamicFields.push({ label: `${k} (${k})`, value: k });
      }
    }

    return [...baseFields, ...dynamicFields];
  }, [field.valueOptions, config.selectedDeviceIds, devices]);

  const keyLabel = field.keyLabel ?? "键";
  const valueLabel = field.valueLabel ?? "值";

  const updatePair = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    const next = pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(field.key, next);
  };
  const addPair = () => onChange(field.key, [...pairs, { key: "", value: "" }]);
  const removePair = (idx: number) => onChange(field.key, pairs.filter((_, i) => i !== idx));
  const movePair = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= pairs.length) return;
    const next = [...pairs];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(field.key, next);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.25 }}>
        <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500 }}>{field.label}</Typography>
        <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={addPair}>
          + 添加
        </Button>
      </Box>
      {pairs.length === 0 ? (
        <Box sx={{ p: 0.75, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: 0.75 }}>
          <Typography sx={{ fontSize: 10, color: "text.disabled" }}>暂无映射，点击"添加"新增</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {pairs.map((p, idx) => (
            <Box key={idx} sx={{ display: "flex", gap: 0.25, alignItems: "center" }}>
              <Box sx={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <IconButton
                  size="small"
                  onClick={() => movePair(idx, "up")}
                  disabled={idx === 0}
                  sx={{ p: 0.05, "& .MuiSvgIcon-root": { fontSize: 10 } }}
                >
                  <ArrowUpwardIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => movePair(idx, "down")}
                  disabled={idx === pairs.length - 1}
                  sx={{ p: 0.05, "& .MuiSvgIcon-root": { fontSize: 10 } }}
                >
                  <ArrowDownwardIcon />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: 9, color: "text.disabled", width: 12, textAlign: "center", flexShrink: 0 }}>
                {idx + 1}
              </Typography>
              <TextField
                size="small"
                placeholder={keyLabel}
                value={p.key}
                onChange={(e) => updatePair(idx, { key: e.target.value })}
                sx={{ ...fieldSx, flex: 1, '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 } }}
              />
              <Typography sx={{ fontSize: 10, color: "text.disabled" }}>→</Typography>
              <TextField
                size="small"
                select
                placeholder={valueLabel}
                value={p.value}
                onChange={(e) => updatePair(idx, { value: e.target.value })}
                sx={{ ...fieldSx, flex: 1.5, '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 } }}
              >
                <MenuItem value="" sx={{ fontSize: 10 }}>-- 选择字段 --</MenuItem>
                {dynamicOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 10 }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton size="small" onClick={() => removePair(idx)} sx={{ p: 0.25 }}>
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function DeviceSelectField({
  field,
  value,
  onChange,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
}) {
  const devices = useDeviceStore((s) => s.devices);
  const productCode = config.productCode as string | undefined;

  const filteredDevices = useMemo(() => {
    const all = Object.values(devices);
    if (!productCode) return all;
    return all.filter((d) => d.productCode === productCode);
  }, [devices, productCode]);

  const selectedDevice = value ? devices[value as string] : undefined;

  return (
    <Box>
      <TextField
        label={field.label}
        value={String(value ?? '')}
        size="small"
        fullWidth
        select
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => onChange(field.key, e.target.value || undefined)}
        sx={fieldSx}
      >
        <MenuItem value="" sx={{ fontSize: 11 }}>
          {productCode ? `-- 选择${productCode}设备 --` : '-- 请先填写产品识别码 --'}
        </MenuItem>
        {filteredDevices.map((d) => (
          <MenuItem
            key={d.deviceId}
            value={d.deviceId}
            sx={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: d.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.productName || d.deviceId}
            </Box>
          </MenuItem>
        ))}
      </TextField>
      {selectedDevice && (
        <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: selectedDevice.online ? 'success.main' : 'grey.400',
            }}
          />
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>
            {selectedDevice.online ? '在线' : '离线'} · {selectedDevice.deviceId}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
