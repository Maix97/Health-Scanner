import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchConfig } from '../api/config'
import { fetchExportData, importData } from '../api/export'
import { useDeleteTag, useTags } from '../hooks/useTags'
import { getTheme, setTheme, type Theme } from '../hooks/useTheme'
import { supabase } from '../lib/supabase'
import type { Tag } from '../types'

function ChangePasswordSection() {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) {
      setStatus({ type: 'error', msg: 'Passwords do not match.' })
      return
    }
    if (newPassword.length < 6) {
      setStatus({ type: 'error', msg: 'Password must be at least 6 characters.' })
      return
    }
    setLoading(true)
    setStatus(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (error) {
      setStatus({ type: 'error', msg: error.message })
    } else {
      setStatus({ type: 'success', msg: 'Password updated.' })
      setNewPassword('')
      setConfirm('')
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Change password</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="new-pw">New password</label>
          <input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 6 characters"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500" htmlFor="confirm-pw">Confirm</label>
          <input
            id="confirm-pw"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !newPassword || !confirm}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Update'}
        </button>
      </form>
      {status && (
        <p className={`mt-2 text-sm ${status.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {status.msg}
        </p>
      )}
    </section>
  )
}

function TagDeleteChip({ tag, onRequestDelete }: { tag: Tag; onRequestDelete: (tag: Tag) => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm capitalize text-slate-700">
      {tag.label}
      <button
        type="button"
        onClick={() => onRequestDelete(tag)}
        className="ml-0.5 text-slate-400 hover:text-red-600"
        aria-label={`Delete ${tag.label}`}
      >
        ×
      </button>
    </span>
  )
}

function TagGroup({ title, tags, onRequestDelete }: { title: string; tags: Tag[]; onRequestDelete: (tag: Tag) => void }) {
  if (tags.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagDeleteChip key={tag.id} tag={tag} onRequestDelete={onRequestDelete} />
        ))}
      </div>
    </div>
  )
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

export default function Settings() {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null)
  const [pendingDeleteTag, setPendingDeleteTag] = useState<Tag | null>(null)
  const [currentTheme, setCurrentTheme] = useState<Theme>(getTheme)

  function handleThemeChange(t: Theme) {
    setTheme(t)
    setCurrentTheme(t)
  }

  const { data: feelingTags = [] } = useTags('FEELING')
  const { data: quickToggleTags = [] } = useTags('QUICK_TOGGLE')
  const { data: exerciseTags = [] } = useTags('EXERCISE')
  const { data: foodTags = [] } = useTags('FOOD')
  const deleteTag = useDeleteTag()

  async function handleExport() {
    const data = await fetchExportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `health-scanner-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        setPendingImport({ mode: 'replace', tags: parsed.tags, checkIns: parsed.checkIns })
        setStatus(null)
      } catch {
        setStatus('Could not parse that file as a valid export.')
      }
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    if (!pendingImport) return
    try {
      const result = await importData(pendingImport)
      setStatus(`Imported ${result.tagsImported} tags and ${result.checkInsImported} check-ins.`)
      setPendingImport(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      queryClient.invalidateQueries()
    } catch (err) {
      setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      setPendingImport(null)
    }
  }

  async function confirmDeleteTag() {
    if (!pendingDeleteTag) return
    const result = await deleteTag.mutateAsync(pendingDeleteTag.id)
    setStatus(
      result.removedFromCheckIns > 0
        ? `Deleted "${pendingDeleteTag.label}" and removed it from ${result.removedFromCheckIns} check-in${result.removedFromCheckIns === 1 ? '' : 's'}.`
        : `Deleted "${pendingDeleteTag.label}".`,
    )
    setPendingDeleteTag(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-slate-500">Manage your account, backup data, and configure the app.</p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Appearance</h2>
        <div className="inline-flex gap-0.5 rounded-md border border-slate-200 p-0.5">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleThemeChange(opt.value)}
              className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                currentTheme === opt.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Backup</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            Export data (JSON)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
          >
            Import data
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChosen} className="hidden" />
        </div>
        {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Manage tags</h2>
        <p className="mb-3 text-sm text-slate-500">
          Deleting a tag removes it from any past check-ins that have it. This can't be undone.
        </p>
        <div className="space-y-4">
          <TagGroup
            title="Health — negative"
            tags={feelingTags.filter((t) => t.polarity === 'NEGATIVE')}
            onRequestDelete={setPendingDeleteTag}
          />
          <TagGroup
            title="Health — positive"
            tags={feelingTags.filter((t) => t.polarity === 'POSITIVE')}
            onRequestDelete={setPendingDeleteTag}
          />
          <TagGroup title="Exercise" tags={exerciseTags} onRequestDelete={setPendingDeleteTag} />
          <TagGroup title="Quick toggles" tags={quickToggleTags} onRequestDelete={setPendingDeleteTag} />
          <TagGroup title="Food" tags={foodTags.filter((t) => !t.parentTagId)} onRequestDelete={setPendingDeleteTag} />
        </div>
      </section>

      <ChangePasswordSection />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Claude configuration</h2>
        <p className="text-sm text-slate-600">
          Model: <span className="font-mono">{config?.model ?? '...'}</span>
        </p>
        <p className="text-sm text-slate-600">
          API key: {config?.claudeConfigured ? 'configured' : 'not set — journal extraction and AI insights will not work'}
        </p>
      </section>


      {pendingImport && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30">
          <div className="w-80 rounded-md bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-slate-900">Replace all local data?</p>
            <p className="mt-1 text-sm text-slate-600">
              This will delete every check-in and tag currently stored and replace them with the contents of the imported file. This cannot be undone.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Replace data
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteTag && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30">
          <div className="w-80 rounded-md bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-slate-900">Delete "{pendingDeleteTag.label}"?</p>
            <p className="mt-1 text-sm text-slate-600">
              This removes it from any check-ins that have it. This cannot be undone.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteTag(null)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteTag}
                disabled={deleteTag.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTag.isPending ? 'Deleting...' : 'Delete tag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
