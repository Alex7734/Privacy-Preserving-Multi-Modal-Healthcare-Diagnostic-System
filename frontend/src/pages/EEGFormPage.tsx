import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Brain, ShieldCheck, ShieldOff, KeyRound, FlaskConical, CheckCircle2, Cpu, Clock, Upload, Zap, AlertTriangle } from 'lucide-react'
import { predictEEG, getEEGSamples, getPatient } from '../api/client'
import type { BinaryResult, EEGSample } from '../api/client'
import { useApp } from '../context/AppContext'

const EEG_WINDOW_SIZE = 178

const SAMPLE_BUTTONS: { key: string; label: string; sublabel: string; color: string }[] = [
  {
    key: 'normal',
    label: 'Real — no seizure',
    sublabel: 'UCI dataset, resting rhythm',
    color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-700',
  },
  {
    key: 'seizure',
    label: 'Real — active seizure',
    sublabel: 'UCI dataset, ictal discharge',
    color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700',
  },
  {
    key: 'synthetic',
    label: 'Synthetic — resting state',
    sublabel: 'Alpha/beta oscillations',
    color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',
  },
]

export default function EEGFormPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { settings, keyStatus } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [patientName, setPatientName] = useState('')
  const [samples, setSamples] = useState<Record<string, EEGSample>>({})
  const [eegWindow, setEegWindow] = useState<number[] | null>(null)
  const [loadedLabel, setLoadedLabel] = useState('')
  const [fileError, setFileError] = useState('')
  const [nBits, setNBits] = useState(4)
  const [running, setRunning] = useState(false)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [result, setResult] = useState<BinaryResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) getPatient(id).then(p => setPatientName(p.name)).catch(() => {})
    getEEGSamples().then(setSamples).catch(() => {})
  }, [id])

  const fheEnabled = settings?.fhe_enabled ?? true
  const keysReady = !fheEnabled || (keyStatus?.eeg?.[String(nBits)]?.uploaded === true)

  const handleLoadSample = async (key: string) => {
    const s = samples[key]
    if (!s) return
    setLoadingKey(key)
    setFileError('')
    setEegWindow(s.eeg_window)
    setLoadedLabel(s.label_hint ?? s.description)
    setResult(null)
    setLoadingKey(null)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError('')
    setLoadedLabel('')
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const values = text
        .split(/[\s,\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => parseFloat(s))
        .filter(n => !isNaN(n))
      if (values.length !== EEG_WINDOW_SIZE) {
        setFileError(`Expected ${EEG_WINDOW_SIZE} values, got ${values.length}. Upload a file with exactly 178 amplitude values.`)
        setEegWindow(null)
      } else {
        setEegWindow(values)
        setLoadedLabel(`Uploaded file: ${file.name}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const previewText = eegWindow
    ? [...eegWindow.slice(0, 10).map(v => v.toFixed(2)), '…', ...eegWindow.slice(-5).map(v => v.toFixed(2))].join(', ')
    : ''

  const handleSubmit = async () => {
    if (!id || !eegWindow) return
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await predictEEG(id, eegWindow, nBits)
      setResult(res)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button
          onClick={() => nav(`/patients/${id}`)}
          className="mt-1 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-purple-500" />
            <h1 className="text-2xl font-bold text-slate-900">EEG Seizure Detection</h1>
          </div>
          {patientName && <p className="text-sm text-slate-500 mt-0.5">Patient: {patientName}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">EEG Window Input</h2>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Precision:
            <select
              value={nBits}
              onChange={e => { setNBits(parseInt(e.target.value)); setResult(null) }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={4}>4-bit (fast, ~3.5 s)</option>
              <option value={5}>5-bit (accurate, ~12 s)</option>
            </select>
          </label>
        </div>

        {fheEnabled && !keysReady && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <KeyRound size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              FHE is enabled but {nBits}-bit evaluation keys for the <strong>eeg</strong> model haven't been uploaded yet.
              Go to <strong>Settings → FHE Key Management</strong> and generate the {nBits}-bit keys.
            </p>
          </div>
        )}

        {/* Sample buttons */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Load a test sample:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_BUTTONS.map(btn => (
              <button
                key={btn.key}
                onClick={() => handleLoadSample(btn.key)}
                disabled={loadingKey === btn.key || !samples[btn.key]}
                className={`flex flex-col items-start px-4 py-2.5 rounded-xl text-left border transition-colors disabled:opacity-40 ${btn.color}`}
              >
                <span className="text-xs font-semibold">{btn.label}</span>
                <span className="text-[10px] opacity-70">{btn.sublabel}</span>
              </button>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors"
            >
              <Upload size={13} />
              Upload .csv / .txt
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </div>
        </div>

        {fileError && <p className="text-sm text-red-600">{fileError}</p>}

        {eegWindow && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-slate-400" />
              <span className="text-xs text-slate-500 truncate">{loadedLabel}</span>
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 shrink-0">
                {eegWindow.length} samples
              </span>
            </div>
            <textarea
              readOnly
              value={previewText}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 bg-slate-50 resize-none focus:outline-none"
            />
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={handleSubmit}
            disabled={running || !eegWindow || !keysReady}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <FlaskConical size={14} />
            {running ? 'Analyzing…' : 'Run Analysis'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {running && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <FlaskConical size={16} className="animate-pulse" />
            <span className="text-sm font-medium">Running FHE inference on encrypted EEG… this may take a few seconds.</span>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Result</h2>
            {result.fhe_used ? (
              <>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                  <ShieldCheck size={11} /> FHE encrypted inference
                </span>
                <span className="font-mono text-xs font-semibold bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
                  {result.n_bits}-bit
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                <ShieldOff size={11} /> Plaintext inference (FHE off)
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
              <Clock size={11} /><Cpu size={11} />{result.inference_ms} ms
            </span>
          </div>

          <div className={`flex items-center gap-4 rounded-2xl p-5 ${result.positive ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
            {result.positive
              ? <AlertTriangle size={36} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={36} className="text-green-500 shrink-0" />
            }
            <div>
              <p className={`text-base font-bold ${result.positive ? 'text-red-700' : 'text-green-700'}`}>
                {result.positive ? 'Ictal activity detected' : 'No ictal activity detected'}
              </p>
              <p className={`text-sm mt-0.5 ${result.positive ? 'text-red-500' : 'text-green-500'}`}>
                {result.positive ? 'Possible seizure event in this window' : 'Brain rhythm within normal range'}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-right">
            <button
              onClick={() => nav(`/patients/${id}`)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View Patient History →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
