import { create } from "zustand"

type AppStoreState = {
  activeAccountName: string
  setActiveAccountName: (name: string) => void
}

export const useAppStore = create<AppStoreState>((set) => ({
  activeAccountName: "",
  setActiveAccountName: (name) => set({ activeAccountName: name }),
}))
