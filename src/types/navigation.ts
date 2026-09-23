/**
 * 场景导航类型定义
 * 支持组件穿透/画面导航功能
 */

export type NavigationOpenMode = "replace" | "newWindow" | "dialog";

export interface NavigateToSceneParams {
  sceneId: string;
  viewId?: string;
  openMode: NavigationOpenMode;
  variables?: Record<string, unknown>;
  dialogOptions?: {
    width?: number;
    height?: number;
    title?: string;
  };
}

export interface NavigationEntry {
  sceneId: string;
  viewId: string;
  sceneName: string;
  variables: Record<string, unknown>;
  timestamp: number;
}
