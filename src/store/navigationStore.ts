import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { NavigationEntry } from "../types/navigation";

interface NavigationState {
  history: NavigationEntry[];
  currentIndex: number;
}

interface NavigationActions {
  push: (entry: NavigationEntry) => void;
  back: () => NavigationEntry | null;
  forward: () => NavigationEntry | null;
  goTo: (index: number) => NavigationEntry | null;
  clear: () => void;
  getCurrent: () => NavigationEntry | null;
  getBreadcrumbs: () => NavigationEntry[];
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

export const useNavigationStore = create<NavigationState & NavigationActions>()(
  immer((set, get) => ({
    history: [],
    currentIndex: -1,

    push: (entry) =>
      set((state) => {
        // 截断前进历史
        state.history = state.history.slice(0, state.currentIndex + 1);
        state.history.push(entry);
        state.currentIndex = state.history.length - 1;
      }),

    back: () => {
      const { currentIndex } = get();
      if (currentIndex <= 0) return null;
      set((state) => {
        state.currentIndex -= 1;
      });
      return get().history[get().currentIndex];
    },

    forward: () => {
      const { currentIndex, history } = get();
      if (currentIndex >= history.length - 1) return null;
      set((state) => {
        state.currentIndex += 1;
      });
      return get().history[get().currentIndex];
    },

    goTo: (index) => {
      const { history } = get();
      if (index < 0 || index >= history.length) return null;
      set((state) => {
        state.currentIndex = index;
      });
      return get().history[index];
    },

    clear: () =>
      set((state) => {
        state.history = [];
        state.currentIndex = -1;
      }),

    getCurrent: () => {
      const { history, currentIndex } = get();
      return currentIndex >= 0 ? history[currentIndex] : null;
    },

    getBreadcrumbs: () => {
      const { history, currentIndex } = get();
      return history.slice(0, currentIndex + 1);
    },

    canGoBack: () => get().currentIndex > 0,

    canGoForward: () => get().currentIndex < get().history.length - 1,
  }))
);
