import { create } from "zustand"

type AppStoreState = {
  activeAccountName: string
  setActiveAccountName: (name: string) => void
}

export const useAppStore = create<AppStoreState>((set) => ({
  activeAccountName: "小红书主账号",
  setActiveAccountName: (name) => set({ activeAccountName: name }),
}))
