import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${body}`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}
