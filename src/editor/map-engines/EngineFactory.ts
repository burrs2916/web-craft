import type { MapEngine, MapEngineConfig } from "./types";

export type MapEngineType = "maplibre" | "cesium";

const engineRegistry = new Map<MapEngineType, () => MapEngine>();

export function registerEngine(type: MapEngineType, factory: () => MapEngine): void {
  engineRegistry.set(type, factory);
}

export function createEngine(type: MapEngineType): MapEngine {
  const factory = engineRegistry.get(type);
  if (!factory) {
    throw new Error(`Map engine "${type}" not registered`);
  }
  return factory();
}

export async function createAndMountEngine(
  type: MapEngineType,
  config: MapEngineConfig
): Promise<MapEngine> {
  const engine = createEngine(type);
  await engine.mount(config);
  return engine;
}
