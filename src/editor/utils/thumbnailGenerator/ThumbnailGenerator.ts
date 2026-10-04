import { componentRegistry } from "../../registry";
import { OrnamentalFrame } from "../../renderers/ornamentalFrame";
import logger from "../../../utils/logger";
import {
  THUMB_W,
  THUMB_H,
  CONCURRENCY,
  RENDER_WAIT_SVG,
  RENDER_WAIT_CANVAS,
  TIMEOUT,
  THUMB_BG,
  SKIP_THUMBNAIL_TYPES,
} from "./constants";
import {
  BORDER_MAP,
  DECO_MAP,
  BORDER_DEFAULTS,
  DECO_DEFAULTS,
  SVG_THUMB_TYPES,
  parseDataVType,
} from "./dataVThumbs";
import {
  DEVICE_SVG_THUMBS,
  BORDER_SVG_THUMBS_EXTRA,
  SCALABLE_BORDER_SVG_THUMBS,
  DECO_SVG_THUMBS,
  generateSvgThumbnail,
} from "./svgThumbs";
import { invokeTauri, svgToDataUrl, captureMount, captureDom } from "./capture";

export class ThumbnailGenerator {
  private offscreen: HTMLDivElement | null = null;
  private active = 0;
  private generating = new Set<string>();
  private generated = new Set<string>();

  getUrl(type: string): string {
    // 与后端 save_thumbnail 保持一致：冒号等非法字符替换为 __
    const safeType = type.replace(/:/g, "__");
    return `/thumbnails/${safeType}.png`;
  }

  async ensureAll(): Promise<void> {
    const allDefs = componentRegistry.getAll();
    const types = allDefs
      .filter((d) => d.enabled !== false && !SKIP_THUMBNAIL_TYPES.has(d.type))
      .map((d) => d.type);

    if (types.length === 0) return;

    let existingMap: Map<string, boolean>;
    try {
      const results = await invokeTauri("check_thumbnails_exist", { types }) as boolean[];
      existingMap = new Map(types.map((t, i) => [t, results[i]]));
    } catch {
      existingMap = new Map(types.map((t) => [t, false]));
    }

    // 设备类型缩略图总是重新生成（设备外观可能随代码更新而变化）
    const deviceTypes = types.filter((t) => t.startsWith("device:"));
    const nonDeviceTypes = types.filter((t) => !t.startsWith("device:"));

    const missing = nonDeviceTypes.filter((t) => !existingMap.get(t) && !this.generated.has(t));
    // 设备类型：无论是否已存在都重新生成
    const deviceMissing = deviceTypes.filter((t) => !this.generated.has(t));

    const allMissing = [...missing, ...deviceMissing];
    if (allMissing.length === 0) {
      logger.info("ThumbnailGenerator", `All ${types.length} thumbnails exist, skipping generation`);
      return;
    }

    logger.info("ThumbnailGenerator", `Generating ${allMissing.length} thumbnails (${deviceMissing.length} device, ${missing.length} other)...`);

    const promises = allMissing.map((type) => this._scheduleGenerate(type));
    await Promise.allSettled(promises);

    logger.info("ThumbnailGenerator", "Thumbnail generation complete");
  }

  async generate(type: string): Promise<string | null> {
    if (SKIP_THUMBNAIL_TYPES.has(type)) return null;
    if (this.generated.has(type)) return this.getUrl(type);

    if (this.generating.has(type)) {
      while (this.generating.has(type)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return this.generated.has(type) ? this.getUrl(type) : null;
    }

    const dataUrl = await this._scheduleGenerate(type);
    return dataUrl ? this.getUrl(type) : null;
  }

  private async _scheduleGenerate(type: string): Promise<string | null> {
    while (this.active >= CONCURRENCY) {
      await new Promise((r) => setTimeout(r, 30));
    }
    this.active++;
    this.generating.add(type);
    try {
      const result = await Promise.race([
        this._generate(type),
        new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT)),
      ]);
      if (result) this.generated.add(type);
      return result;
    } finally {
      this.active--;
      this.generating.delete(type);
    }
  }

  private async _generate(type: string): Promise<string | null> {
    const def = componentRegistry.get(type);
    if (!def) return null;

    try {
      let dataUrl: string | null = null;

      // 设备组件：使用专门的 SVG 缩略图生成（参考金箔雕花边框的做法）
      if (type.startsWith("device:")) {
        dataUrl = await this._generateDeviceSvg(type);
      }

      if (!dataUrl && SVG_THUMB_TYPES.has(type)) {
        dataUrl = await this._generateSvgThumb(type);
      } else if (!dataUrl) {
        const dataVInfo = parseDataVType(type);
        if (dataVInfo && dataVInfo.kind === "border" && dataVInfo.idx === "11") {
          dataUrl = await this._generateOrnamentalFrame();
        } else if (dataVInfo && dataVInfo.kind === "border" && (
          SCALABLE_BORDER_SVG_THUMBS[dataVInfo.idx] ||
          BORDER_SVG_THUMBS_EXTRA[dataVInfo.idx]
        )) {
          const thumbFn = SCALABLE_BORDER_SVG_THUMBS[dataVInfo.idx] || BORDER_SVG_THUMBS_EXTRA[dataVInfo.idx];
          const svgStr = thumbFn(THUMB_W, THUMB_H);
          dataUrl = await svgToDataUrl(svgStr, THUMB_W, THUMB_H);
        } else if (dataVInfo && dataVInfo.kind === "decoration" && DECO_SVG_THUMBS[dataVInfo.idx]) {
          const svgStr = DECO_SVG_THUMBS[dataVInfo.idx](THUMB_W, THUMB_H);
          dataUrl = await svgToDataUrl(svgStr, THUMB_W, THUMB_H);
        } else if (dataVInfo) {
          dataUrl = await this._generateDataV(type, dataVInfo);
        } else {
          dataUrl = await this._generateGeneric(type, def);
        }
      }

      if (dataUrl) {
        await this._saveToDisk(type, dataUrl);
      }

      return dataUrl;
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to generate thumbnail for "${type}":`, { error: String(e) });
      return null;
    }
  }

  private async _generateSvgThumb(type: string): Promise<string | null> {
    const svgStr = generateSvgThumbnail(type);
    if (!svgStr) return null;
    return svgToDataUrl(svgStr, THUMB_W, THUMB_H);
  }

  private async _generateDataV(
    _type: string,
    info: { kind: "border" | "decoration"; idx: string }
  ): Promise<string | null> {
    const compMap = info.kind === "border" ? BORDER_MAP : DECO_MAP;
    const defaults = info.kind === "border" ? BORDER_DEFAULTS : DECO_DEFAULTS;
    const Component = compMap[info.idx];
    if (!Component) return null;

    const defaultColors = defaults[info.idx] || ["#4fd2dd", "#235fa7"];

    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    const props: Record<string, any> = {
      color: defaultColors,
      backgroundColor: "transparent",
      style: { width: "100%", height: "100%" },
    };

    if (info.kind === "border" && info.idx === "11") {
      props.titleWidth = 250;
    }

    root.render(React.createElement(Component, props));

    await new Promise<void>((r) => setTimeout(r, RENDER_WAIT_SVG));

    const dataUrl = await captureMount(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }

  private async _generateOrnamentalFrame(): Promise<string | null> {
    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${THUMB_W}px;height:${THUMB_H}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    root.render(
      React.createElement(OrnamentalFrame, {
        color1: "#e1b86c",
        color2: "#8c5c00",
        backgroundColor: "transparent",
        reverse: false,
      })
    );

    await new Promise<void>((r) => setTimeout(r, RENDER_WAIT_SVG));

    const dataUrl = await captureMount(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }

  private async _generateDeviceSvg(type: string): Promise<string | null> {
    // 设备组件：优先走 React 渲染器（触发 isTemplate 逻辑 → 红色面板 + 绿点 + 产品名），
    // 只有 React 渲染器加载失败时才 fallback 到 DEVICE_SVG_THUMBS 静态 SVG
    const def = componentRegistry.get(type);
    if (def) {
      const reactResult = await this._generateGeneric(type, def);
      if (reactResult) return reactResult;
    }

    // Fallback：使用预定义的静态 SVG（无屏幕内容，仅外壳轮廓）
    const svgGenerator = DEVICE_SVG_THUMBS[type];
    if (!svgGenerator) return null;

    const w = THUMB_W;
    const h = THUMB_H;
    const svgStr = svgGenerator(w, h);
    return svgToDataUrl(svgStr, w, h);
  }

  private async _generateGeneric(type: string, def: any): Promise<string | null> {
    const Renderer = await componentRegistry.loadRenderer(type);
    if (!Renderer) return null;

    const dw = def.defaultSize?.width ?? THUMB_W * 2;
    const dh = def.defaultSize?.height ?? THUMB_H * 2;
    const s = Math.min(THUMB_W / dw, THUMB_H / dh, 1);
    const w = Math.round(dw * s);
    const h = Math.round(dh * s);

    const container = this._offscreen();
    const mount = document.createElement("div");
    mount.style.cssText = `width:${w}px;height:${h}px;position:relative;overflow:hidden;background:${THUMB_BG};border-radius:4px;`;
    container.appendChild(mount);

    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(mount);

    root.render(
      React.createElement(Renderer, {
        config: { ...def.defaultConfig, _thumbnail: true },
        componentId: `thumb-${type}`,
        mode: "preview",
        width: w,
        height: h,
      })
    );

    const usesCanvas = type === "echart" || type.startsWith("echart-");
    const waitMs = usesCanvas ? RENDER_WAIT_CANVAS : RENDER_WAIT_SVG;
    await new Promise<void>((r) => setTimeout(r, waitMs));

    // 设备组件：跳过 SVG 截图，直接走 DOM 截图
    // 原因：SVG 截图会丢失 filter/clipPath 引用、无背景色、低分辨率
    // 而 DOM 截图（toPng）能完整保留 React 渲染效果，与集控器缩略图一致
    const dataUrl = type.startsWith("device:")
      ? await captureDom(mount)
      : await captureMount(mount);

    root.unmount();
    if (mount.parentNode) mount.parentNode.removeChild(mount);

    return dataUrl;
  }

  private async _saveToDisk(type: string, dataUrl: string): Promise<void> {
    try {
      await invokeTauri("save_thumbnail", { componentType: type, dataUrl });
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to save thumbnail for "${type}":`, { error: String(e) });
    }
  }

  private _offscreen(): HTMLDivElement {
    if (!this.offscreen || !document.body.contains(this.offscreen)) {
      this.offscreen = document.createElement("div");
      this.offscreen.setAttribute("aria-hidden", "true");
      this.offscreen.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;pointer-events:none;z-index:-1;";
      document.body.appendChild(this.offscreen);
    }
    return this.offscreen;
  }

  async captureElement(element: HTMLElement, type: string): Promise<string | null> {
    try {
      const dataUrl = await captureDom(element);
      if (dataUrl && type) {
        await this._saveToDisk(type, dataUrl);
      }
      return dataUrl;
    } catch (e) {
      logger.warn("ThumbnailGenerator", `Failed to capture element for "${type}":`, { error: String(e) });
      return null;
    }
  }

  getThumbnailUrl(type: string): string {
    return `${this.getUrl(type)}&t=${Date.now()}`;
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();