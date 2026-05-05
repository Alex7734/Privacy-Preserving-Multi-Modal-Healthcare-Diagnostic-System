import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, FlaskConical, ShieldCheck, ShieldOff, Cpu, Clock, KeyRound, Droplets, Heart, Brain } from 'lucide-react'
import type { SymptomResult } from '../api/client'
import { getSymptomMetadata, predictSymptoms, getPatient } from '../api/client'
import { useApp } from '../context/AppContext'

export default function SymptomFormPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { settings, keyStatus } = useApp()

  const [features,    setFeatures]    = useState<string[]>([])
  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [search,      setSearch]      = useState('')
  const [topK,        setTopK]        = useState(5)
  const [nBits,       setNBits]       = useState(3)
  const [loading,     setLoading]     = useState(true)
  const [running,     setRunning]     = useState(false)
  const [result,      setResult]      = useState<SymptomResult | null>(null)
  const [error,       setError]       = useState('')
  const [patientName, setPatientName] = useState('')

  useEffect(() => {
    Promise.all([
      getSymptomMetadata(),
      id ? getPatient(id) : Promise.resolve(null),
    ]).then(([meta, patient]) => {
      setFeatures(meta.feature_names)
      if (patient) setPatientName(patient.name)
    }).catch(e => setError(e.message))
     .finally(() => setLoading(false))
  }, [id])

  const fheEnabled = settings?.fhe_enabled ?? true
  const keysReady  = !fheEnabled || (keyStatus?.symptom?.[String(nBits)]?.uploaded === true)

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0) { setError('Select at least one symptom.'); return }
    if (!id) return
    setRunning(true); setError(''); setResult(null)
    const vec = features.map((_, i) => selected.has(i) ? 1.0 : 0.0)
    try {
      const res = await predictSymptoms(id, vec, topK, fheEnabled ? nBits : 3)
      setResult(res)
    } catch (e: any) {
      setError(e.response?.data?.detail ?? e.message)
    } finally { setRunning(false) }
  }

  const PRESETS: { label: string; icon: ReactNode; color: string; symptoms: string[] }[] = [
    {
      label: 'Diabetes',
      icon: <Droplets size={11} />,
      color: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
      symptoms: ['polyuria','polydipsia','sudden_weight_loss','fatigue','weight_loss',
                 'restlessness','lethargy','irregular_sugar_level','blurred_and_distorted_vision',
                 'obesity','excessive_hunger','increased_appetite'],
    },
    {
      label: 'Heart Attack',
      icon: <Heart size={11} />,
      color: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
      symptoms: ['chest_pain','breathlessness','sweating','vomiting'],
    },
    {
      label: 'Epilepsy / Seizure',
      icon: <Brain size={11} />,
      color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
      symptoms: ['loss_of_consciousness','seizures','dizziness','headache','nausea',
                 'spinning_movements','loss_of_balance','unsteadiness','lack_of_concentration'],
    },
  ]

  const applyPreset = (symptoms: string[]) => {
    const indices = new Set(
      symptoms.flatMap(s => {
        const idx = features.findIndex(f => f === s)
        return idx >= 0 ? [idx] : []
      })
    )
    setSelected(indices)
  }

  const filtered = features.map((f, i) => ({ f, i }))
    .filter(({ f }) => f.toLowerCase().includes(search.toLowerCase()))

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
      Loading symptom model…
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button
          onClick={() => nav(`/patients/${id}`)}
          className="mt-1 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Symptom Analysis</h1>
          {patientName && <p className="text-sm text-slate-500 mt-0.5">Patient: {patientName}</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Select Symptoms</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            {selected.size} selected
          </span>
        </div>

        {fheEnabled && !keysReady && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <KeyRound size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              FHE is enabled but {nBits}-bit evaluation keys haven't been uploaded yet.
              Go to <strong>Settings → FHE Key Management</strong> and generate the {nBits}-bit keys.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-slate-400 self-center mr-1">Quick test:</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.symptoms)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${p.color}`}
            >
              {p.icon}{p.label}
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search symptoms…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {filtered.map(({ f, i }) => (
            <label
              key={i}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors select-none ${
                selected.has(i)
                  ? 'bg-blue-50 border border-blue-200 text-blue-800 font-medium'
                  : 'bg-slate-50 border border-transparent text-slate-600 hover:bg-slate-100'
              }`}
            >
              <input
                type="checkbox"
                className="w-3 h-3 accent-blue-600 shrink-0"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
              />
              <span className="truncate">{f.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Top-K results:
              <select
                value={topK}
                onChange={e => setTopK(parseInt(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {[3, 5, 7, 10].map(k => <option key={k}>{k}</option>)}
              </select>
            </label>
            {fheEnabled && (
              <label className="flex items-center gap-2 text-sm text-slate-500">
                Precision:
                <select
                  value={nBits}
                  onChange={e => setNBits(parseInt(e.target.value))}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={3}>3-bit (fast)</option>
                  <option value={4}>4-bit</option>
                  <option value={5}>5-bit (accurate)</option>
                </select>
              </label>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={running || selected.size === 0 || !keysReady}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <FlaskConical size={14} />
            {running ? 'Analyzing…' : 'Run Analysis'}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {running && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <FlaskConical size={16} className="animate-pulse" />
            <span className="text-sm font-medium">Running FHE inference… this may take a few seconds.</span>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Results</h2>
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
            <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
              <Clock size={11} />
              <Cpu size={11} />
              {result.inference_ms} ms
            </span>
          </div>

          <div className="space-y-3">
            {result.topk_results.map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 text-right text-xs font-bold text-slate-400">#{i + 1}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">{r.condition}</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {(r.probability * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.round(r.probability * 100)}%`,
                        background: i === 0 ? '#2563eb' : i === 1 ? '#3b82f6' : '#93c5fd',
                      }}
                    />
                  </div>
                  {r.linked_model && (
                    <div className="text-xs text-slate-400 mt-1">
                      Specific model: {r.linked_model}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 text-right">
            <button
              onClick={() => nav(`/patients/${id}`)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View Patient History →
            </button>
          </div>
        </div>
      )}

      {result && result.topk_results.some(r => r.linked_model === 'eeg') && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 flex items-start gap-4">
          <Brain size={20} className="text-purple-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-800 mb-1">Epilepsy flagged — EEG confirmation available</p>
            <p className="text-xs text-purple-600 mb-3">The symptom model ranked an epilepsy-related condition in the top results. Upload an EEG window for a second, independent FHE-encrypted seizure-detection inference.</p>
            <button
              onClick={() => nav(`/patients/${id}/eeg`)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-xl transition-colors"
            >
              <Brain size={12} /> Run EEG Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
