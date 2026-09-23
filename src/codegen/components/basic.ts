import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { shapeSpec } from "../../editor/data/decorationShape";
import { renderDecorSpec, decorUid } from "./decoration";
import { dataLoaderScript } from "../dataLoader";
import { buildMetricIconSvg } from "../../editor/utils/metricIcons";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * image 组件 → HTML
 * 配置：source, fit, borderRadius
 */
/**
 * shape 组件 → HTML
 * 配置：shapeType(rect/circle/ellipse/line/triangle/diamond/star/polygon/cross/dashed-box),
 *       fill / gradientEnabled+gradientFrom/To/Direction,
 *       stroke / strokeWidth / borderStyle / borderRadius、sides/points/innerRatio/thickness/
 *       lineDirection/dashLength/gapLength、opacity、shadow
 *
 * 与编辑区 `ShapeRenderer` 共用 `editor/data/decorationShape.ts` 的 `shapeSpec` 与同一个
 * SVG 发射器 —— 形状组与装饰组画同一形状时产物逐字一致，不存在两套几何字面量。
 */
export const shapeCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = (component.config ?? {}) as Record<string, unknown>;
  const t = component.transform as { width?: number; height?: number } | undefined;
  const spec = shapeSpec(c, { width: t?.width, height: t?.height, uid: decorUid(component.id) });
  /* 阴影已由 shapeSpec → decorationShape 写进 spec.boxCss.filter（与装饰组同一层、同一映射），
     此处不再二次施加，避免"两处各写一份阴影"的老毛病。 */
  return renderDecorSpec(spec, ctx);
};

/**
 * metric 组件 → HTML
 * 完整对齐 MetricRenderer：精度格式化、趋势箭头、状态规则、顶部强调条
 * 配置：title, value, unit, prefix, suffix, precision, showTrend,
 *       color, valueColor, titleColor, unitColor, fontSize, titleFontSize,
 *       backgroundColor, borderRadius, padding, statusRules, field
 * 数据源：dataMode(static|api|datasource), apiUrl/apiPath/apiMethod/apiBody,
 *         apiHeaders, apiInterval, apiDataPath, authEnabled —— api 模式统一走
 *         dataLoaderScript 骨架取数，回调注入 update/setStatus
 */
export const metricCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const title = escapeHTML(String(c.title ?? ""));
  const subtitle = escapeHTML(String(c.subtitle ?? ""));
  const prefix = escapeHTML(String(c.prefix ?? ""));
  const suffix = escapeHTML(String(c.suffix ?? ""));
  const unit = escapeHTML(String(c.unit ?? ""));
  const rawValue = c.value ?? "--";
  const field = String(c.field ?? "");

  const precision = Number(c.precision ?? 1);
  const showTrend = c.showTrend !== false;
  const color = String(c.color ?? "#2196F3");
  const valueColor = String(c.valueColor ?? color);
  const titleColor = String(c.titleColor ?? "rgba(255,255,255,0.5)");
  const subtitleColor = String(c.subtitleColor ?? "rgba(255,255,255,0.35)");
  const unitColor = String(c.unitColor ?? "rgba(255,255,255,0.4)");
  const prefixColor = String(c.prefixColor ?? unitColor);
  const suffixColor = String(c.suffixColor ?? unitColor);
  const fontSize = Number(c.fontSize ?? 28);
  const titleFontSize = Number(c.titleFontSize ?? 11);
  const subtitleFontSize = Number(c.subtitleFontSize ?? 10);
  const backgroundColor = String(c.backgroundColor ?? "rgba(0,0,0,0.2)");
  const borderRadius = Number(c.borderRadius ?? 4);
  const padding = Number(c.padding ?? 12);
  const icon = escapeHTML(String(c.icon ?? ""));
  const layout = String(c.layout ?? "vertical");

  // ── 数据源配置 ──
  const dataMode = String(c.dataMode ?? "static");
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const apiMethod = String(c.apiMethod ?? "GET");
  const apiInterval = Number(c.apiInterval ?? 0) || 0;
  const apiDataPath = String(c.apiDataPath ?? "");
  const apiHeaders = String(c.apiHeaders ?? "");
  const apiBody = String(c.apiBody ?? "");
  const authEnabled = readAuthEnabled(c.authEnabled);

  // 状态规则
  const statusRules = Array.isArray(c.statusRules) ? c.statusRules as Array<{ min?: number; max?: number; color?: string; label?: string }> : [];

  // 数值解析 + 精度（千分位格式化与编辑端 toLocaleString("en-US") 一致）
  const numericValue = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
  const isNumeric = !isNaN(numericValue);
  const displayValue = isNumeric
    ? numericValue.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision })
    : String(rawValue ?? "--");

  // 匹配状态规则
  let activeColor = valueColor;
  let activeLabel = "";
  if (isNumeric && statusRules.length > 0) {
    for (const rule of statusRules) {
      const minOk = rule.min === undefined || numericValue >= rule.min;
      const maxOk = rule.max === undefined || numericValue < rule.max;
      if (minOk && maxOk) {
        if (rule.color) activeColor = rule.color;
        if (rule.label) activeLabel = rule.label;
        break;
      }
    }
  }

  const uid = `metric-${Math.random().toString(36).slice(2, 9)}`;
  const isHorizontal = layout === "horizontal";
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");

  // 容器样式
  const containerStyles = [
    "width: 100%",
    "height: 100%",
    "display: flex",
    `flex-direction: ${isHorizontal ? "row" : "column"}`,
    `align-items: ${isHorizontal ? "center" : "stretch"}`,
    `justify-content: ${isHorizontal ? "space-between" : "center"}`,
    `padding: ${padding / 8}px`,
    `background-color: ${backgroundColor}`,
    `border-radius: ${borderRadius}px`,
    `border: 1px solid ${activeColor}22`,
    "position: relative",
    "overflow: hidden",
    "box-sizing: border-box",
  ];

  // 顶部强调条
  const accentBar = `<div class="${uid}-accent" style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg, ${activeColor}, ${activeColor}88);transition:background 0.3s ease;"></div>`;

  // 图标（Lucide 风格 SVG，未知图标名降级不渲染）
  const iconHtml = icon && buildMetricIconSvg(icon, Math.round(fontSize * 0.7), activeColor)
    ? `<span style="display:inline-flex;align-items:center;${isHorizontal ? "margin-right:8px;" : "margin-bottom:4px;"}opacity:0.8;line-height:1;">${buildMetricIconSvg(icon, Math.round(fontSize * 0.7), activeColor)}</span>`
    : "";

  // 标题 + 副标题
  const titleHtml = title
    ? `<div style="flex:1;min-width:0;"><div style="color:${titleColor};${subtitle ? "margin-bottom:2px;" : "margin-bottom:6px;"}font-size:${titleFontSize}px;letter-spacing:0.5px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>${subtitle ? `<div style="color:${subtitleColor};margin-bottom:4px;font-size:${subtitleFontSize}px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subtitle}</div>` : ""}</div>`
    : "";

  // 数值行
  const prefixHtml = prefix ? `<span style="color:${prefixColor};font-size:${Math.round(fontSize * 0.45)}px;line-height:1;">${prefix}</span>` : "";
  const valueHtml = `<span class="${uid}-value" style="font-weight:700;color:${activeColor};line-height:1;font-size:${fontSize}px;transition:color 0.3s ease;">${escapeHTML(displayValue)}</span>`;
  const unitHtml = unit ? `<span style="color:${unitColor};font-size:${Math.round(fontSize * 0.4)}px;line-height:1;">${unit}</span>` : "";
  const suffixHtml = suffix ? `<span style="color:${suffixColor};font-size:${Math.round(fontSize * 0.4)}px;line-height:1;">${suffix}</span>` : "";

  // 趋势 + 百分比
  const trendPlaceholder = showTrend ? `<span class="${uid}-trend" style="display:none;align-items:center;margin-left:4px;gap:2px;"></span>` : "";

  // API 加载/错误状态（仅 api 模式渲染，由运行时 JS 更新）
  const statusPlaceholder = dataMode === "api" ? `<span class="${uid}-status" style="display:none;font-size:9px;margin-top:2px;line-height:1;opacity:0.7;"></span>` : "";
  const valueRow = `<div style="display:flex;align-items:baseline;gap:4px;flex-shrink:0;">${prefixHtml}${valueHtml}${unitHtml}${suffixHtml}${trendPlaceholder}</div>${statusPlaceholder}`;

  // 状态标签
  const statusLabel = activeLabel ? `<div style="color:${activeColor};font-size:9px;margin-top:4px;opacity:0.7;">${escapeHTML(activeLabel)}</div>` : "";

  // ── JS 动态逻辑：field 绑定 / showTrend / API 数据注入（取数由 dataLoaderScript 骨架承担） ──
  const needsJs = field || showTrend || dataMode === "api";

  let jsCode = "";
  if (needsJs) {
    jsCode = `<script>
(function(){
  // 优先挂到组件包装层（data-component-id，数据层绑定事件派发目标），
  // 兜底回退组件内部 uid 容器
  var el = document.querySelector('[data-component-id=${JSON.stringify(component.id)}]') || document.getElementById("${uid}");
  if (!el) return;
  var valueSpan = el.querySelector(".${uid}-value");
  var trendSpan = el.querySelector(".${uid}-trend");
  var statusSpan = el.querySelector(".${uid}-status");
  var precision = ${precision};
  var showTrend = ${showTrend};
  var field = ${JSON.stringify(field)};
  var statusRules = ${JSON.stringify(statusRules)};
  var valueColor = ${JSON.stringify(valueColor)};
  var fontSize = ${fontSize};
  var dataMode = ${JSON.stringify(dataMode)};

  function fmtVal(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (isNaN(n)) return String(v ?? "--");
    return n.toLocaleString("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision });
  }

  function setStatus(text, color) {
    if (!statusSpan) return;
    if (text) {
      statusSpan.textContent = text;
      if (color) statusSpan.style.color = color;
      statusSpan.style.display = "inline";
    } else {
      statusSpan.style.display = "none";
    }
  }

  function matchStatus(n) {
    if (!statusRules || statusRules.length === 0) return null;
    for (var i = 0; i < statusRules.length; i++) {
      var r = statusRules[i];
      var minOk = r.min === undefined || n >= r.min;
      var maxOk = r.max === undefined || n < r.max;
      if (minOk && maxOk) return r;
    }
    return null;
  }

  function getTrendIcon(direction) {
    var sz = Math.round(fontSize*0.5);
    if (direction === "up") return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z" fill="#4CAF50"/></svg>';
    if (direction === "down") return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="#F44336"/></svg>';
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24"><path d="M3 12h18" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2"/></svg>';
  }

  var prevValue = null;

  function update(rawValue) {
    var n = typeof rawValue === "number" ? rawValue : parseFloat(rawValue);
    var isNum = !isNaN(n);
    var disp = fmtVal(rawValue);
    if (valueSpan) valueSpan.textContent = disp;

    var activeColor = valueColor;
    var st = isNum ? matchStatus(n) : null;
    if (st && st.color) activeColor = st.color;
    if (valueSpan) valueSpan.style.color = activeColor;
    var accent = el.querySelector(".${uid}-accent");
    if (accent) accent.style.background = "linear-gradient(90deg, " + activeColor + ", " + activeColor + "88)";
    if (el) el.style.borderColor = activeColor + "22";

    if (showTrend && trendSpan) {
      var direction = "none";
      var pctStr = "";
      // 静态模式值不追趋势（避免虚假 flat）；仅 API/数据源等动态更新时展示
      if (dataMode !== "static" && prevValue !== null && isNum && prevValue !== 0) {
        if (n > prevValue) direction = "up";
        else if (n < prevValue) direction = "down";
        else direction = "flat";
        var diff = ((n - prevValue) / Math.abs(prevValue)) * 100;
        pctStr = (diff >= 0 ? "+" : "-") + Math.abs(diff).toFixed(1) + "%";
      }
      if (direction !== "none") {
        trendSpan.style.display = "flex";
        var trendColor = direction === "up" ? "#4CAF50" : direction === "down" ? "#F44336" : "rgba(255,255,255,0.3)";
        trendSpan.innerHTML = getTrendIcon(direction) + (pctStr ? '<span style="color:' + trendColor + ';font-size:' + fontSize * 0.4 + 'px;font-weight:600;line-height:1;">' + pctStr + '</span>' : '');
      } else {
        trendSpan.style.display = "none";
      }
      if (isNum) prevValue = n;
    }
  }

  // 初次渲染
  update(${JSON.stringify(rawValue)});

  // field 绑定：监听 data-update 事件
  if (field) {
    el.addEventListener("data-update", function(e) {
      var detail = e.detail || {};
      var val = detail[field] !== undefined ? detail[field] : (detail.value !== undefined ? detail.value : rawValue);
      update(val);
    });
  }

  // 暴露给 dataLoaderScript 骨架的回调：数据到达 → 更新值并清除状态文案
  window["__wcMtr_${uid}"] = function(v){ update(v); setStatus(""); };
  window["__wcMtrS_${uid}"] = setStatus;
})();
</script>`;
  }

  // ── API 模式：dataLoaderScript 统一取数骨架（URL/认证/请求体/轮询），回调注入上方 mount ──
  let loaderScript = "";
  if (isApi) {
    loaderScript = dataLoaderScript({
      container: `var el = document.querySelector('[data-component-id=${JSON.stringify(component.id)}]') || document.getElementById("${uid}");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `if (window["__wcMtr_${uid}"]) window["__wcMtr_${uid}"](data);`,
      onFetchStart: `if (window["__wcMtrS_${uid}"]) window["__wcMtrS_${uid}"]("加载中…");`,
      onFetchFail: `if (window["__wcMtrS_${uid}"]) window["__wcMtrS_${uid}"]("请求失败");`,
      onFetchError: `if (window["__wcMtrS_${uid}"]) window["__wcMtrS_${uid}"]("加载失败");`,
    });
  }

  return `<div id="${uid}" style="${containerStyles.join("; ")}">${accentBar}${iconHtml}${titleHtml}${valueRow}${statusLabel}</div>${jsCode}${loaderScript}`;
};
