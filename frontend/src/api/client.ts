import axios from 'axios'
import { z } from 'zod'

export const api = axios.create({ baseURL: '/api' })

export const TopKResultSchema = z.object({
  condition: z.string(),
  probability: z.number(),
  linked_model: z.string(),
})

export const PredictionRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  model: z.string(),
  fhe_used: z.boolean(),
  n_bits: z.number(),
  topk_results: z.array(TopKResultSchema),
  confidence: z.number(),
  positive: z.boolean(),
  inference_ms: z.number(),
})

export const PatientSchema = z.object({
  id: z.string(),
  name: z.string(),
  date_of_birth: z.string(),
  cnp: z.string(),
  medical_history: z.string(),
  created_at: z.string(),
  history: z.array(PredictionRecordSchema),
})

export const SettingsSchema = z.object({
  fhe_enabled: z.boolean(),
  inference_server_url: z.string(),
  default_top_k: z.number(),
  eval_key_ttl_seconds: z.number(),
})

export const ModelKeyStatusSchema = z.object({
  ready: z.boolean(),
  uploaded: z.boolean(),
  generated_at: z.number().nullable(),
  expires_unix: z.number().optional(),
  eval_keys_bytes: z.number(),
})

// { [model_name]: { [n_bits]: ModelKeyStatus } }
export const KeyStatusSchema = z.record(z.string(), z.record(z.string(), ModelKeyStatusSchema))

export const SymptomMetadataSchema = z.object({
  feature_names: z.array(z.string()),
  classes: z.array(z.string()),
})

export const SymptomResultSchema = z.object({
  record_id: z.string(),
  fhe_used: z.boolean(),
  n_bits: z.number(),
  inference_ms: z.number(),
  topk_results: z.array(TopKResultSchema),
})

export type TopKResult      = z.infer<typeof TopKResultSchema>
export type PredictionRecord = z.infer<typeof PredictionRecordSchema>
export type Patient         = z.infer<typeof PatientSchema>
export type Settings        = z.infer<typeof SettingsSchema>
export type ModelKeyStatus  = z.infer<typeof ModelKeyStatusSchema>
export type KeyStatus       = z.infer<typeof KeyStatusSchema>
export type SymptomMetadata = z.infer<typeof SymptomMetadataSchema>
export type SymptomResult   = z.infer<typeof SymptomResultSchema>

export const listPatients  = ()                          => api.get<Patient[]>('/patients').then(r => r.data)
export const createPatient = (name: string, date_of_birth: string, cnp = '', medical_history = '') =>
  api.post<Patient>('/patients', { name, date_of_birth, cnp, medical_history }).then(r => r.data)
export const getPatient    = (id: string)                 => api.get<Patient>(`/patients/${id}`).then(r => r.data)
export const deletePatient = (id: string)                 => api.delete(`/patients/${id}`).then(r => r.data)
export const deleteRecord  = (patientId: string, recordId: string) =>
  api.delete(`/patients/${patientId}/records/${recordId}`).then(r => r.data)

export const predictSymptoms = (patientId: string, symptom_vector: number[], top_k = 5, n_bits = 3) =>
  api.post<SymptomResult>(`/patients/${patientId}/symptoms`, { symptom_vector, top_k, n_bits }).then(r => r.data)

export const getKeyStatus  = ()                           => api.get<KeyStatus>('/keys/status').then(r => r.data)
export const generateKeys  = (n_bits: number)             => api.post<KeyStatus>('/keys/generate', { n_bits }).then(r => r.data)

export const getSettings    = ()                          => api.get<Settings>('/settings').then(r => r.data)
export const updateSettings = (s: Partial<Settings>)      => api.put<Settings>('/settings', s).then(r => r.data)

export const getSymptomMetadata = () =>
  api.get<SymptomMetadata>('/model/symptom/metadata').then(r => r.data)
