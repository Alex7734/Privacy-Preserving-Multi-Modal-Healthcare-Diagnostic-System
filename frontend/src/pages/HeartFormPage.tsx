import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, ShieldCheck, ShieldOff, KeyRound, FlaskConical, CheckCircle2, XCircle, Cpu, Clock } from 'lucide-react'
import { predictHeart, getPatient } from '../api/client'
import type { BinaryResult } from '../api/client'
import { useApp } from '../context/AppContext'

const DEFAULTS = {
  age: 55,
  sex: 1,
  cp: 3,
  trestbps: 130,
  chol: 250,
  fbs: 0,
  restecg: 0,
  thalach: 150,
  exang: 0,
  oldpeak: 1.0,
  slope: 1,
  ca: 0,
  thal: 2,
}

export default function HeartFormPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { settings, keyStatus } = useApp()

  const [form, setForm] = useState(DEFAULTS)
  const [patientName, setPatientName] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BinaryResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) getPatient(id).then(p => setPatientName(p.name)).catch(() => {})
  }, [id])

  const fheEnabled = settings?.fhe_enabled ?? true
  const keysReady = !fheEnabled || (keyStatus?.heart?.['8']?.uploaded === true)

  const setField = (key: keyof typeof DEFAULTS, value: number) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!id) return
    setRunning(true)
    setError('')
    setResult(null)
    try {
      const res = await predictHeart(id, form, 8)
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
            <Heart size={20} className="text-red-500" />
            <h1 className="text-2xl font-bold text-slate-900">Heart Disease Analysis</h1>
          </div>
          {patientName && <p className="text-sm text-slate-500 mt-0.5">Patient: {patientName}</p>}
        </div>
        <span className="mt-1 font-mono text-xs font-semibold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-100">
          8-bit FHE
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Cleveland Heart Disease Features</h2>
        </div>

        {fheEnabled && !keysReady && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <KeyRound size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              FHE is enabled but 8-bit evaluation keys for the <strong>heart</strong> model haven't been uploaded yet.
              Go to <strong>Settings → FHE Key Management</strong> and generate the 8-bit keys.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Age */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Age (years)</label>
            <input
              type="number"
              value={form.age}
              onChange={e => setField('age', parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sex */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Sex</label>
            <select
              value={form.sex}
              onChange={e => setField('sex', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>Female</option>
              <option value={1}>Male</option>
            </select>
          </div>

          {/* Chest Pain Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Chest Pain Type</label>
            <select
              value={form.cp}
              onChange={e => setField('cp', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>Typical angina</option>
              <option value={1}>Atypical angina</option>
              <option value={2}>Non-anginal pain</option>
              <option value={3}>Asymptomatic</option>
            </select>
          </div>

          {/* Resting BP */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Resting Blood Pressure (mmHg)</label>
            <input
              type="number"
              value={form.trestbps}
              onChange={e => setField('trestbps', parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Cholesterol */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Cholesterol (mg/dl)</label>
            <input
              type="number"
              value={form.chol}
              onChange={e => setField('chol', parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Fasting Blood Sugar */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Fasting Blood Sugar &gt;120 mg/dl</label>
            <select
              value={form.fbs}
              onChange={e => setField('fbs', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>No</option>
              <option value={1}>Yes</option>
            </select>
          </div>

          {/* Resting ECG */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Resting ECG Results</label>
            <select
              value={form.restecg}
              onChange={e => setField('restecg', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>Normal</option>
              <option value={1}>ST-T wave abnormality</option>
              <option value={2}>Left ventricular hypertrophy</option>
            </select>
          </div>

          {/* Max Heart Rate */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Max Heart Rate Achieved (bpm)</label>
            <input
              type="number"
              value={form.thalach}
              onChange={e => setField('thalach', parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Exercise Angina */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Exercise-Induced Angina</label>
            <select
              value={form.exang}
              onChange={e => setField('exang', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>No</option>
              <option value={1}>Yes</option>
            </select>
          </div>

          {/* ST Depression */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">ST Depression (oldpeak)</label>
            <input
              type="number"
              step="0.1"
              value={form.oldpeak}
              onChange={e => setField('oldpeak', parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Slope */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Peak Exercise ST Slope</label>
            <select
              value={form.slope}
              onChange={e => setField('slope', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>Upsloping</option>
              <option value={1}>Flat</option>
              <option value={2}>Downsloping</option>
            </select>
          </div>

          {/* CA */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Major Vessels Colored by Fluoroscopy</label>
            <select
              value={form.ca}
              onChange={e => setField('ca', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>

          {/* Thal */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Thalassemia</label>
            <select
              value={form.thal}
              onChange={e => setField('thal', parseInt(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value={1}>Normal</option>
              <option value={2}>Fixed defect</option>
              <option value={3}>Reversable defect</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">
            13 features from the UCI Cleveland Heart Disease dataset. Logistic Regression model, FHE-encrypted at 8-bit precision.
          </p>
          <button
            onClick={handleSubmit}
            disabled={running || !keysReady}
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
            <span className="text-sm font-medium">Running FHE inference… this may take a few seconds.</span>
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
              ? <XCircle size={36} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={36} className="text-green-500 shrink-0" />
            }
            <p className={`text-lg font-bold ${result.positive ? 'text-red-700' : 'text-green-700'}`}>
              {result.positive ? 'Heart Disease Detected' : 'No Heart Disease Detected'}
            </p>
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
