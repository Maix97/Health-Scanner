import { NavLink, Route, Routes } from 'react-router-dom'
import { useSystemThemeSync } from './hooks/useTheme'
import { useAuth, signOut } from './hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import Entry from './pages/Entry'
import History from './pages/History'
import Insights from './pages/Insights'
import Login from './pages/Login'
import Settings from './pages/Settings'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `shrink-0 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/history', label: 'History' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
  { to: '/entry', label: '+ Add entry' },
]

function AppShell({ user, onSignOut }: { user: { email?: string | null }; onSignOut: () => void }) {
  return (
    <div className="min-h-screen min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <span className="shrink-0 text-lg font-bold text-slate-900 mr-2">Health Scanner</span>

          {/* Nav — scrolls horizontally on narrow screens, visible at all widths */}
          <nav className="flex overflow-x-auto gap-1 flex-1 scrollbar-none">
            {NAV_LINKS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} className={navLinkClass} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Email + sign out — email hides below sm */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:block text-sm text-slate-400 max-w-[160px] truncate">{user.email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/entry" element={<Entry />} />
          <Route path="/history" element={<History />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  useSystemThemeSync()
  const { user, loading } = useAuth()
  const queryClient = useQueryClient()

  async function handleSignOut() {
    await signOut()
    queryClient.clear()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen min-h-dvh items-center justify-center bg-slate-50">
        <span className="text-sm text-slate-400">Loading...</span>
      </div>
    )
  }

  if (!user) return <Login />

  return <AppShell user={user} onSignOut={handleSignOut} />
}

export default App
