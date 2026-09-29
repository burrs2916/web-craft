import { create } from "zustand";
import type { DirtyState } from "./types";

export const useDirtyStore = create<DirtyState>()((set) => ({
  isDirty: false,
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));