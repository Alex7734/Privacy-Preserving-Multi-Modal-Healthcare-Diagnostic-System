import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Settings, KeyStatus } from '../api/client'
import { getSettings, getKeyStatus } from '../api/client'

interface AppState {
  settings: Settings | null
  keyStatus: KeyStatus | null
  setSettings: (s: Settings) => void
  setKeyStatus: (ks: KeyStatus) => void
  refreshSettings: () => void
  refreshKeyStatus: () => void
}

const AppContext = createContext<AppState>({
  settings: null,
  keyStatus: null,
  setSettings: () => {},
  setKeyStatus: () => {},
  refreshSettings: () => {},
  refreshKeyStatus: () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings,  setSettings]  = useState<Settings | null>(null)
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)

  const refreshSettings  = useCallback(() => { getSettings().then(setSettings).catch(() => {}) }, [])
  const refreshKeyStatus = useCallback(() => { getKeyStatus().then(setKeyStatus).catch(() => {}) }, [])

  useEffect(() => {
    refreshSettings()
    refreshKeyStatus()
    const id = setInterval(refreshKeyStatus, 10_000)
    return () => clearInterval(id)
  }, [refreshSettings, refreshKeyStatus])

  return (
    <AppContext.Provider value={{ settings, keyStatus, setSettings, setKeyStatus, refreshSettings, refreshKeyStatus }}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppContext)
