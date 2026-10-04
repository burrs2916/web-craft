import { toPng } from "html-to-image";
import { THUMB_W, THUMB_H, THUMB_DPR, THUMB_BG_COLOR } from "./constants";

export async function invokeTauri(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args as any);
}

export function svgToDataUrl(svgStr: string, w: number, h: number): Promise<string | null> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * THUMB_DPR;
      c.height = h * THUMB_DPR;
      const ctx = c.getContext("2d")!;
      ctx.scale(THUMB_DPR, THUMB_DPR);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function captureSvg(mount: HTMLElement): Promise<string | null> {
  const svg = mount.querySelector("svg");
  if (!svg) return null;

  try {
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(THUMB_W));
    clone.setAttribute("height", String(THUMB_H));
    // 保留原 SVG 的 viewBox + 强制 meet 居中（保持设备原始比例）
    const origViewBox = svg.getAttribute("viewBox");
    if (origViewBox) clone.setAttribute("viewBox", origViewBox);
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // 注入背景矩形：解决 SVG 透明区域变成黑色的问题
    // 直接在 <svg> 第一个子元素前插入一个全 viewBox 填充的背景矩形
    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    if (origViewBox) {
      const parts = origViewBox.split(/\s+/).map(Number);
      bgRect.setAttribute("width", String(parts[2] ?? THUMB_W));
      bgRect.setAttribute("height", String(parts[3] ?? THUMB_H));
    } else {
      bgRect.setAttribute("width", String(THUMB_W));
      bgRect.setAttribute("height", String(THUMB_H));
    }
    bgRect.setAttribute("fill", THUMB_BG_COLOR);
    clone.insertBefore(bgRect, clone.firstChild);

    clone
      .querySelectorAll("animate,animateTransform,animateMotion")
      .forEach((e) => e.remove());

    const str = new XMLSerializer().serializeToString(clone);
    return svgToDataUrl(str, THUMB_W, THUMB_H);
  } catch {
    return null;
  }
}

export function captureCanvas(mount: HTMLElement): string | null {
  const canvas = mount.querySelector("canvas");
  if (!canvas) return null;
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function captureDom(mount: HTMLElement): Promise<string | null> {
  try {
    const rect = mount.getBoundingClientRect();
    const dataUrl = await toPng(mount, {
      width: rect.width || THUMB_W,
      height: rect.height || THUMB_H,
      pixelRatio: THUMB_DPR,
      backgroundColor: THUMB_BG_COLOR,
      skipAutoScale: true,
      fetchRequestInit: {
        cache: "no-store",
      } as RequestInit,
    });
    return dataUrl;
  } catch {
    return null;
  }
}

export async function captureMount(mount: HTMLElement): Promise<string | null> {
  const svgResult = await captureSvg(mount);
  if (svgResult) return svgResult;

  const canvasResult = captureCanvas(mount);
  if (canvasResult) return canvasResult;

  const domResult = await captureDom(mount);
  if (domResult) return domResult;

  return null;
}