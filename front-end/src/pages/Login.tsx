import { type FormEvent, useState } from 'react'
import { signIn, signUp } from '../hooks/useAuth'

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUp(email, password)
        setInfo('Check your email for a confirmation link, then sign in.')
        setMode('signin')
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Health Scanner</h1>
        <p className="mb-6 text-sm text-slate-500">
          {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button type="button" onClick={() => { setMode('signup'); setError(null); setInfo(null) }} className="font-medium text-violet-600 hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('signin'); setError(null); setInfo(null) }} className="font-medium text-violet-600 hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
