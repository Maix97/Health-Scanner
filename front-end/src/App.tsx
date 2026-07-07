import { useState } from 'react'
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
  `block px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/history', label: 'History' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
  { to: '/entry', label: '+ Add entry' },
]

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      {open ? (
        <path fillRule="evenodd" clipRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
      ) : (
        <path fillRule="evenodd" clipRule="evenodd"
          d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
      )}
    </svg>
  )
}

function AppShell({ user, onSignOut }: { user: { email?: string | null }; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on navigation
  const handleNavClick = () => setMenuOpen(false)

  return (
    <div className="min-h-screen min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        {/* Top bar */}
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="text-lg font-bold text-slate-900 mr-2">Health Scanner</span>

          {/* Desktop nav */}
          <nav className="hidden md:flex flex-1 flex-wrap gap-1">
            {NAV_LINKS.map(({ to, label, end }) => (
              <NavLink key={to} to={to} className={navLinkClass} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop user info */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <span className="text-sm text-slate-400 max-w-[180px] truncate">{user.email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Sign out
            </button>
          </div>

          {/* Mobile: hamburger */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              Sign out
            </button>
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            >
              <HamburgerIcon open={menuOpen} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="border-t border-slate-100 md:hidden">
            <nav className="mx-auto max-w-3xl px-4 py-2 flex flex-col gap-0.5">
              {NAV_LINKS.map(({ to, label, end }) => (
                <NavLink key={to} to={to} className={navLinkClass} end={end} onClick={handleNavClick}>
                  {label}
                </NavLink>
              ))}
              <div className="mt-2 border-t border-slate-100 pt-2 px-3 pb-1 text-sm text-slate-400 truncate">
                {user.email}
              </div>
            </nav>
          </div>
        )}
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
