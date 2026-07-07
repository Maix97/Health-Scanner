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
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <span className="text-sm text-slate-400">Loading...</span>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="text-lg font-bold text-slate-900 mr-4">Health Scanner</span>
          <nav className="flex flex-1 flex-wrap gap-1">
            <NavLink to="/" className={navLinkClass} end>
              Dashboard
            </NavLink>
            <NavLink to="/history" className={navLinkClass}>
              History
            </NavLink>
            <NavLink to="/insights" className={navLinkClass}>
              Insights
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
            <NavLink to="/entry" className={navLinkClass}>
              + Add entry
            </NavLink>
          </nav>
          <div className="ml-2 flex items-center gap-2">
            <span className="hidden text-sm text-slate-400 sm:block">{user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
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

export default App
