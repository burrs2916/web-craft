type EventHandler<T = unknown> = (payload: T) => void;

export interface DataSourceEventMap {
  "data:updated": { sourceId: string; data: unknown; extracted: Record<string, unknown>; timestamp: string };
  "status:changed": { sourceId: string; status: string; error?: string };
  "source:created": { sourceId: string };
  "source:deleted": { sourceId: string };
  "source:updated": { sourceId: string };
  "binding:added": { sourceId: string; componentId: string; property?: string; value?: unknown; data?: Record<string, unknown> };
  "binding:removed": { sourceId: string; componentId: string };
}

type EventKey = keyof DataSourceEventMap;

class DataSourceEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on<K extends EventKey>(event: K, handler: EventHandler<DataSourceEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler as EventHandler);

    return () => {
      set.delete(handler as EventHandler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  emit<K extends EventKey>(event: K, payload: DataSourceEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] 事件处理器错误 (${event}):`, error);
      }
    });
  }

  off<K extends EventKey>(event: K, handler: EventHandler<DataSourceEventMap[K]>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as EventHandler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}

export const dataSourceEventBus = new DataSourceEventBus();
