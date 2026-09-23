import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logger } from "./logger";

const COMPONENT_PREVIEW_STORAGE_KEY = "component_preview_config";

export interface ComponentPreviewConfig {
  pluginType: string;
  pluginName: string;
  pluginDescription: string;
  pluginIcon: string;
  defaultConfig: Record<string, any>;
  defaultSize: { width: number; height: number } | null;
}

export function saveComponentPreviewConfig(config: ComponentPreviewConfig) {
  try {
    localStorage.setItem(COMPONENT_PREVIEW_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    logger.error("PreviewWindow", "Failed to save component preview config", { error: String(e) });
  }
}

export function loadComponentPreviewConfig(): ComponentPreviewConfig | null {
  try {
    const raw = localStorage.getItem(COMPONENT_PREVIEW_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    logger.error("PreviewWindow", "Failed to load component preview config", { error: String(e) });
  }
  return null;
}

export function clearComponentPreviewConfig() {
  try {
    localStorage.removeItem(COMPONENT_PREVIEW_STORAGE_KEY);
  } catch (e) {
    logger.error("PreviewWindow", "Failed to clear component preview config", { error: String(e) });
  }
}

export async function openPreviewWindow(sceneId: string, sceneName: string) {
  const label = `preview-${sceneId}`;
  logger.info("PreviewWindow", "Opening preview window", { sceneId, sceneName, label });

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    logger.info("PreviewWindow", "Preview window already exists, focusing", { label });
    existing.setFocus();
    return existing;
  }

  const mainWindow = getCurrentWindow();
  const mainSize = await mainWindow.innerSize();
  const scaleFactor = await mainWindow.scaleFactor();

  const width = Math.min(Math.round(mainSize.width / scaleFactor), 1280);
  const height = Math.min(Math.round(mainSize.height / scaleFactor), 800);

  logger.info("PreviewWindow", "Creating preview window", {
    label,
    width,
    height,
    url: `/preview/${sceneId}?mode=preview`,
  });

  const win = new WebviewWindow(label, {
    url: `/preview/${sceneId}?mode=preview`,
    title: `${sceneName} - 预览`,
    width,
    height,
    minWidth: 640,
    minHeight: 480,
    decorations: true,
    resizable: true,
    fullscreen: false,
    center: true,
    dragDropEnabled: false,
  });

  win.once("tauri://error", (e) => {
    logger.error("PreviewWindow", "Window creation error", {
      label,
      error: String(e.payload),
    });
  });

  logger.info("PreviewWindow", "Preview window created", { label });
  return win;
}

export async function openLiveWindow(sceneId: string, sceneName: string) {
  const label = `live-${sceneId}`;
  logger.info("PreviewWindow", "Opening live window", { sceneId, sceneName, label });

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    logger.info("PreviewWindow", "Live window already exists, focusing", { label });
    existing.setFocus();
    return existing;
  }

  const mainWindow = getCurrentWindow();
  const mainSize = await mainWindow.innerSize();
  const scaleFactor = await mainWindow.scaleFactor();

  const width = Math.min(Math.round(mainSize.width / scaleFactor), 1280);
  const height = Math.min(Math.round(mainSize.height / scaleFactor), 800);

  logger.info("PreviewWindow", "Creating live window", {
    label,
    width,
    height,
    url: `/preview/${sceneId}?mode=live`,
    decorations: false,
  });

  const win = new WebviewWindow(label, {
    url: `/preview/${sceneId}?mode=live`,
    title: sceneName,
    width,
    height,
    minWidth: 640,
    minHeight: 480,
    decorations: true,
    resizable: true,
    fullscreen: false,
    center: true,
    dragDropEnabled: false,
  });

  win.once("tauri://error", (e) => {
    logger.error("PreviewWindow", "Live window creation error", {
      label,
      error: String(e.payload),
    });
  });

  logger.info("PreviewWindow", "Live window created", { label });
  return win;
}

export async function openComponentPreviewWindow(config: ComponentPreviewConfig) {
  const label = `preview-component-${config.pluginType}`;
  logger.info("PreviewWindow", "Opening component preview window", { config, label });

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    logger.info("PreviewWindow", "Component preview window already exists, focusing", { label });
    existing.setFocus();
    return existing;
  }

  saveComponentPreviewConfig(config);

  const mainWindow = getCurrentWindow();
  const mainSize = await mainWindow.innerSize();
  const scaleFactor = await mainWindow.scaleFactor();

  const width = Math.min(Math.round(mainSize.width / scaleFactor), 1280);
  const height = Math.min(Math.round(mainSize.height / scaleFactor), 800);

  logger.info("PreviewWindow", "Creating component preview window", {
    label,
    width,
    height,
    url: `/component-preview/${config.pluginType}`,
  });

  const win = new WebviewWindow(label, {
    url: `/component-preview/${config.pluginType}`,
    title: `${config.pluginName} - 预览`,
    width,
    height,
    minWidth: 640,
    minHeight: 480,
    decorations: true,
    resizable: true,
    fullscreen: false,
    center: true,
    dragDropEnabled: false,
  });

  win.once("tauri://error", (e) => {
    logger.error("PreviewWindow", "Component preview window creation error", {
      label,
      error: String(e.payload),
    });
  });

  win.onCloseRequested(() => {
    clearComponentPreviewConfig();
  });

  logger.info("PreviewWindow", "Component preview window created", { label });
  return win;
}

export async function openEditorWindow(libraryId: string, libraryName: string) {
  const label = `editor-${libraryId}`;
  logger.info("PreviewWindow", "Opening editor window", { libraryId, libraryName, label });

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    logger.info("PreviewWindow", "Editor window already exists, focusing", { label });
    existing.setFocus();
    return existing;
  }

  const mainWindow = getCurrentWindow();
  const mainSize = await mainWindow.innerSize();
  const scaleFactor = await mainWindow.scaleFactor();

  const width = Math.min(Math.round(mainSize.width / scaleFactor), 1400);
  const height = Math.min(Math.round(mainSize.height / scaleFactor), 900);

  const win = new WebviewWindow(label, {
    url: `/map-editor/${libraryId}`,
    title: `${libraryName} - 编辑`,
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    decorations: true,
    resizable: true,
    fullscreen: false,
    center: true,
    dragDropEnabled: false,
  });

  win.once("tauri://error", (e) => {
    logger.error("PreviewWindow", "Editor window creation error", {
      label,
      error: String(e.payload),
    });
  });

  logger.info("PreviewWindow", "Editor window created", { label });
  return win;
}

export async function openMapPreviewWindow(libraryId: string, libraryName: string) {
  const label = `map-preview-${libraryId}`;
  logger.info("PreviewWindow", "Opening map preview window", { libraryId, libraryName, label });

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    logger.info("PreviewWindow", "Map preview window already exists, focusing", { label });
    existing.setFocus();
    return existing;
  }

  const mainWindow = getCurrentWindow();
  const mainSize = await mainWindow.innerSize();
  const scaleFactor = await mainWindow.scaleFactor();

  const width = Math.min(Math.round(mainSize.width / scaleFactor), 1400);
  const height = Math.min(Math.round(mainSize.height / scaleFactor), 900);

  const win = new WebviewWindow(label, {
    url: `/map-editor/${libraryId}?mode=preview`,
    title: `${libraryName} - 预览`,
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    decorations: true,
    resizable: true,
    fullscreen: false,
    center: true,
    dragDropEnabled: false,
  });

  win.once("tauri://error", (e) => {
    logger.error("PreviewWindow", "Map preview window creation error", {
      label,
      error: String(e.payload),
    });
  });

  logger.info("PreviewWindow", "Map preview window created", { label });
  return win;
}
