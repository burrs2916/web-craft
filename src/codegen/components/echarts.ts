import type { ComponentCodegenFn, CodegenContext } from "../types";
import { dataFetchParts } from "../dataLoader";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * ECharts 系列组件 → HTML
 *
 * 覆盖 27 个 echart-* 注册类型（echart-bar / echart-line-stacked / echart-pie / …）。
 * 运行时方案（与编辑器端 useChartData 语义一致）：
 *   - 数据统一接入：dataMode(static|api)、staticData、apiUrl/apiPath/apiMethod/apiBody、
 *     apiHeaders、apiInterval、apiDataPath、authEnabled（__WC_* 全局变量由 engine 注入 <head>）
 *   - 数据合并约定：
 *       对象 → 字段级合并覆盖到 cfg；数组 → 写入 cfg.data；标量 → 写入 cfg.value
 *       staticData 非空时优先于组件静态字段；api 返回数据再覆盖 staticData
 *   - 特殊 dataMode（batch/stream/realtime 等编辑器实时语义）在发布环境按 static 处理
 *   - map / lines（航线图）在运行时通过 DataV geoJSON 注册地图，失败时提示而非白屏
 *
 * 布局：外层组件包装 div 已含绝对定位宽高，内层容器 100% 填充。
 */

const ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js";

/** echarts 库按 ctx（一次页面生成）去重注入 */
const injectedCtx = new WeakSet<CodegenContext>();

/** 序列化 API 字符串字段（数组/对象 → JSON 字符串，字符串原样） */
function jsonField(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/**
 * 生成组件 runtime IIFE（注入到 ctx.pageScripts，页面底部统一 <script> 中执行）。
 * 注意：内部 JS 禁止出现反引号与 ${ 字面量（模板字符串冲突）。
 */
function buildRuntime(opts: {
  uid: string;
  type: string;
  configJson: string;
  apiUrl: string;
  apiPath: string;
  apiMethod: string;
  apiDataPath: string;
  apiHeaders: string;
  apiBody: string;
  authEnabled: boolean | null;
  apiInterval: number;
}): string {
  const {
    uid, type, configJson,
    apiUrl, apiPath, apiMethod, apiDataPath, apiHeaders, apiBody, authEnabled, apiInterval,
  } = opts;

  // 统一取数骨架部件（与 dataLoaderScript 同源：URL 拼接/认证/请求头/请求体/取值路径）
  const fetchParts = dataFetchParts({
    apiUrl,
    apiPath,
    apiMethod,
    apiHeaders,
    apiBody,
    apiInterval,
    apiDataPath,
    authEnabled,
    onData: "mergeChartData(data); render();",
  });

  return `(function () {
  var uid = ${JSON.stringify(uid)};
  var container = document.getElementById(uid);
  if (!container) return;
  var type = ${JSON.stringify(type)};
  var cfg = ${configJson};
  var apiMode = cfg.dataMode === "api";
${fetchParts.vars}
  var chart = null;

  var dark = cfg.theme !== "light";
  var PALETTE = ["#4E8CFF", "#58D68D", "#F5B041", "#E74C3C", "#AF7AC5", "#5DADE2", "#D35400", "#7DCEA0"];
  var textColor = dark ? "rgba(255,255,255,0.85)" : "#333";
  var subColor = dark ? "rgba(255,255,255,0.45)" : "#888";
  var splitColor = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  function getColor(i) { return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]; }
  function toArr(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { var p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) {} }
    return [];
  }
  function toObj(v) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) return v;
    if (typeof v === "string") { try { var p = JSON.parse(v); return (p && typeof p === "object" && !Array.isArray(p)) ? p : null; } catch (e) {} }
    return null;
  }
  function toNum(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function mergeChartData(data) {
    if (data != null && typeof data === "object" && !Array.isArray(data)) {
      for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) cfg[k] = data[k]; }
    } else if (Array.isArray(data)) {
      cfg.data = data;
    } else {
      cfg.value = data;
    }
  }

  // ── staticData 预合并（与 useChartData 一致：非空即覆盖） ──
  var sd = cfg.staticData;
  if (sd != null && sd !== "") {
    if (typeof sd === "string") { try { sd = JSON.parse(sd); } catch (e) { sd = null; } }
    mergeChartData(sd);
  }

  // ── 统一取数骨架（buildFetchUrl/buildFetchHeaders/doFetch，与 dataLoaderScript 同源）──
${fetchParts.helpers}
${fetchParts.doFetch}

  // ── 地图注册（map / lines 组件） ──
  function ensureMap(mapName, cb) {
    var name = mapName || "china";
    if (window.__wcMapLoaded && window.__wcMapLoaded[name]) { cb(); return; }
    var code = (name === "china" || name === "中国") ? "100000" : name;
    fetch("https://geo.datav.aliyun.com/areas_v3/bound/" + code + "_full.json")
      .then(function (r) { if (!r.ok) throw new Error("map fetch fail"); return r.json(); })
      .then(function (geo) {
        try { echarts.registerMap(name, geo); } catch (e) {}
        window.__wcMapLoaded = window.__wcMapLoaded || {};
        window.__wcMapLoaded[name] = 1;
        cb();
      })
      .catch(function () { cb(); });
  }

  // ── option 构建器 ──
  function mkTitle(text, show) {
    if (!text || show === false) return null;
    return { text: String(text), left: "center", top: 4, textStyle: { color: textColor, fontSize: 14, fontWeight: 600 } };
  }
  function mkTooltip(trigger) {
    return {
      trigger: trigger || "axis",
      axisPointer: { type: trigger === "item" ? "shadow" : "line" },
      backgroundColor: "rgba(0,0,0,0.72)",
      borderColor: "rgba(255,255,255,0.15)",
      textStyle: { color: "#fff", fontSize: 12 },
    };
  }
  function mkValueAxis() {
    return { type: "value", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: subColor, fontSize: 11 }, splitLine: { lineStyle: { color: splitColor, type: "dashed" } } };
  }
  function mkCatAxis(d) {
    return { type: "category", data: d, axisLine: { lineStyle: { color: splitColor } }, axisTick: { show: false }, axisLabel: { color: subColor, fontSize: 11 } };
  }
  function mkGrid() {
    return { left: "6%", right: "5%", top: 34, bottom: 30, containLabel: true };
  }
  function mkLegend(show) {
    return { show: show !== false, top: 4, type: "scroll", textStyle: { color: subColor, fontSize: 11 } };
  }
  function mkDataZoom() {
    return [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", height: 14, bottom: 6, textStyle: { color: subColor, fontSize: 10 } },
    ];
  }
  function mkAxisLabelRotate(v) { return v == null || v === "" ? 0 : toNum(v, 0); }

  function buildOption() {
    switch (type) {
      case "echart-bar": {
        var cats = toArr(cfg.categories);
        var vals = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.values);
        var horizontal = cfg.orientation === "horizontal";
        var itemStyle = { borderRadius: toNum(cfg.borderRadius, 2) };
        if (cfg.gradient) {
          itemStyle.color = new echarts.graphic.LinearGradient(horizontal ? 1 : 0, 0, horizontal ? 0 : 1, 0, [
            { offset: 0, color: getColor(0) }, { offset: 1, color: getColor(0) + "55" },
          ]);
        } else {
          itemStyle.color = getColor(0);
        }
        var series = [{
          name: cfg.seriesName ? String(cfg.seriesName) : "",
          type: "bar",
          data: vals,
          barWidth: cfg.barWidth || "60%",
          itemStyle: itemStyle,
          label: { show: cfg.showLabel === true, position: horizontal ? "right" : "top", color: textColor, fontSize: 11 },
        }];
        return {
          title: mkTitle(cfg.title, cfg.showTitle),
          tooltip: mkTooltip("axis"),
          grid: mkGrid(),
          xAxis: horizontal ? mkValueAxis() : mkCatAxis(cats),
          yAxis: horizontal ? mkCatAxis(cats) : mkValueAxis(),
          series: series,
        };
      }

      case "echart-line-stacked": {
        var xd = toArr(cfg.xAxisData);
        var sdRaw = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.seriesData);
        var sd = (sdRaw.length > 0 && Array.isArray(sdRaw[0])) ? sdRaw : [sdRaw];
        var names = toArr(cfg.seriesNames);
        var series = sd.map(function (arr, i) {
          var s = {
            name: names[i] != null ? String(names[i]) : "系列" + (i + 1),
            type: "line",
            data: arr,
            smooth: cfg.smooth === true,
            symbol: cfg.showSymbol === false ? "none" : (cfg.symbolType || "circle"),
            symbolSize: toNum(cfg.symbolSize, 4),
            lineStyle: { width: toNum(cfg.lineWidth, 2) },
          };
          if (cfg.lineColor) s.lineStyle.color = String(cfg.lineColor);
          if (cfg.areaStyle) s.areaStyle = { opacity: toNum(cfg.areaOpacity, 0.25) };
          if (cfg.stack) s.stack = String(cfg.stack);
          return s;
        });
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("axis"),
          legend: mkLegend(names.length > 1),
          grid: mkGrid(),
          xAxis: mkCatAxis(cfg.xAxisType === "time" ? [] : xd),
          yAxis: mkValueAxis(),
          dataZoom: cfg.showDataZoom ? mkDataZoom() : undefined,
          series: series,
        };
      }

      case "echart-line-polar": {
        var sdRawP = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.seriesData);
        var sdP = (sdRawP.length > 0 && Array.isArray(sdRawP[0])) ? sdRawP : [sdRawP];
        var namesP = toArr(cfg.seriesNames);
        var seriesP = sdP.map(function (arr, i) {
          var s = { type: "line", coordinateSystem: "polar", data: arr, name: namesP[i] != null ? String(namesP[i]) : "系列" + (i + 1) };
          if (cfg.smooth === true) s.smooth = true;
          if (cfg.areaStyle) s.areaStyle = { opacity: toNum(cfg.areaOpacity, 0.2) };
          return s;
        });
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("item"),
          legend: mkLegend(namesP.length > 1),
          polar: cfg.polarRadius ? { radius: toArr(cfg.polarRadius) } : {},
          angleAxis: { type: "value", axisLabel: { color: subColor, fontSize: 10 } },
          radiusAxis: { type: "category", axisLabel: { color: subColor, fontSize: 10 }, axisLine: { lineStyle: { color: splitColor } } },
          series: seriesP,
        };
      }

      case "echart-line-dataset": {
        var src = toArr(cfg.datasetSource);
        var tr = toArr(cfg.datasetTransform);
        var dataset = [{ source: src }];
        var seriesD = [{ type: "line", smooth: cfg.smooth === true, encode: { x: 0, y: 1 } }];
        if (tr.length) {
          var t0 = toObj(tr[0]);
          if (t0) {
            dataset.push({ transform: t0 });
            seriesD = [{ type: "line", datasetIndex: 1, smooth: cfg.smooth === true }];
          }
        }
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("axis"),
          legend: { show: false },
          grid: mkGrid(),
          xAxis: { type: "category", axisLabel: { color: subColor, fontSize: 11 } },
          yAxis: mkValueAxis(),
          dataset: dataset,
          series: seriesD,
        };
      }

      case "echart-line-sparkline": {
        var xdS = toArr(cfg.xAxisData);
        var sdRawS = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.seriesData);
        var sdS = (sdRawS.length > 0 && Array.isArray(sdRawS[0])) ? sdRawS : [sdRawS];
        var seriesS = sdS.map(function (arr) {
          return { type: "line", data: arr, smooth: true, symbol: "none", lineStyle: { width: 1 }, areaStyle: cfg.areaStyle ? { opacity: 0.15 } : undefined };
        });
        return {
          grid: { left: 0, right: 0, top: 2, bottom: 0 },
          xAxis: { type: "category", data: xdS, show: false },
          yAxis: { type: "value", show: false },
          series: seriesS.length ? seriesS : [{ type: "line", data: [], symbol: "none" }],
        };
      }

      case "echart-pie": {
        var dataPie = toArr(cfg.data);
        var radiusPie = cfg.radius && typeof cfg.radius === "string" ? cfg.radius : (Array.isArray(cfg.radius) ? cfg.radius : ["0%", "70%"]);
        var sPie = {
          type: "pie",
          radius: radiusPie,
          center: Array.isArray(cfg.center) ? cfg.center : ["50%", "50%"],
          roseType: (cfg.roseType === "radius" || cfg.roseType === "area") ? cfg.roseType : undefined,
          label: { show: cfg.showLabel !== false, position: cfg.labelPosition || "outside", color: textColor, fontSize: 12 },
          labelLine: { show: cfg.showLabel !== false },
          data: dataPie,
        };
        return { title: mkTitle(cfg.title), tooltip: mkTooltip("item"), legend: mkLegend(true), series: [sPie] };
      }

      case "echart-scatter": {
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("item"),
          grid: mkGrid(),
          xAxis: mkValueAxis(),
          yAxis: mkValueAxis(),
          series: [{ type: "scatter", name: cfg.seriesName ? String(cfg.seriesName) : "", data: toArr(cfg.data), symbolSize: toNum(cfg.symbolSize, 10) }],
        };
      }

      case "echart-effectscatter": {
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("item"),
          grid: mkGrid(),
          xAxis: mkValueAxis(),
          yAxis: mkValueAxis(),
          series: [{
            type: cfg.showEffect === false ? "scatter" : "effectScatter",
            name: cfg.seriesName ? String(cfg.seriesName) : "",
            data: toArr(cfg.data),
            symbolSize: toNum(cfg.symbolSize, 8),
            rippleEffect: cfg.showEffect === false ? undefined : { brushType: cfg.rippleBrushType || "stroke" },
          }],
        };
      }

      case "echart-radar": {
        var ind = toArr(cfg.indicator);
        var sdR = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.seriesData);
        var dataR = sdR.map(function (d) {
          var o = (typeof d === "object" && d !== null) ? d : { value: d };
          return { value: toArr(o.value), name: o.name != null ? String(o.name) : "" };
        });
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "item", backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          legend: mkLegend(dataR.length > 1),
          radar: { indicator: ind.length ? ind : [{ name: "A", max: 100 }, { name: "B", max: 100 }, { name: "C", max: 100 }], radius: "65%", axisName: { color: subColor, fontSize: 11 } },
          series: [{ type: "radar", data: dataR.length ? dataR : [{ value: [], name: "" }] }],
        };
      }

      case "echart-gauge-basic":
      case "echart-gauge-progress":
      case "echart-gauge-percent": {
        var val = toNum(cfg.value, 0);
        var min = toNum(cfg.min, 0);
        var max = toNum(cfg.max, 100);
        var isPercent = type === "echart-gauge-percent";
        var gaugeTitle = String(cfg.gaugeName || "");
        var unitS = isPercent ? "%" : String(cfg.unit || "");
        var active = getColor(0);
        return {
          title: mkTitle(cfg.title),
          series: [{
            type: "gauge",
            startAngle: toNum(cfg.startAngle, 220),
            endAngle: toNum(cfg.endAngle, -40),
            min: min,
            max: max,
            splitNumber: toNum(cfg.splitNumber, 10),
            radius: cfg.radius || "80%",
            center: Array.isArray(cfg.center) ? cfg.center : ["50%", "60%"],
            axisLine: { lineStyle: { width: toNum(cfg.progressWidth, 16), color: [[1, dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"]] } },
            progress: cfg.showProgress === false ? { show: false } : { show: true, width: toNum(cfg.progressWidth, 16), itemStyle: { color: active } },
            pointer: { show: cfg.showPointer !== false, length: "62%", width: toNum(cfg.pointerWidth, 4), itemStyle: { color: active } },
            axisTick: { show: false },
            splitLine: { show: true, length: 8, lineStyle: { color: subColor, width: 1 } },
            axisLabel: { color: subColor, fontSize: 10, distance: 16 },
            detail: { valueAnimation: true, formatter: "{value}" + unitS, color: textColor, fontSize: 22, offsetCenter: [0, "45%"] },
            title: { show: gaugeTitle !== "", offsetCenter: [0, "72%"], color: subColor, fontSize: 12 },
            data: [{ value: val, name: gaugeTitle }],
          }],
        };
      }

      case "echart-heatmap": {
        var xdH = toArr(cfg.xAxisData);
        var ydH = toArr(cfg.yAxisData);
        var dataH = toArr(cfg.data).map(function (d) {
          if (Array.isArray(d)) return d;
          if (d && typeof d === "object") return [d.x, d.y, d.value];
          return d;
        });
        return {
          title: mkTitle(cfg.title),
          tooltip: { position: "top", backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          grid: { left: "6%", right: "5%", top: 34, bottom: 44, containLabel: true },
          xAxis: mkCatAxis(xdH),
          yAxis: mkCatAxis(ydH),
          visualMap: { min: toNum(cfg.min, 0), max: toNum(cfg.max, 100), calculable: true, orient: "horizontal", left: "center", bottom: 4, textStyle: { color: subColor, fontSize: 10 } },
          series: [{ type: "heatmap", data: dataH, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.4)" } } }],
        };
      }

      case "echart-treemap": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { formatter: function (info) { return info.name + ": " + info.value; }, backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          series: [{ type: "treemap", data: toArr(cfg.data), breadcrumb: cfg.breadcrumb === false ? { show: false } : {}, label: { color: "#fff", fontSize: 11 } }],
        };
      }

      case "echart-sunburst": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          series: [{
            type: "sunburst",
            data: toArr(cfg.data),
            radius: cfg.radius ? toArr(cfg.radius) : ["15%", "75%"],
            sort: cfg.sort || "desc",
            label: { color: "#fff", fontSize: 11 },
          }],
        };
      }

      case "echart-boxplot": {
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("item"),
          grid: mkGrid(),
          xAxis: mkCatAxis(toArr(cfg.categories)),
          yAxis: mkValueAxis(),
          series: [{ type: "boxplot", data: toArr(cfg.data), itemStyle: { color: getColor(0), borderColor: getColor(1) } }],
        };
      }

      case "echart-candlestick": {
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("axis"),
          grid: mkGrid(),
          xAxis: mkCatAxis(toArr(cfg.xAxisData)),
          yAxis: mkValueAxis(),
          dataZoom: cfg.showDataZoom ? mkDataZoom() : undefined,
          series: [{ type: "candlestick", data: toArr(cfg.data), itemStyle: { color: "#E74C3C", color0: "#58D68D", borderColor: "#E74C3C", borderColor0: "#58D68D" } }],
        };
      }

      case "echart-funnel": {
        return {
          title: mkTitle(cfg.title),
          tooltip: mkTooltip("item"),
          legend: mkLegend(true),
          series: [{
            type: "funnel",
            data: toArr(cfg.data),
            sort: cfg.sort || "descending",
            left: cfg.funnelAlign || "center",
            width: "70%",
            label: { show: true, color: textColor, fontSize: 11 },
          }],
        };
      }

      case "echart-sankey": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "item", triggerOn: "mousemove", backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          series: [{
            type: "sankey",
            data: toArr(cfg.nodes),
            links: toArr(cfg.links),
            orient: cfg.orient === "vertical" ? "vertical" : "horizontal",
            draggable: cfg.draggable === true,
            nodeWidth: 14,
            nodeGap: 10,
            emphasis: { focus: "adjacency" },
            lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.35 },
            label: { color: textColor, fontSize: 11 },
          }],
        };
      }

      case "echart-graph": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          legend: mkLegend(false),
          series: [{
            type: "graph",
            layout: cfg.layout || "force",
            data: toArr(cfg.nodes),
            links: toArr(cfg.links),
            categories: toArr(cfg.categories).length ? toArr(cfg.categories) : undefined,
            roam: cfg.roam === true,
            label: { show: true, position: "right", color: textColor, fontSize: 10 },
            force: { repulsion: 120, edgeLength: 80 },
            lineStyle: { color: "source", curveness: 0.3 },
          }],
        };
      }

      case "echart-tree": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "item", triggerOn: "mousemove", backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          series: [{
            type: "tree",
            data: toArr(cfg.data),
            orient: cfg.orient === "horizontal" ? "LR" : "TB",
            expandAndCollapse: cfg.expandAndCollapse !== false,
            initialTreeDepth: toNum(cfg.initialTreeDepth, 2),
            edgeShape: cfg.edgeShape || "curve",
            label: { color: textColor, fontSize: 11 },
            leaves: { label: { color: textColor, fontSize: 11 } },
          }],
        };
      }

      case "echart-themeriver": {
        var dataTR = toArr(cfg.data);
        var times = [];
        for (var i = 0; i < dataTR.length; i++) { if (dataTR[i] && dataTR[i].length > 0 && times.indexOf(String(dataTR[i][0])) === -1) times.push(String(dataTR[i][0])); }
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "item", backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          singleAxis: { type: "category", data: times, bottom: "4%", height: "80%", axisLabel: { color: subColor, fontSize: 10, rotate: mkAxisLabelRotate(cfg.xAxisLabelRotate) }, axisLine: { lineStyle: { color: splitColor } } },
          series: [{ type: "themeRiver", data: dataTR, label: { show: false }, lineStyle: { width: 1 }, itemStyle: { opacity: 0.8, borderWidth: 1, borderColor: dark ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)" } }],
        };
      }

      case "echart-parallel": {
        var dataP = toArr(cfg.data);
        var axesP = toArr(cfg.parallelAxis);
        if (!axesP.length && dataP.length && Array.isArray(dataP[0])) {
          for (var j = 0; j < (dataP[0].length || 1); j++) axesP.push({ dim: j, name: "维度" + (j + 1) });
        }
        return {
          title: mkTitle(cfg.title),
          tooltip: { backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          parallelAxis: axesP,
          parallel: { left: "6%", right: "6%", top: 30, bottom: 12, axisLabel: { color: subColor, fontSize: 10 }, axisLine: { lineStyle: { color: splitColor } } },
          series: [{ type: "parallel", data: dataP, lineStyle: { width: 1, opacity: 0.55 }, emphasis: { lineStyle: { width: 2 } } }],
        };
      }

      case "echart-map": {
        var mapName = cfg.mapName || "china";
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "item", formatter: function (p) { return (p.name || "") + ": " + (p.value != null ? p.value : "-"); }, backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          visualMap: { min: toNum(cfg.visualMapMin, 0), max: toNum(cfg.visualMapMax, 100), left: 8, bottom: 8, calculable: true, textStyle: { color: subColor, fontSize: 10 } },
          series: [{
            type: "map",
            map: mapName,
            roam: cfg.roam === true,
            data: toArr(cfg.data),
            label: { show: false },
            itemStyle: { areaColor: dark ? "rgba(78,140,255,0.4)" : "rgba(78,140,255,0.25)", borderColor: dark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)", borderWidth: 0.5 },
            emphasis: { label: { show: true, color: "#fff", fontSize: 11 }, itemStyle: { areaColor: "rgba(255,183,77,0.7)" } },
          }],
        };
      }

      case "echart-lines": {
        var mapL = cfg.mapName || "china";
        var ldL = (cfg.data != null && Array.isArray(cfg.data)) ? cfg.data : toArr(cfg.linesData);
        var pdL = toArr(cfg.pointsData);
        return {
          title: mkTitle(cfg.title),
          geo: {
            map: mapL,
            roam: true,
            label: { show: false },
            itemStyle: { areaColor: dark ? "rgba(78,140,255,0.2)" : "rgba(78,140,255,0.12)", borderColor: dark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.6)", borderWidth: 0.5 },
          },
          series: [
            { type: "lines", coordinateSystem: "geo", zlevel: 2, effect: { show: cfg.effectShow === true, period: 4, trailLength: 0.2, symbol: "arrow", symbolSize: 6 }, lineStyle: { color: "#58D68D", width: 1, opacity: 0.7, curveness: 0.3 }, data: ldL },
            { type: "effectScatter", coordinateSystem: "geo", zlevel: 3, rippleEffect: { brushType: "stroke" }, symbolSize: 5, itemStyle: { color: "#58D68D" }, data: pdL },
          ],
        };
      }

      case "echart-pictorialbar": {
        return {
          title: mkTitle(cfg.title),
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: "rgba(0,0,0,0.72)", textStyle: { color: "#fff" } },
          grid: mkGrid(),
          xAxis: mkCatAxis(toArr(cfg.categories)),
          yAxis: { type: "value", max: cfg.max != null ? toNum(cfg.max, 100) : undefined, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: subColor, fontSize: 11 }, splitLine: { lineStyle: { color: splitColor, type: "dashed" } } },
          series: [{
            type: "pictorialBar",
            data: toArr(cfg.values),
            symbol: cfg.symbol || "rect",
            symbolSize: cfg.symbolSize ? toArr(cfg.symbolSize) : [10, 18],
            symbolRepeat: cfg.symbolRepeat ? "fixed" : undefined,
            symbolMargin: toNum(cfg.symbolMargin, 2),
            itemStyle: { color: getColor(0) },
            label: { show: false },
          }],
        };
      }

      case "echart-custom": {
        var custom = toObj(cfg.option);
        if (custom) {
          // 用户 JSON option 无法携带函数，custom series 缺 renderItem 时
          // ECharts 会抛 "series.render is required"，兜底为简单柱状渲染
          if (custom.series && custom.series.constructor === Array) {
            for (var ci = 0; ci < custom.series.length; ci++) {
              var cs = custom.series[ci];
              if (cs && cs.type === "custom" && typeof cs.renderItem !== "function") {
                cs.renderItem = function (params, api) {
                  var pos = api.coord([api.value(0), api.value(1)]);
                  var height = Math.max(params.coordSys.y, params.coordSys.y + params.coordSys.height - pos[1]);
                  return {
                    type: "rect",
                    shape: { x: pos[0] - 10, y: pos[1], width: 20, height: height },
                    style: { fill: "#00c1de" }
                  };
                };
              }
            }
          }
          return custom;
        }
        return { title: { text: "自定义图表（codegen 仅支持纯 JSON option）", left: "center", top: "middle", textStyle: { color: subColor, fontSize: 13 } }, series: [] };
      }

      default:
        return { title: { text: type + "（暂不支持）", left: "center", top: "middle", textStyle: { color: subColor, fontSize: 13 } }, series: [] };
    }
  }

  function render() {
    if (!window.echarts) return;
    if (!chart) {
      try {
        chart = echarts.init(container, cfg.theme === "light" ? "" : "dark");
      } catch (e) {
        container.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:' + subColor + ';font-size:12px">图表初始化失败</div>';
        return;
      }
    }
    try {
      var opt = buildOption();
      chart.setOption(opt, true);
    } catch (e) {
      container.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:' + subColor + ';font-size:12px">图表数据格式错误</div>';
    }
  }

  function scheduleFetch() {
    if (!apiMode || (!apiUrl && !apiPath)) return;
    doFetch();
    if (apiInterval > 0) setInterval(doFetch, apiInterval * 1000);
    // 登录/登出后认证态变化 → 立即重取（与统一骨架 dataLoaderScript 行为一致）
    window.addEventListener("auth-state-change", function() { doFetch(); });
  }

  function start() {
    if (type === "echart-map" || type === "echart-lines") {
      var mapName = cfg.mapName || "china";
      ensureMap(mapName, function () {
        render();
        scheduleFetch();
      });
      return;
    }
    render();
    scheduleFetch();
  }

  if (typeof window.echarts === "undefined") {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (typeof window.echarts !== "undefined") { clearInterval(timer); start(); }
      else if (tries > 100) {
        clearInterval(timer);
        container.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:' + subColor + ';font-size:12px">图表库加载失败</div>';
      }
    }, 100);
  } else {
    start();
  }

  window.addEventListener("resize", function () { if (chart) chart.resize(); });
})();`;
}

/**
 * ECharts 组件 codegen — 27 个 echart-* 类型共用本函数
 */
export const echartsCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  const uid = `ech-${Math.random().toString(36).slice(2, 9)}`;

  // echarts 库经组件 HTML 注入（每页一次）
  let libScript = "";
  if (!injectedCtx.has(ctx)) {
    injectedCtx.add(ctx);
    libScript = `<script src="${ECHARTS_CDN}"></script>`;
  }

  // 数据源配置（与 useChartData / dataLoaderScript 骨架一致；authEnabled 传布尔字面量）
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const apiUrl = isApi ? String(c.apiUrl ?? "") : "";
  const apiPath = isApi ? String(c.apiPath ?? "") : "";
  const apiMethod = isApi ? String(c.apiMethod ?? "GET") : "GET";
  const apiDataPath = isApi ? String(c.apiDataPath ?? "") : "";
  const apiHeaders = isApi ? jsonField(c.apiHeaders) : "";
  const apiBody = isApi ? jsonField(c.apiBody) : "";
  const authEnabled = readAuthEnabled(c.authEnabled);
  const apiInterval = isApi ? Number(c.apiInterval ?? 0) : 0;

  const configJson = JSON.stringify(c ?? {}).replace(/</g, "\\u003c");

  const runtime = buildRuntime({
    uid,
    type: component.type,
    configJson,
    apiUrl,
    apiPath,
    apiMethod,
    apiDataPath,
    apiHeaders,
    apiBody,
    authEnabled,
    apiInterval,
  });

  ctx.pageScripts.push(runtime);

  return `${libScript}<div id="${uid}" style="width:100%;height:100%;min-height:60px"></div>`;
};