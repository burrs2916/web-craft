import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IconLibrary } from "../components/icons";

interface IconSettingsState {
  library: IconLibrary;
  setLibrary: (library: IconLibrary) => void;
}

export const useIconSettingsStore = create<IconSettingsState>()(
  persist(
    (set) => ({
      library: "lucide",
      setLibrary: (library) => set({ library }),
    }),
    {
      name: "icon-settings",
    }
  )
);
