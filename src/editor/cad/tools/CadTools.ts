import type { Tool, ToolPointerEvent, ToolKeyEvent, ToolContext } from "../../tools/Tool";
import type { CadViewerEngine } from "../CadViewerEngine";

export class CadSelectTool implements Tool {
  readonly id = "cad-select";
  readonly name = "CAD选择";
  readonly icon = "NearMe";
  readonly cursor = "default" as const;
  readonly shortcut = "V";

  private _context: ToolContext | null = null;
  private _engine: CadViewerEngine | null = null;

  constructor(engine?: CadViewerEngine) {
    this._engine = engine ?? null;
  }

  setEngine(engine: CadViewerEngine): void {
    this._engine = engine;
  }

  activate(context: ToolContext): void {
    this._context = context;
    this._engine?.setInteractionMode("select");
  }

  deactivate(): void {
    this._context = null;
  }

  isActive(): boolean {
    return this._context !== null;
  }

  onClick(event: ToolPointerEvent): void {
    if (!this._engine) return;
    const pickedId = this._engine.pickEntityIdAt(event.screenX, event.screenY);
    if (pickedId) {
      const multi = event.shiftKey || event.ctrlKey;
      if (!multi) {
        this._engine.deselectAll();
      }
      this._engine.selectEntity(pickedId, multi);
    } else if (!event.shiftKey && !event.ctrlKey) {
      this._engine.deselectAll();
    }
  }

  onKeyDown(event: ToolKeyEvent): void {
    if (event.key === "Escape") {
      this._context?.deselectAll();
    }
  }
}

export class CadPanTool implements Tool {
  readonly id = "cad-pan";
  readonly name = "CAD平移";
  readonly icon = "PanToolAlt";
  readonly cursor = "grab" as const;
  readonly shortcut = "H";

  private _context: ToolContext | null = null;
  private _engine: CadViewerEngine | null = null;

  constructor(engine?: CadViewerEngine) {
    this._engine = engine ?? null;
  }

  setEngine(engine: CadViewerEngine): void {
    this._engine = engine;
  }

  activate(context: ToolContext): void {
    this._context = context;
    this._engine?.setInteractionMode("pan");
  }

  deactivate(): void {
    this._context = null;
  }

  isActive(): boolean {
    return this._context !== null;
  }
}

export class CadDrawLineTool implements Tool {
  readonly id = "cad-draw-line";
  readonly name = "画线";
  readonly icon = "ShowChart";
  readonly cursor = "crosshair" as const;
  readonly shortcut = "L";

  private _context: ToolContext | null = null;
  private _engine: CadViewerEngine | null = null;

  constructor(engine?: CadViewerEngine) {
    this._engine = engine ?? null;
  }

  setEngine(engine: CadViewerEngine): void {
    this._engine = engine;
  }

  activate(context: ToolContext): void {
    this._context = context;
    this._engine?.setInteractionMode("draw_line");
  }

  deactivate(): void {
    this._engine?.setInteractionMode("select");
    this._context = null;
  }

  isActive(): boolean {
    return this._context !== null;
  }
}

export class CadDrawCircleTool implements Tool {
  readonly id = "cad-draw-circle";
  readonly name = "画圆";
  readonly icon = "Circle";
  readonly cursor = "crosshair" as const;
  readonly shortcut = "C";

  private _context: ToolContext | null = null;
  private _engine: CadViewerEngine | null = null;

  constructor(engine?: CadViewerEngine) {
    this._engine = engine ?? null;
  }

  setEngine(engine: CadViewerEngine): void {
    this._engine = engine;
  }

  activate(context: ToolContext): void {
    this._context = context;
    this._engine?.setInteractionMode("draw_circle");
  }

  deactivate(): void {
    this._engine?.setInteractionMode("select");
    this._context = null;
  }

  isActive(): boolean {
    return this._context !== null;
  }
}

export function createCadToolContext(engine: CadViewerEngine): ToolContext {
  return {
    getActiveLayerId: () => null,
    getSelectedEntityIds: () => engine.getSelectedEntityIds(),
    selectEntity: (id: string, multi?: boolean) => {
      if (!multi) {
        engine.deselectAll();
      }
      engine.selectEntity(id);
    },
    deselectAll: () => engine.deselectAll(),
    getViewport: () => {
      const state = engine.getCameraState();
      if (!state) return { centerX: 0, centerY: 0, zoom: 1, width: 0, height: 0 };
      return {
        centerX: state.centerX,
        centerY: state.centerY,
        zoom: state.halfW > 0 ? 1 / state.halfW : 1,
        width: 0,
        height: 0,
      };
    },
    setViewport: (centerX: number, centerY: number, zoom: number) => {
      engine.setCameraState({
        centerX,
        centerY,
        halfW: zoom > 0 ? 1 / zoom : 1000,
        halfH: zoom > 0 ? 1 / zoom : 1000,
      });
    },
    screenToWorld: (screenX: number, screenY: number) => {
      const container = engine.container;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const state = engine.getCameraState();
      if (!state) return { x: 0, y: 0 };
      const x = (screenX - rect.left - rect.width / 2) / (state.halfW / (rect.width / 2)) + state.centerX;
      const y = -((screenY - rect.top - rect.height / 2) / (state.halfH / (rect.height / 2))) + state.centerY;
      return { x, y };
    },
    worldToScreen: (worldX: number, worldY: number) => {
      const container = engine.container;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const state = engine.getCameraState();
      if (!state) return { x: 0, y: 0 };
      const x = (worldX - state.centerX) / (state.halfW / (rect.width / 2)) + rect.left + rect.width / 2;
      const y = -((worldY - state.centerY) / (state.halfH / (rect.height / 2))) + rect.top + rect.height / 2;
      return { x, y };
    },
    emitEvent: (eventName: string, payload?: unknown) => {
      if (eventName === 'pick') {
        const pickPayload = payload as { screenX: number; screenY: number; multi?: boolean };
        if (pickPayload) {
          const pickedId = engine.pickEntityIdAt(pickPayload.screenX, pickPayload.screenY);
          if (pickedId) {
            engine.selectEntity(pickedId, pickPayload.multi ?? false);
          }
        }
      } else if (eventName === 'boxSelect') {
        const boxPayload = payload as { startX: number; startY: number; endX: number; endY: number };
        if (boxPayload) {
          engine.selectEntitiesInRect(boxPayload.startX, boxPayload.startY, boxPayload.endX, boxPayload.endY);
        }
      }
    },
  };
}
