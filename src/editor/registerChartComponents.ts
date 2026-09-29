import { registerBasicCharts } from "./chart/basicCharts";
import { registerPieScatterRadarCharts } from "./chart/pieScatterRadarCharts";
import { registerGaugeCharts } from "./chart/gaugeCharts";
import { registerRelationCharts } from "./chart/relationCharts";
import { registerFlowCharts } from "./chart/flowCharts";
import { registerGeoCharts } from "./chart/geoCharts";
import { registerCustomCharts } from "./chart/customCharts";

/**
 * 注册所有 ECharts 图表组件
 * 每个图表类型独立注册，名称与 ECharts 官方保持一致
 */

export function registerChartComponents(): void {
  registerBasicCharts();
  registerPieScatterRadarCharts();
  registerGaugeCharts();
  registerRelationCharts();
  registerFlowCharts();
  registerGeoCharts();
  registerCustomCharts();
}
