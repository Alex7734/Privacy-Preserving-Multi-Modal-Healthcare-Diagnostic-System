import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, FlaskConical, ShieldCheck, ShieldOff, Clock, Cpu, CreditCard, FileText, Trash2, CheckCircle2, XCircle, Info } from 'lucide-react'
import type { Patient, PredictionRecord } from '../api/client'
import { getPatient, deleteRecord } from '../api/client'
import ConfirmDialog from '../components/ConfirmDialog'
import { ageFromDob } from '../utils/date'

function RecordCard({ r, patientId, onDeleted }: { r: PredictionRecord; patientId: string; onDeleted: () => void }) {
  const [deleting,  setDeleting]  = useState(false)
  const [confirming, setConfirming] = useState(false)
  const date = r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'

  const handleDelete = async () => {
    setDeleting(true); setConfirming(false)
    try {
      await deleteRecord(patientId, r.id)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          {r.model}
        </span>
        {r.fhe_used ? (
          <>
            <div className="relative group">
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 cursor-default">
                <ShieldCheck size={11} /> FHE encrypted
                <Info size={9} className="ml-0.5 opacity-60" />
              </span>
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-900 text-white text-xs rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto z-20 shadow-xl">
                <p className="mb-2 leading-relaxed text-slate-300">
                  Inference ran on encrypted data. The server never saw any symptom values — only ciphertext.
                </p>
                <Link to="/learn/symptom" className="text-blue-400 hover:text-blue-300 font-medium">
                  Learn how FHE works →
                </Link>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold bg-blue-50 text-blue-600 px-2 py-1 rounded-md">
              {r.n_bits}-bit
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            <ShieldOff size={11} /> Plaintext
          </span>
        )}

        <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          <Clock size={11} className="text-slate-400" />
          {date}
        </span>

        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Cpu size={11} />{r.inference_ms} ms
        </span>

        <button
          onClick={() => setConfirming(true)}
          disabled={deleting}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-40"
        >
          <Trash2 size={11} />
          {deleting ? 'Discarding…' : 'Discard'}
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Discard analysis"
          message="This analysis record will be permanently removed from the patient's history."
          confirmLabel="Discard"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}

      {r.topk_results.length > 0 ? (
        <div className="space-y-2">
          {r.topk_results.map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-bold text-slate-400">#{i + 1}</span>
              <span className="text-sm text-slate-800 w-44 truncate">{t.condition}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.round(t.probability * 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600 w-10 text-right">
                {(t.probability * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-slate-600">
          <span className="flex items-center gap-1">
            {r.positive
              ? <><CheckCircle2 size={13} className="text-green-500" /> Positive</>
              : <><XCircle size={13} className="text-slate-400" /> Negative</>
            }
            <span className="text-slate-400 ml-1">— confidence {(r.confidence * 100).toFixed(1)}%</span>
          </span>
        </div>
      )}
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const nav = useNavigate()

  const load = () => {
    if (id) getPatient(id).then(setPatient).finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading…</div>
  )
  if (!patient) return (
    <div className="text-center py-20 text-red-500 text-sm">Patient not found</div>
  )

  const sorted = [...patient.history].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <button
          onClick={() => nav('/')}
          className="mt-1 p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {ageFromDob(patient.date_of_birth) !== null ? `Age ${ageFromDob(patient.date_of_birth)}` : patient.date_of_birth}
            {' · '}{sorted.length} analysis{sorted.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          onClick={() => nav(`/patients/${id}/symptoms`)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
        >
          <FlaskConical size={15} />
          New Analysis
        </button>
      </div>

      {(patient.cnp || patient.medical_history || patient.date_of_birth) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-wrap gap-5 text-sm">
          {patient.date_of_birth && (
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Date of Birth</div>
              <div className="font-medium text-slate-800">{patient.date_of_birth}</div>
            </div>
          )}
          {patient.cnp && (
            <div>
              <div className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><CreditCard size={10} /> CNP</div>
              <div className="font-mono font-medium text-slate-800">{patient.cnp}</div>
            </div>
          )}
          {patient.medical_history && (
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><FileText size={10} /> Known Medical History</div>
              <div className="text-slate-700 leading-relaxed">{patient.medical_history}</div>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <FlaskConical size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">No analyses yet. Click "New Analysis" to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(r => (
            <RecordCard
              key={r.id}
              r={r}
              patientId={id!}
              onDeleted={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
