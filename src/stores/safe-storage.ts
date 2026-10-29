import { createJSONStorage } from "zustand/middleware"

/**
 * localStorage that never throws: private windows, blocked site data and quota errors all degrade to
 * "nothing saved" instead of breaking the page.
 */
export const safeStorage = createJSONStorage(() => ({
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* storage unavailable or full: keep working in memory */
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}))
