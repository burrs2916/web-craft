import type { ComponentCodegenFn, CodegenContext } from "../types";
import type { SceneComponent } from "../../types/editor";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { MATERIAL_ICON_PATHS } from "../materialIcons";
import { readAuthEnabled } from "../../editor/data/authMode";

interface CarouselSlide {
  title: string;
  description: string;
  imageUrl: string;
  bgColor: string;
  icon?: string;
}

const DEFAULT_SLIDES: CarouselSlide[] = [
  { title: "轮播一", description: "这是第一张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(255,152,0,0.15)", icon: "auto_awesome" },
  { title: "轮播二", description: "这是第二张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(33,150,243,0.15)", icon: "speed" },
  { title: "轮播三", description: "这是第三张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(76,175,80,0.15)", icon: "whatshot" },
];

function normalizeItem(item: Record<string, unknown>, i: number): CarouselSlide {
  return {
    title: String(item?.title ?? `轮播 ${i + 1}`),
    description: String(item?.description ?? ""),
    imageUrl: String(item?.imageUrl ?? item?.image ?? ""),
    bgColor: String(item?.bgColor ?? item?.bg ?? ""),
    icon: String(item?.icon ?? "") || undefined,
  };
}

function parseSlides(input: unknown): CarouselSlide[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => normalizeItem(item as Record<string, unknown>, i));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item, i) => normalizeItem(item as Record<string, unknown>, i));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "轮播 1", description: "", imageUrl: "", bgColor: "" }];
        }
      } catch {
        // fall through
      }
    }
  }
  return [...DEFAULT_SLIDES];
}

interface SlideRenderOpts {
  transition: string;
  objectFit: string;
  titleColor: string;
  titleFontSize: number;
  descColor: string;
  descFontSize: number;
}

/** 编译期：将单条 slide 渲染为 HTML（静态首屏内容，无 JS 也可见） */
function slideToHTML(slide: CarouselSlide, i: number, uid: string, o: SlideRenderOpts, ctx: CodegenContext): string {
  const slideBg = slide.bgColor || "rgba(255,255,255,0.05)";
  const bgImage = slide.imageUrl
    ? `background-image:url(${slide.imageUrl});background-size:${o.objectFit};background-position:center;background-repeat:no-repeat;`
    : "";
  const titleShadow = slide.imageUrl
    ? "text-shadow:0 1px 4px rgba(0,0,0,0.5);background:rgba(0,0,0,0.4);padding:4px 12px;border-radius:4px;"
    : "text-shadow:0 1px 4px rgba(0,0,0,0.3);";
  const descShadow = slide.imageUrl
    ? "text-shadow:0 1px 4px rgba(0,0,0,0.5);background:rgba(0,0,0,0.35);padding:4px 10px;border-radius:4px;"
    : "text-shadow:0 1px 4px rgba(0,0,0,0.3);";

  const slideStyle = [
    "position:absolute",
    "inset:0",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "padding:24px",
    "box-sizing:border-box",
    `background-color:${slideBg}`,
    bgImage,
    o.transition === "fade"
      ? `opacity:${i === 0 ? 1 : 0}`
      : `transform:translateX(${(i - 0) * 100}%)`,
    o.transition === "fade" ? "transition:opacity 0.4s ease" : "transition:transform 0.35s ease",
    i === 0 ? "z-index:2" : "z-index:1",
    "pointer-events:none",
  ].filter(Boolean).join(";");

  let inner = "";
  if (slide.icon) {
    inner += `<span style="display:flex;align-items:center;justify-content:center;color:${o.titleColor};margin-bottom:${slide.title ? "10px" : "0"};filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35))">${renderMenuIcon(slide.icon, Math.round(o.titleFontSize * 1.45), ctx)}</span>`;
  }
  if (slide.title) {
    inner += `<span style="color:${o.titleColor};font-size:${o.titleFontSize}px;font-weight:600;text-align:center;margin-bottom:${slide.description ? "8px" : "0"};${titleShadow}">${escapeHTML(slide.title)}</span>`;
  }
  if (slide.description) {
    inner += `<span style="color:${o.descColor};font-size:${o.descFontSize}px;text-align:center;max-width:80%;line-height:1.5;${descShadow}">${escapeHTML(slide.description)}</span>`;
  }

  return `<div class="${uid}-slide" data-index="${i}" style="${slideStyle}">${inner}</div>`;
}

/**
 * carousel 组件 -> HTML
 * 配置：slides(JSON), autoplay, interval, showArrows, showDots,
 *       transition(slide/fade), arrowColor, dotColor, dotActiveColor,
 *       titleColor, titleFontSize, descColor, descFontSize, borderRadius, objectFit
 *
 * 数据源：dataMode(static|api) —— API 模式下复用 dataLoaderScript 骨架，
 *        fetch 到的数组（或 data.slides/items/list）重建幻灯片与圆点。
 */
export const carouselCodegen: ComponentCodegenFn = (
  component: SceneComponent,
  ctx: CodegenContext,
) => {
  const c = component.config;

  // 静态内容：统一 staticData 字段优先（与 list 一致），空则回退自有 slides
  const hasExplicitStaticData = c.staticData != null && c.staticData !== "";
  const slides = parseSlides(hasExplicitStaticData ? c.staticData : c.slides);
  const autoplay = c.autoplay !== false;
  const intervalRaw = Number(c.interval ?? 4000);
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 4000;
  const showArrows = c.showArrows !== false;
  const showDots = c.showDots !== false;
  const transition = String(c.transition ?? "slide");
  const arrowColor = String(c.arrowColor ?? "rgba(255,255,255,0.8)");
  const dotColor = String(c.dotColor ?? "rgba(255,255,255,0.3)");
  const dotActiveColor = String(c.dotActiveColor ?? "#ffffff");
  const titleColor = String(c.titleColor ?? "#ffffff");
  const titleFontSize = Number(c.titleFontSize ?? 22);
  const descColor = String(c.descColor ?? "rgba(255,255,255,0.7)");
  const descFontSize = Number(c.descFontSize ?? 14);
  const borderRadius = Number(c.borderRadius ?? 8);
  // objectFit 二值化：仅 cover/contain，与编辑器（CarouselRenderer）保持一致，避免自定义值进入 background-size
  const objectFitRaw = String(c.objectFit ?? "cover");
  const objectFit = objectFitRaw === "cover" ? "cover" : "contain";

  // 数据源：API 动态拉取（走统一 dataMode 协议）
  const apiUrl = String(c.apiUrl ?? "");
  const apiPath = String(c.apiPath ?? "");
  const isApi = String(c.dataMode ?? "static") === "api" && (apiUrl !== "" || apiPath !== "");
  const apiMethod = String(c.apiMethod ?? "GET");
  const apiHeaders = String(c.apiHeaders ?? "");
  const apiBody = String(c.apiBody ?? "");
  const apiInterval = Number(c.apiInterval ?? 0) || 0;
  const apiDataPath = String(c.apiDataPath ?? "");
  const authEnabled = readAuthEnabled(c.authEnabled);

  const uid = `crsl-${Math.random().toString(36).slice(2, 9)}`;

  const o: SlideRenderOpts = { transition, objectFit, titleColor, titleFontSize, descColor, descFontSize };

  // 首屏内容：静态 slides（接口模式不渲染本地占位，由运行时取数填充）
  const trackHTML = isApi ? "" : slides.map((s, i) => slideToHTML(s, i, uid, o, ctx)).join("");

  // Arrows
  const arrowStyle = `position:absolute;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:rgba(0,0,0,0.3);cursor:pointer;z-index:10;color:${arrowColor};transition:background-color 0.2s`;
  const arrowIcon = `<svg viewBox="0 0 24 24" fill="currentColor" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;display:block"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`;
  const arrowIconR = `<svg viewBox="0 0 24 24" fill="currentColor" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;display:block"><path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>`;
  const arrowsHTML = `<div class="${uid}-prev" data-target="${uid}" style="${arrowStyle};left:8px;top:50%;transform:translateY(-50%)">${arrowIcon}</div><div class="${uid}-next" data-target="${uid}" style="${arrowStyle};right:8px;top:50%;transform:translateY(-50%)">${arrowIconR}</div>`;

  // Dots（运行时由 mount 填充，数量随数据变化）
  const dotsbarHTML = `<div class="${uid}-dotsbar" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10"></div>`;

  const script = `
<script>
(function(){
  var uid = "${uid}";
  var autoplay = ${autoplay};
  var interval = ${interval};
  var transition = "${transition}";
  var showArrows = ${showArrows};
  var showDots = ${showDots};
  var dotActiveColor = "${dotActiveColor}";
  var dotColor = "${dotColor}";
  var titleColor = "${titleColor}";
  var titleFontSize = ${titleFontSize};
  var descColor = "${descColor}";
  var descFontSize = ${descFontSize};
  var objectFit = "${objectFit}";

  var wrap = document.querySelector('[data-carousel-uid="' + uid + '"]');
  var track = wrap.querySelector('.' + uid + '-track');
  var dotsbar = wrap.querySelector('.' + uid + '-dotsbar');
  var prevBtn = wrap.querySelector('.' + uid + '-prev');
  var nextBtn = wrap.querySelector('.' + uid + '-next');

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  var iconPaths = ${isApi ? JSON.stringify(MATERIAL_ICON_PATHS) : "{}"};
  var iconSize = ${Math.round(titleFontSize * 1.45)};

  // 运行时图标渲染：与编译期 renderMenuIcon 行为对齐（本地 path 表 + widgets 兜底；custom- 仅编译期可渲染）
  function renderIcon(icon, size){
    if (!icon) return "";
    icon = String(icon);
    if (icon.indexOf("custom-") === 0) return "";
    if (/^data:|^https?:\\/\\//i.test(icon)) return '<img src="' + esc(icon) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;flex-shrink:0">';
    if (icon.indexOf("text:") === 0) return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(icon.slice(5)) + '</span>';
    var name = icon.indexOf("material:") === 0 ? icon.slice(9) : icon;
    if (iconPaths[name]) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths[name] + '</svg>';
    if (!/^\\p{Emoji}/u.test(name)) return '<svg viewBox="0 0 24 24" style="width:' + size + 'px;height:' + size + 'px;fill:currentColor;flex-shrink:0" aria-hidden="true">' + iconPaths.widgets + '</svg>';
    return '<span style="font-size:' + size + 'px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">' + esc(name) + '</span>';
  }
  function cssSafe(v){ return String(v).replace(/["'\\\\]/g, ""); }

  function buildSlide(it, i){
    it = it || {};
    var bg = cssSafe(it.bgColor || it.bg || "rgba(255,255,255,0.05)");
    var img = it.imageUrl || it.image || "";
    var title = it.title == null ? "轮播 " + (i + 1) : String(it.title);
    var desc = it.description == null ? "" : String(it.description);
    var icn = it.icon ? renderIcon(String(it.icon), iconSize) : "";
    var bgImage = img ? "background-image:url(" + cssSafe(img) + ");background-size:" + objectFit + ";background-position:center;background-repeat:no-repeat;" : "";
    var titleSh = img ? "text-shadow:0 1px 4px rgba(0,0,0,0.5);background:rgba(0,0,0,0.4);padding:4px 12px;border-radius:4px;" : "text-shadow:0 1px 4px rgba(0,0,0,0.3);";
    var descSh = img ? "text-shadow:0 1px 4px rgba(0,0,0,0.5);background:rgba(0,0,0,0.35);padding:4px 10px;border-radius:4px;" : "text-shadow:0 1px 4px rgba(0,0,0,0.3);";
    var styles = [
      "position:absolute","inset:0","display:flex","flex-direction:column","align-items:center","justify-content:center","padding:24px","box-sizing:border-box","background-color:" + bg,
      bgImage,
      transition === "fade" ? ("opacity:" + (i === 0 ? 1 : 0)) : ("transform:translateX(" + (i * 100) + "%)"),
      transition === "fade" ? "transition:opacity 0.4s ease" : "transition:transform 0.35s ease",
      i === 0 ? "z-index:2" : "z-index:1",
      "pointer-events:none"
    ].join(";");
    var inner = "";
    if (icn) inner += '<span style="display:flex;align-items:center;justify-content:center;color:' + titleColor + ';margin-bottom:' + (title ? "10px" : "0") + ';filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35))">' + icn + '</span>';
    if (title) inner += '<span style="color:' + titleColor + ';font-size:' + titleFontSize + 'px;font-weight:600;text-align:center;margin-bottom:' + (desc ? "8px" : "0") + ';' + titleSh + '">' + esc(title) + '</span>';
    if (desc) inner += '<span style="color:' + descColor + ';font-size:' + descFontSize + 'px;text-align:center;max-width:80%;line-height:1.5;' + descSh + '">' + esc(desc) + '</span>';
    return '<div class="' + uid + '-slide" data-index="' + i + '" style="' + styles + '">' + inner + '</div>';
  }

  function buildDots(count){
    var s = "";
    for (var i = 0; i < count; i++) {
      var w = i === 0 ? 20 : 8;
      var bg = i === 0 ? dotActiveColor : dotColor;
      s += '<div class="' + uid + '-dot" data-index="' + i + '" style="width:' + w + 'px;height:8px;border-radius:4px;background:' + bg + ';cursor:pointer;transition:all 0.25s ease"></div>';
    }
    return s;
  }

  function applyState(cur, slides, dots){
    for (var i = 0; i < slides.length; i++) {
      if (transition === "fade") { slides[i].style.opacity = i === cur ? "1" : "0"; slides[i].style.zIndex = i === cur ? "2" : "1"; }
      else { slides[i].style.transform = "translateX(" + ((i - cur) * 100) + "%)"; slides[i].style.zIndex = i === cur ? "2" : "1"; }
    }
    for (var j = 0; j < dots.length; j++) {
      dots[j].style.width = j === cur ? "20px" : "8px";
      dots[j].style.background = j === cur ? dotActiveColor : dotColor;
    }
  }

  var gCurrent = 0, gCount = 1, autoplayTimer = null;
  // 记住编译期生成的 display（grid），显隐时恢复原值——赋 "" 会把内联 display 整个删掉导致图标失去居中上下文
  var prevBaseDisplay = prevBtn ? prevBtn.style.display : "";
  var nextBaseDisplay = nextBtn ? nextBtn.style.display : "";

  function doUpdate(){
    gCount = track.querySelectorAll('.' + uid + '-slide').length || 1;
    if (gCurrent >= gCount) gCurrent = 0;
    applyState(gCurrent, track.querySelectorAll('.' + uid + '-slide'), dotsbar ? dotsbar.querySelectorAll('.' + uid + '-dot') : []);
  }
  function goNext(){ gCurrent = (gCurrent + 1) % gCount; doUpdate(); }
  function goPrev(){ gCurrent = (gCurrent - 1 + gCount) % gCount; doUpdate(); }
  function stopAutoplay(){ if (autoplayTimer){ clearInterval(autoplayTimer); autoplayTimer = null; } }
  function startAutoplay(){ stopAutoplay(); if (autoplay && gCount > 1) autoplayTimer = setInterval(goNext, interval); }

  function mount(data){
    if (data != null) {
      var raw = Array.isArray(data) ? data : (data && (data.slides || data.items || data.list)) ? (data.slides || data.items || data.list) : [data];
      var list = [];
      for (var k = 0; k < raw.length; k++) if (raw[k]) list.push(raw[k]);
      if (list.length > 0) {
        var html = "";
        for (var m = 0; m < list.length; m++) html += buildSlide(list[m], m);
        track.innerHTML = html;
      }
    } else if (track.querySelectorAll('.' + uid + '-slide').length === 0) {
      track.innerHTML = buildSlide({}, 0);
    }

    var slides = track.querySelectorAll('.' + uid + '-slide');
    gCount = slides.length || 1;
    if (gCurrent >= gCount) gCurrent = 0;

    if (dotsbar) dotsbar.innerHTML = (showDots && gCount > 1) ? buildDots(gCount) : "";
    var dots = dotsbar ? dotsbar.querySelectorAll('.' + uid + '-dot') : [];

    if (prevBtn) prevBtn.style.display = (showArrows && gCount > 1) ? prevBaseDisplay : "none";
    if (nextBtn) nextBtn.style.display = (showArrows && gCount > 1) ? nextBaseDisplay : "none";

    applyState(gCurrent, slides, dots);

    // 圆点随 innerHTML 重建，每次 mount 绑定到新元素，无残留监听
    for (var d = 0; d < dots.length; d++) {
      (function(idx){ dots[d].addEventListener("click", function(){ gCurrent = idx; doUpdate(); }); })(d);
    }

    startAutoplay();
  }

  // 箭头为静态元素，仅绑定一次
  if (prevBtn) prevBtn.addEventListener("click", goPrev);
  if (nextBtn) nextBtn.addEventListener("click", goNext);

  window["__wcCrsl_" + uid] = mount;
  mount();
})();
</script>`;

  const outerStyle = [
    "position:relative",
    "width:100%",
    "height:100%",
    "overflow:hidden",
    `border-radius:${borderRadius}px`,
    "background:rgba(0,0,0,0.2)",
  ].join(";");

  // API 模式：附加数据加载脚本，fetch 到后重建幻灯片
  let loader = "";
  if (isApi) {
    loader = dataLoaderScript({
      container: `var el = document.getElementById("${uid}-inner");`,
      apiUrl,
      apiPath,
      apiMethod,
      apiHeaders,
      apiBody,
      apiInterval,
      apiDataPath,
      authEnabled,
      renderBody: `window["__wcCrsl_${uid}"](data);`,
    });
  }

  return `<div data-carousel-uid="${uid}" style="${outerStyle}"><div class="${uid}-track" id="${uid}-inner" style="width:100%;height:100%;position:relative">${trackHTML}</div>${arrowsHTML}${dotsbarHTML}</div>${script}${loader}`;
};