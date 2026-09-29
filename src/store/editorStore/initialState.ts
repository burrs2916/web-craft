import type { EditorState, EditorTool } from "./types";
import { deepClone, DEFAULT_VIEWPORT } from "./shared";
import { createDefaultApiConfig } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../types/canvasConfig";
import type { SceneComponent, LayerNode, EventBinding, BreakpointId, HistoryEntry } from "../../types/editor";

export function createInitialState(): EditorState {
  return {
  components: [] as SceneComponent[],
  layers: [] as LayerNode[],
  viewport: { ...DEFAULT_VIEWPORT },
  selection: { selectedIds: [] as string[], hoveredId: null as string | null, isMultiSelect: false },
  activeTool: "select" as EditorTool,
  zoom: 1,
  activeLayerId: null as string | null,
  draggedComponentType: null as string | null,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG },
  apiConfig: createDefaultApiConfig(),
  dataSources: [],
  containerSize: { width: 0, height: 0 },
  history: [] as HistoryEntry[],
  historyIndex: -1,
  maxHistory: 50,
  clipboard: [] as SceneComponent[],
  eventBindings: [] as EventBinding[],
  previewMode: false,
  views: [{ id: "default", name: "默认视图", components: [], layers: [], canvasConfig: deepClone(DEFAULT_CANVAS_CONFIG), viewport: deepClone(DEFAULT_VIEWPORT), eventBindings: [] }],
  activeViewId: "default",
  globalComponents: [],
  activeBreakpoint: "desktop" as BreakpointId,

  // ─── 属性面板 action 处理器 ───
  actionHandlers: {
    // 保存当前认证配置为自定义预设
    saveAuthPreset: (cfg, onCh) => {
      const name = (cfg.savePresetName as string || "").trim();
      if (!name) {
        alert("请先填写预设名称");
        return;
      }
      // 收集需要保存的认证配置字段
      const fieldsToSave = [
        "authMode", "apiUrl", "method", "mappingTemplate",
        "tokenField", "refreshTokenField", "expiresInField", "userField",
        "tokenStorage", "tokenKey", "tokenHeader", "tokenPrefix",
        "refreshEnabled", "refreshThreshold", "refreshEndpointPath", "refreshEndpointMethod",
        "headerConfigs", "endpoints", "responseMappings",
      ];
      const savedConfig: Record<string, unknown> = {};
      for (const f of fieldsToSave) {
        if (f in cfg) savedConfig[f] = cfg[f];
      }
      try {
        const key = "webcraft_auth_presets";
        const existing = JSON.parse(localStorage.getItem(key) || "{}");
        existing[name] = {
          label: name,
          description: `自定义预设（${new Date().toLocaleDateString()}）`,
          config: savedConfig,
        };
        localStorage.setItem(key, JSON.stringify(existing));
        // 切换到刚保存的预设
        onCh("authPreset", name);
        alert(`预设 "${name}" 已保存，可在下拉中复用`);
      } catch {
        alert("保存失败，localStorage 不可用");
      }
    },
  },
  };
}
