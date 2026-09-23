import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { NavigateToSceneParams } from "../../types/navigation";
import { useNavigationStore } from "../../store/navigationStore";
import { useSceneStore } from "../../store/sceneStore";
import { logger } from "../../utils/logger";

/**
 * NavigationExecutor - 场景导航执行器
 * 处理三种导航模式：replace（当前窗口）、newWindow（新窗口）、dialog（模态对话框）
 */
export class NavigationExecutor {
  static execute(params: NavigateToSceneParams): void {
    const { sceneId, viewId, openMode, variables } = params;

    if (!sceneId) {
      logger.warn("NavigationExecutor", "Missing sceneId in navigateToScene params");
      return;
    }

    const sceneName = NavigationExecutor.getSceneName(sceneId);

    // 推入导航历史
    useNavigationStore.getState().push({
      sceneId,
      viewId: viewId ?? "",
      sceneName,
      variables: variables ?? {},
      timestamp: Date.now(),
    });

    switch (openMode) {
      case "replace":
        NavigationExecutor.navigateReplace(sceneId, viewId, variables);
        break;
      case "newWindow":
        NavigationExecutor.navigateNewWindow(sceneId, viewId, variables);
        break;
      case "dialog":
        NavigationExecutor.navigateDialog(sceneId, viewId, variables, params.dialogOptions);
        break;
      default:
        NavigationExecutor.navigateReplace(sceneId, viewId, variables);
    }
  }

  private static navigateReplace(
    sceneId: string,
    viewId?: string,
    variables?: Record<string, unknown>
  ): void {
    const varsParam = variables ? `&vars=${encodeURIComponent(JSON.stringify(variables))}` : "";
    const viewParam = viewId ? `&viewId=${viewId}` : "";
    const url = `/preview/${sceneId}?mode=live${viewParam}${varsParam}`;

    // 使用 window.location 在当前窗口内导航
    window.location.hash = `#${url}`;

    logger.info("NavigationExecutor", "Navigate replace", { sceneId, viewId, url });
  }

  private static async navigateNewWindow(
    sceneId: string,
    viewId?: string,
    variables?: Record<string, unknown>
  ): Promise<void> {
    const label = `preview-${sceneId.slice(0, 8)}-${Date.now()}`;
    const varsParam = variables ? `&vars=${encodeURIComponent(JSON.stringify(variables))}` : "";
    const viewParam = viewId ? `&viewId=${viewId}` : "";
    const url = `/preview/${sceneId}?mode=live${viewParam}${varsParam}`;
    const title = NavigationExecutor.getSceneName(sceneId);

    try {
      const win = new WebviewWindow(label, {
        url,
        title,
        width: 1280,
        height: 800,
        resizable: true,
      });

      win.once("tauri://created", () => {
        logger.info("NavigationExecutor", "New preview window created", { label, sceneId });
      });

      win.once("tauri://error", (err) => {
        logger.error("NavigationExecutor", "Failed to create preview window", { error: String(err) });
      });
    } catch (err) {
      logger.error("NavigationExecutor", "navigateNewWindow failed", { error: String(err) });
    }
  }

  private static async navigateDialog(
    sceneId: string,
    viewId?: string,
    variables?: Record<string, unknown>,
    options?: { width?: number; height?: number; title?: string }
  ): Promise<void> {
    const label = `dialog-${sceneId.slice(0, 8)}-${Date.now()}`;
    const varsParam = variables ? `&vars=${encodeURIComponent(JSON.stringify(variables))}` : "";
    const viewParam = viewId ? `&viewId=${viewId}` : "";
    const url = `/preview/${sceneId}?mode=live${viewParam}${varsParam}`;

    try {
      const win = new WebviewWindow(label, {
        url,
        title: options?.title ?? NavigationExecutor.getSceneName(sceneId),
        width: options?.width ?? 900,
        height: options?.height ?? 650,
        resizable: true,
        center: true,
      });

      win.once("tauri://created", () => {
        logger.info("NavigationExecutor", "Dialog window created", { label, sceneId });
      });
    } catch (err) {
      logger.error("NavigationExecutor", "navigateDialog failed", { error: String(err) });
    }
  }

  private static getSceneName(sceneId: string): string {
    const scenes = useSceneStore.getState().scenes;
    const scene = scenes.find((s) => s.id === sceneId);
    return scene?.name ?? sceneId;
  }
}
