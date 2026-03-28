import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ShieldCheck, ShieldOff, Server, Key, SlidersHorizontal, Save,
  RefreshCw, CheckCircle2, XCircle, Upload, Clock,
} from 'lucide-react'
import { SettingsSchema } from '../api/client'
import type { Settings } from '../api/client'
import { updateSettings, generateKeys } from '../api/client'
import { useApp } from '../context/AppContext'

const N_BITS_OPTIONS = [3, 4, 5] as const

function BitWidthRow({ nb }: { nb: number }) {
  const { keyStatus, refreshKeyStatus } = useApp()
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  const entry = keyStatus?.symptom?.[String(nb)]

  const expiresLabel = entry?.expires_unix
    ? new Date(entry.expires_unix * 1000).toLocaleString()
    : null

  const handleGenerate = async () => {
    setBusy(true); setError('')
    try {
      await generateKeys(nb)
      refreshKeyStatus()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0 flex-wrap">
      <div className="w-16 shrink-0">
        <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
          {nb}-bit
        </span>
      </div>

      <div className="flex-1 flex items-center gap-2 flex-wrap">
        {entry?.ready && entry?.uploaded ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <CheckCircle2 size={11} /> Ready &amp; uploaded
          </span>
        ) : entry?.ready ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            <Upload size={11} /> Generated, not uploaded
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
            <XCircle size={11} /> No keys
          </span>
        )}
        {expiresLabel && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={10} /> {expiresLabel}
          </span>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy
          ? <><RefreshCw size={11} className="animate-spin" /> Generating…</>
          : <><Key size={11} />{entry?.ready ? 'Regenerate' : 'Generate & Upload'}</>
        }
      </button>

      {error && <p className="w-full text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function KeyManagementCard() {
  const { refreshKeyStatus } = useApp()

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Key size={16} className="text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">FHE Key Management</h2>
        <button
          onClick={refreshKeyStatus}
          className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          title="Refresh status"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 mb-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2 pt-1">Symptom model</div>
        {N_BITS_OPTIONS.map(nb => <BitWidthRow key={nb} nb={nb} />)}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Private keys stay in this process and never leave.
        Evaluation keys are uploaded to the inference server once and cached server-side.
        Higher bit-width → better confidence calibration, longer inference.
        Re-generate if the TTL expires or if you restart the inference server.
      </p>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, setSettings, refreshSettings } = useApp()
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting, isDirty } } = useForm<Settings>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: settings ?? undefined,
  })

  useEffect(() => {
    if (settings) reset(settings)
  }, [settings, reset])

  const fheEnabled = watch('fhe_enabled')

  const onSubmit = async (data: Settings) => {
    const updated = await updateSettings(data)
    setSettings(updated)
    reset(updated)
    refreshSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return (
    <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
      Loading settings…
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure privacy and inference options</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Privacy</h2>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="font-semibold text-slate-800 text-sm mb-1">
                Fully Homomorphic Encryption (FHE)
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                When enabled, all inference is performed on encrypted data.
                The inference server never sees plaintext features.
                Disabling speeds up inference significantly but removes the privacy guarantee.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fheEnabled}
              onClick={() => setValue('fhe_enabled', !fheEnabled, { shouldDirty: true })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                fheEnabled ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                fheEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {!fheEnabled && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <ShieldOff size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                FHE is disabled. Patient symptom data will be sent to the inference server in plaintext.
                Re-enable FHE to restore full privacy.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Server size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Inference Server</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <Server size={11} /> Server URL (gRPC)
              </label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="http://localhost:8000"
                {...register('inference_server_url')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <SlidersHorizontal size={11} /> Default Top-K results
                </label>
                <input
                  type="number"
                  min={1} max={20}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  {...register('default_top_k', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Key size={11} /> Eval key TTL (seconds)
                </label>
                <input
                  type="number"
                  min={60}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  {...register('eval_key_ttl_seconds', { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <Save size={14} />
            {isSubmitting ? 'Saving…' : 'Save Settings'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
              <ShieldCheck size={14} /> Saved
            </span>
          )}
        </div>
      </form>

      {fheEnabled && <KeyManagementCard />}
    </div>
  )
}
