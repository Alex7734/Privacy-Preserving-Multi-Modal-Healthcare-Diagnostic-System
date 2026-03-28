import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, Trash2, Activity, Users, ChevronRight, FlaskConical, X } from 'lucide-react'
import type { Patient } from '../api/client'
import { listPatients, createPatient, deletePatient } from '../api/client'
import ConfirmDialog from '../components/ConfirmDialog'
import { ageFromDob } from '../utils/date'

const newPatientSchema = z.object({
  name:            z.string().min(1, 'Name is required'),
  date_of_birth:   z.string().min(1, 'Date of birth is required'),
  cnp:             z.string().max(13).optional(),
  medical_history: z.string().optional(),
})

type NewPatientForm = z.infer<typeof newPatientSchema>

function NewPatientModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<NewPatientForm>({
    resolver: zodResolver(newPatientSchema),
    defaultValues: { name: '', date_of_birth: '', cnp: '', medical_history: '' },
  })

  const dob = useWatch({ control, name: 'date_of_birth' })

  const onSubmit = async (data: NewPatientForm) => {
    await createPatient(data.name, data.date_of_birth, data.cnp ?? '', data.medical_history ?? '')
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">New Patient</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Full Name <span className="text-red-500">*</span></label>
            <input
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ion Popescu"
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Date of Birth <span className="text-red-500">*</span></label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              max={new Date().toISOString().split('T')[0]}
              {...register('date_of_birth')}
            />
            {errors.date_of_birth && <p className="text-xs text-red-500">{errors.date_of_birth.message}</p>}
            {dob && !errors.date_of_birth && (
              <p className="text-xs text-slate-400">Age: {ageFromDob(dob) ?? '—'} years old</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-1">
            <p className="text-xs text-slate-400 mb-3">Optional fields</p>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Identity Number (CNP)</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  placeholder="1234567890123"
                  maxLength={13}
                  {...register('cnp')}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Known Medical History</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="e.g. Type 2 diabetes, hypertension, allergic to penicillin…"
                  {...register('medical_history')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSubmitting ? 'Adding…' : 'Add Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PatientsPage() {
  const [patients,     setPatients]     = useState<Patient[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null)
  const nav = useNavigate()

  const load = () => listPatients().then(setPatients).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return
    await deletePatient(deleteTarget.id)
    setDeleteTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your patient records and run analyses</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <Users size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">{patients.length}</span>
            <span className="text-xs text-slate-400">patients</span>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
            <Activity size={16} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">
              {patients.reduce((s, p) => s + p.history.length, 0)}
            </span>
            <span className="text-xs text-slate-400">analyses</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <UserPlus size={15} />
            New Patient
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
          <Activity size={16} className="animate-spin mr-2" /> Loading patients…
        </div>
      ) : patients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Users size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm mb-4">No patients yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Add your first patient
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {patients.map(p => {
            const age = ageFromDob(p.date_of_birth)
            return (
              <div
                key={p.id}
                onClick={() => nav(`/patients/${p.id}`)}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-blue-600">
                    {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {age !== null ? `Age ${age}` : p.date_of_birth} · {p.history.length} analysis{p.history.length !== 1 ? 'es' : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); nav(`/patients/${p.id}/symptoms`) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                  >
                    <FlaskConical size={12} />
                    Analyze
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(p) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>

                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-400 shrink-0" />
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <NewPatientModal
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete patient"
          message={`Remove ${deleteTarget.name} and all their analysis history? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
