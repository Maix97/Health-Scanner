import { NavLink, Route, Routes } from 'react-router-dom'
import { useSystemThemeSync } from './hooks/useTheme'
import Dashboard from './pages/Dashboard'
import Entry from './pages/Entry'
import History from './pages/History'
import Insights from './pages/Insights'
import Settings from './pages/Settings'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

function App() {
  useSystemThemeSync()
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <span className="text-lg font-bold text-slate-900 sm:mr-4">Health Scanner</span>
          <nav className="flex flex-wrap gap-1">
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
