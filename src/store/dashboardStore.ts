import { create } from "zustand";
import type { WidgetType } from "../types/widget";

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  width: number;
  height: number;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidgetConfig[];
  theme: "light" | "dark" | "blue";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidgetConfig {
  id: string;
  type: WidgetType;
  title?: string;
  dataSourceId?: string;
  binding?: DataBinding;
  config: Record<string, unknown>;
  layout: DashboardLayoutItem;
}

export interface DataBinding {
  sourceId: string;
  metricName: string;
  transform?: string;
}

interface DashboardState {
  dashboards: Dashboard[];
  activeDashboard: Dashboard | null;
  isLoading: boolean;
  error: string | null;

  setDashboards: (dashboards: Dashboard[]) => void;
  addDashboard: (dashboard: Dashboard) => void;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (dashboard: Dashboard | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  dashboards: [],
  activeDashboard: null,
  isLoading: false,
  error: null,

  setDashboards: (dashboards) => set({ dashboards }),
  addDashboard: (dashboard) =>
    set((state) => ({ dashboards: [...state.dashboards, dashboard] })),
  updateDashboard: (id, updates) =>
    set((state) => ({
      dashboards: state.dashboards.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
      activeDashboard:
        state.activeDashboard?.id === id
          ? { ...state.activeDashboard, ...updates }
          : state.activeDashboard,
    })),
  deleteDashboard: (id) =>
    set((state) => ({
      dashboards: state.dashboards.filter((d) => d.id !== id),
      activeDashboard:
        state.activeDashboard?.id === id ? null : state.activeDashboard,
    })),
  setActiveDashboard: (dashboard) => set({ activeDashboard: dashboard }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
