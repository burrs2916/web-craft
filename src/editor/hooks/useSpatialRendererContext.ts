import { useMemo } from "react";
import { useCoordinateEngine, useViewportSyncService, useClock, useDataOrchestrator } from "../context/SceneEditorContext";
import type { SpatialRendererContext } from "../../types/editor";
import type { CRSType } from "../../types/spatial";

export function useSpatialRendererContext(crs: CRSType = "EPSG:3857"): SpatialRendererContext | undefined {
  const coordinateEngine = useCoordinateEngine();
  const viewportSyncService = useViewportSyncService();
  const clock = useClock();
  const dataOrchestrator = useDataOrchestrator();

  return useMemo(() => {
    if (!coordinateEngine || !viewportSyncService || !clock || !dataOrchestrator) {
      return undefined;
    }
    return {
      coordinateEngine,
      viewportSyncService,
      clock,
      dataBridge: dataOrchestrator.getBridge(),
      crs,
    };
  }, [coordinateEngine, viewportSyncService, clock, dataOrchestrator, crs]);
}
