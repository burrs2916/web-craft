import { useState, useCallback, useMemo, useEffect } from "react";
import { useMediaQuery, useTheme } from "@mui/material";

export interface PanelState {
  componentLibrary: { collapsed: boolean; width: number };
  layerPanel: { collapsed: boolean; width: number };
  propertyPanel: { collapsed: boolean; width: number };
}

const DEFAULT_PANEL_STATE: PanelState = {
  componentLibrary: { collapsed: false, width: 260 },
  layerPanel: { collapsed: false, width: 260 },
  propertyPanel: { collapsed: false, width: 280 },
};

export function useResponsiveLayout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isTablet = useMediaQuery(theme.breakpoints.between("md", "lg"));
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

  const [panelState, setPanelState] = useState<PanelState>(() => {
    if (isMobile) {
      return {
        ...DEFAULT_PANEL_STATE,
        componentLibrary: { collapsed: true, width: 260 },
        layerPanel: { collapsed: true, width: 260 },
        propertyPanel: { collapsed: true, width: 280 },
      };
    }
    if (isTablet) {
      return {
        ...DEFAULT_PANEL_STATE,
        propertyPanel: { collapsed: true, width: 280 },
      };
    }
    return DEFAULT_PANEL_STATE;
  });

  useEffect(() => {
    if (isMobile) {
      setPanelState((prev) => ({
        ...prev,
        componentLibrary: { ...prev.componentLibrary, collapsed: true },
        layerPanel: { ...prev.layerPanel, collapsed: true },
        propertyPanel: { ...prev.propertyPanel, collapsed: true },
      }));
    } else if (isTablet) {
      setPanelState((prev) => ({
        ...prev,
        componentLibrary: { ...prev.componentLibrary, collapsed: false },
        layerPanel: { ...prev.layerPanel, collapsed: false },
        propertyPanel: { ...prev.propertyPanel, collapsed: true },
      }));
    } else {
      setPanelState((prev) => ({
        ...prev,
        componentLibrary: { ...prev.componentLibrary, collapsed: false },
        layerPanel: { ...prev.layerPanel, collapsed: false },
        propertyPanel: { ...prev.propertyPanel, collapsed: false },
      }));
    }
  }, [isMobile, isTablet, isDesktop]);

  const togglePanel = useCallback(
    (panel: keyof PanelState) => {
      setPanelState((prev) => ({
        ...prev,
        [panel]: {
          ...prev[panel],
          collapsed: !prev[panel].collapsed,
        },
      }));
    },
    []
  );

  const setPanelWidth = useCallback(
    (panel: keyof PanelState, width: number) => {
      setPanelState((prev) => ({
        ...prev,
        [panel]: {
          ...prev[panel],
          width: Math.max(180, Math.min(400, width)),
        },
      }));
    },
    []
  );

  const resetPanels = useCallback(() => {
    setPanelState(DEFAULT_PANEL_STATE);
  }, []);

  const getPanelWidth = useCallback(
    (panel: keyof PanelState) => {
      return panelState[panel].collapsed ? 40 : panelState[panel].width;
    },
    [panelState]
  );

  const layoutType = useMemo(() => {
    if (isMobile) return "mobile";
    if (isTablet) return "tablet";
    return "desktop";
  }, [isMobile, isTablet]);

  return {
    panelState,
    layoutType,
    isMobile,
    isTablet,
    isDesktop,
    togglePanel,
    setPanelWidth,
    resetPanels,
    getPanelWidth,
  };
}
