import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './views/Dashboard'
import Accounts from './views/Accounts'
import Diagnostics from './views/Diagnostics'

/** 5-minute default stale time matching the CLI quota cache (Global Constraints). */
export const APP_STALE_MS = 5 * 60 * 1000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: APP_STALE_MS,
    },
  },
})

type View = 'dashboard' | 'accounts' | 'wakeup' | 'doctor'

const NAV: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'wakeup', label: 'Wakeup' },
  { id: 'doctor', label: 'Doctor' },
]

export default function App() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <nav aria-label="Primary" data-testid="sidebar">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`nav-${item.id}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="app-content">
          {view === 'dashboard' && <Dashboard />}
          {view === 'accounts' && <Accounts />}
          {view === 'wakeup' && (
            <main data-testid="wakeup-stub">
              <h1>Wakeup</h1>
              <p>Wakeup scheduling lands in Task 4.</p>
            </main>
          )}
          {view === 'doctor' && <Diagnostics />}
        </div>
      </div>
    </QueryClientProvider>
  )
}
