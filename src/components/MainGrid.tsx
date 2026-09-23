import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import { MetricWidget } from "./widgets";
import type { MetricWidgetProps } from "./widgets";
import { LineChartWidget, BarChartWidget, PieChartWidget } from "./widgets/ChartWidget";
import { AlertMonitor, RecentLogsCard } from "./monitors";
import { useSceneStore } from "../store/sceneStore";
import { useDataSourceStore } from "../store/datasourceStore";
import { useDeviceStore } from "../store/deviceStore";
import { useAlarmHistoryStore } from "../store/alarmHistoryStore";
import { useMapLibraryStore } from "../store/mapLibraryStore";

// 业务区域监控：从本地场景库过滤出三大业务场景（去掉默认骨架场景）
function isBusinessScene(id: string): boolean {
  return id !== "scene_default";
}

// 粉尘浓度限值（mg/m³）— 总粉尘浓度限值假设值，仅用于达标/超标标记，可按矿方标准调整
const DUST_LIMIT_MGM3 = 10;

function RegionSceneCard({
  title,
  status,
  componentCount,
  cadReady,
  onEnter,
}: {
  title: string;
  status: "draft" | "published" | "archived";
  componentCount: number;
  cadReady: boolean;
  onEnter: () => void;
}) {
  const published = status === "published";
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: (theme) =>
            theme.vars
              ? `0 4px 20px rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
              : "0 4px 20px rgba(0,0,0,0.06)",
        },
      }}
    >
      <CardActionArea onClick={onEnter} sx={{ height: "100%" }}>
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Chip
              size="small"
              label={published ? "已发布" : "草稿"}
              color={published ? "success" : "error"}
              variant="outlined"
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            监控组件 {componentCount} 个
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Chip
              size="small"
              label={cadReady ? "CAD 已就位" : "待选图"}
              color={cadReady ? "success" : "warning"}
              variant="outlined"
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
            <Typography variant="caption" color="primary" sx={{ ml: "auto" }}>
              进入 →
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function MainGrid() {
  const navigate = useNavigate();
  const scenes = useSceneStore((s) => s.scenes);
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const devices = useDeviceStore((s) => s.devices);
  const alarmRecords = useAlarmHistoryStore((s) => s.records);
  const unreadEnterCount = useAlarmHistoryStore((s) => s.unreadEnterCount);

  const setActiveScene = useSceneStore((s) => s.setActiveScene);

  // === 真实指标（业务视角） ===
  // 场景 / CAD 就位：来自本地已加载的场景配置（不依赖实时遥测）
  const businessScenes = useMemo(
    () => scenes.filter((s) => isBusinessScene(s.id)),
    [scenes],
  );
  const sceneCount = businessScenes.length;
  const publishedCount = businessScenes.filter((s) => s.status === "published").length;
  const draftCount = businessScenes.filter((s) => s.status === "draft").length;
  const dataSourceCount = dataSources.length;
  const connectedCount = dataSources.filter((d) => d.status === "connected").length;

  // 地图库统计：来自本地已加载的地图库（已发布 / 草稿），与场景卡同口径
  const libraries = useMapLibraryStore((s) => s.libraries);
  const loadLibraries = useMapLibraryStore((s) => s.loadLibraries);
  useEffect(() => {
    void loadLibraries();
  }, [loadLibraries]);
  const mapPublished = libraries.filter((l) => l.status === "published").length;
  const mapDraft = libraries.filter((l) => l.status === "draft").length;
  const mapTotal = mapPublished + mapDraft;

  // 设备在线 / 通信率：来自运行时 deviceStore（edge-conductor 推 WS 灌满，全矿共享设备池）
  // 注意：deviceStore 不区分物理区域，故只做全矿聚合，不按巷道/廊桥/综采拆分（无区域字段，拆分即造假）
  const deviceIds = useMemo(() => Object.keys(devices), [devices]);
  const onlineCount = useMemo(() => {
    const getEffectiveOnline = useDeviceStore.getState().getEffectiveOnline;
    return deviceIds.filter((id) => getEffectiveOnline(id)).length;
  }, [deviceIds]);
  const totalDevices = deviceIds.length;
  const commRate = totalDevices > 0 ? Math.round((onlineCount / totalDevices) * 100) : 0;

  const statData: MetricWidgetProps[] = [
    {
      id: "stat-online-devices",
      title: "在线设备",
      value: String(onlineCount),
      interval: `通信率 ${commRate}% · 共 ${totalDevices} 台`,
      trend: "neutral",
      trendLabel: "实时",
      data: [],
    },
    {
      id: "stat-alarms",
      title: "当前报警",
      value: String(unreadEnterCount),
      interval: `累计 ${alarmRecords.length} 条`,
      trend: "neutral",
      trendLabel: "实时",
      data: [],
    },
    {
      id: "stat-scenes",
      title: "监控场景总数",
      value: String(sceneCount),
      interval: `已发布 ${publishedCount} · 草稿 ${draftCount}`,
      trend: "neutral",
      trendLabel: "实时",
      data: [],
    },
    {
      id: "stat-map-library",
      title: "地图库",
      value: String(mapTotal),
      interval: `已发布 ${mapPublished} · 草稿 ${mapDraft}`,
      trend: "neutral",
      trendLabel: "实时",
      data: [],
    },
  ];

  // === 真实图表：数据源类型分布（饼图） ===
  const pieChartData = useMemo(() => {
    const typeLabel: Record<string, string> = {
      http: "HTTP",
      websocket: "WebSocket",
      mqtt: "MQTT",
      database: "数据库",
    };
    const acc: { name: string; value: number }[] = [];
    for (const ds of dataSources) {
      const name = typeLabel[ds.type] ?? ds.type;
      const found = acc.find((a) => a.name === name);
      if (found) found.value += 1;
      else acc.push({ name, value: 1 });
    }
    return acc.length ? acc : [{ name: "暂无数据源", value: 1 }];
  }, [dataSources]);

  // === 真实图表：各场景组件数分布（柱状图） ===
  const barChartData = useMemo(() => {
    if (businessScenes.length === 0) return [{ label: "暂无场景", value: 0 }];
    return businessScenes.map((s) => {
      const name = s.name || s.id;
      return {
        label: name.length > 6 ? `${name.slice(0, 6)}…` : name,
        value: s.editorComponents?.length ?? 0,
      };
    });
  }, [businessScenes]);

  // === 设备通信概览（全矿聚合，不按区域拆分） ===
  const deviceComm = useMemo(() => {
    let sensor = 0;
    let main = 0;
    for (const d of Object.values(devices)) {
      if (d.category === "sensor") sensor += 1;
      else if (d.category === "main") main += 1;
    }
    return { sensor, main };
  }, [devices]);

  // === 粉尘浓度实时监测（替换原地图预览块）：来自 deviceStore 各粉尘传感器 realtime.finalValue ===
  const dustSensors = useMemo(() => {
    const getEffectiveOnline = useDeviceStore.getState().getEffectiveOnline;
    return Object.values(devices)
      .filter((d) => d.category === "sensor" && d.sensorSubType === "dust")
      .map((d) => {
        const rt = (d.metadata?.realtime as Record<string, { value: unknown }> | undefined)?.[
          "finalValue"
        ]?.value;
        const value = typeof rt === "number" ? rt : null;
        return {
          id: d.deviceId,
          name: d.productName || d.productCode || d.deviceId,
          value,
          online: getEffectiveOnline(d.deviceId),
        };
      });
  }, [devices]);

  const enterScene = (id: string) => {
    setActiveScene(id);
    navigate("/scene");
  };

  return (
    <Box sx={{ width: "100%", maxWidth: { sm: "100%", md: "1700px" } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            喷雾降尘监控大屏
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            实时概览 · 设备/报警/粉尘来自运行时推送，场景/CAD 来自本地配置（已连接数据源 {connectedCount}/{dataSourceCount}）
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="新建场景">
            <IconButton
              size="small"
              color="primary"
              onClick={() => navigate("/scene")}
              sx={{
                border: "1px dashed",
                borderColor: "primary.main",
                borderRadius: 1,
              }}
            >
              <AddRoundedIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* 实时指标条 */}
      <Grid container spacing={2} columns={12} sx={{ mb: 3 }}>
        {statData.map((card) => (
          <Grid key={card.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <MetricWidget {...card} />
          </Grid>
        ))}
      </Grid>

      {/* 业务区域监控：三大场景卡 */}
      <Typography component="h2" variant="h6" sx={{ mb: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
        <DashboardRoundedIcon fontSize="small" />
        业务区域监控
      </Typography>
      <Grid container spacing={2} columns={12} sx={{ mb: 3 }}>
        {businessScenes.map((s) => (
          <Grid key={s.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <RegionSceneCard
              title={s.name || s.id}
              status={s.status}
              componentCount={s.editorComponents?.length ?? 0}
              cadReady={(s.editorComponents ?? []).some(
                (c) =>
                  c.type === "map-cad" &&
                  typeof c.config?.mapLibraryId === "string" &&
                  c.config.mapLibraryId !== "",
              )}
              onEnter={() => enterScene(s.id)}
            />
          </Grid>
        ))}
      </Grid>

      {/* 实时态势：告警中心 + 设备通信概览 */}
      <Typography component="h2" variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        实时态势
      </Typography>
      <Grid container spacing={2} columns={12} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <AlertMonitor id="alert-monitor" />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                设备通信概览
              </Typography>
              <Typography variant="body2" color="text.secondary">
                在线 {onlineCount} / 共 {totalDevices} 台
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                <Box sx={{ flex: 1, height: 10, borderRadius: "5px", bgcolor: "#EAF3DE", overflow: "hidden" }}>
                  <Box sx={{ width: `${commRate}%`, height: "100%", bgcolor: "success.main" }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {commRate}%
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                传感器 {deviceComm.sensor} · 集控器 {deviceComm.main}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                全矿聚合（不按区域拆分）
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <RecentLogsCard limit={6} />
        </Grid>
      </Grid>

      {/* 粉尘浓度实时监测：替换原地图预览块（真实 deviceStore 数据） */}
      <Typography component="h2" variant="h6" sx={{ mb: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
        <SensorsRoundedIcon fontSize="small" />
        粉尘浓度实时监测
      </Typography>
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2 }}>
          {dustSensors.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              等待设备实时数据 · 运行时 edge-conductor 推送后显示各粉尘传感器浓度（mg/m³）
            </Typography>
          ) : (
            <Grid container spacing={1} columns={12}>
              {dustSensors.slice(0, 12).map((d) => {
                const over = d.value !== null && d.value > DUST_LIMIT_MGM3;
                return (
                  <Grid key={d.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "0.5px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        p: 1,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" noWrap>
                          {d.name}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {d.value !== null ? `${d.value.toFixed(1)}` : "—"}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {" "}
                            mg/m³
                          </Typography>
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={over ? "超标" : "达标"}
                        color={over ? "error" : "success"}
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* 数据分析 */}
      <Typography component="h2" variant="h6" sx={{ mb: 2, fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}>
        <DashboardRoundedIcon fontSize="small" />
        数据分析
      </Typography>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: "100%", p: 1 }}>
            <LineChartWidget
              id="chart-line"
              title="数据流量趋势（示例）"
              data={{
                xAxis: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"],
                series: [
                  { name: "查询量", data: [120, 280, 450, 380, 520, 410, 320] },
                  { name: "写入量", data: [80, 150, 280, 220, 350, 280, 180] },
                ],
              }}
              height={300}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", p: 1 }}>
            <PieChartWidget
              id="chart-pie"
              title="数据源类型分布"
              data={pieChartData}
              height={300}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card variant="outlined" sx={{ height: "100%", p: 1 }}>
            <BarChartWidget
              id="chart-bar"
              title="各场景监控组件数"
              data={barChartData}
              height={300}
            />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
