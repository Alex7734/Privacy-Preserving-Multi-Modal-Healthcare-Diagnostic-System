import { useState, useRef, useEffect } from 'react'
import {
  Monitor, Server, Shield, Key, ArrowRight,
  EyeOff, Cpu, Zap, RefreshCw,
} from 'lucide-react'

const STEPS = [
  {
    node: 'browser',
    label: 'Doctor selects symptoms',
    desc: 'The doctor checks which symptoms are present in the React UI. The raw symptom values exist in plaintext only in the browser at this point.',
    color: 'bg-blue-50 border-blue-300 text-blue-800',
  },
  {
    node: 'client',
    label: 'Client encrypts the vector',
    desc: 'DoctorClientService receives the symptom vector and encrypts it using the FHE private key. The plaintext never leaves this process.',
    color: 'bg-green-50 border-green-300 text-green-800',
  },
  {
    node: 'wire-out',
    label: 'Ciphertext sent over gRPC',
    desc: 'The encrypted ciphertext is chunked and streamed to the inference server over gRPC. Anyone intercepting the traffic just sees random bytes.',
    color: 'bg-slate-50 border-slate-300 text-slate-800',
  },
  {
    node: 'server',
    label: 'Server runs FHE computation',
    desc: 'The inference server runs the XGBoost circuit on the ciphertext using homomorphic operations. It never decrypts anything and has no way to do so.',
    color: 'bg-purple-50 border-purple-300 text-purple-800',
  },
  {
    node: 'wire-in',
    label: 'Encrypted result returned',
    desc: 'The encrypted output scores come back to the client. Still ciphertext the whole way, nothing is readable on the return path.',
    color: 'bg-slate-50 border-slate-300 text-slate-800',
  },
  {
    node: 'client',
    label: 'Client decrypts and computes Top-K',
    desc: 'DoctorClientService decrypts the result using the private key, applies softmax over 41 disease scores, and returns the Top-K probabilities to the UI.',
    color: 'bg-green-50 border-green-300 text-green-800',
  },
]

function DiagramNode({
  icon, title, subtitle, badge, active, done,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  badge?: React.ReactNode
  active: boolean
  done: boolean
}) {
  return (
    <div className={`flex flex-col items-center gap-2 flex-1 transition-all duration-500 ${done ? 'opacity-50' : active ? 'opacity-100' : 'opacity-40'}`}>
      <div className={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center transition-all duration-500 ${
        active ? 'bg-white shadow-lg border-blue-400' : 'bg-slate-100 border-slate-200'
      }`}>
        <div className={`transition-colors duration-300 ${active ? 'text-blue-600' : 'text-slate-400'}`}>
          {icon}
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-400">{subtitle}</div>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
    </div>
  )
}

function Arrow({ active, label, reverse, encrypted = true }: {
  active: boolean; label: string; reverse?: boolean; encrypted?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-start pt-5 w-16 gap-1 shrink-0">
      <div className={`h-0.5 w-full transition-all duration-700 ${active ? 'bg-blue-400' : 'bg-slate-200'}`} />
      <div className={`transition-all duration-300 ${reverse ? 'rotate-180' : ''}`}>
        <ArrowRight size={13} className={active ? 'text-blue-500' : 'text-slate-300'} />
      </div>
      <div className="text-center text-xs text-slate-400 leading-tight">{label}</div>
      {active && encrypted && (
        <div className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">
          🔒
        </div>
      )}
    </div>
  )
}

function SystemDiagram({ step }: { step: number }) {
  const browserActive = step >= 0 && STEPS[step]?.node === 'browser'
  const clientActive  = step >= 0 && STEPS[step]?.node === 'client'
  const serverActive  = step >= 0 && STEPS[step]?.node === 'server'
  const wireOutActive = step >= 0 && STEPS[step]?.node === 'wire-out'
  const wireInActive  = step >= 0 && STEPS[step]?.node === 'wire-in'

  return (
    <div className="flex items-start gap-4">
      {/* Local machine boundary */}
      <div className="flex-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-4">
        <div className="text-xs font-medium text-slate-400 mb-4 text-center">Doctor's machine (local)</div>
        <div className="flex items-start gap-2">
          <DiagramNode
            icon={<Monitor size={22} />}
            title="Browser"
            subtitle=":5173"
            badge={<span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">React UI</span>}
            active={browserActive}
            done={step > 0 && !browserActive}
          />
          <Arrow active={step >= 1} label="localhost" encrypted={false} />
          <DiagramNode
            icon={<Shield size={22} />}
            title="DoctorClientService"
            subtitle=":8001"
            badge={
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center">
                <Key size={9} /> Private key
              </span>
            }
            active={clientActive}
            done={step > 1 && step < 5 && !clientActive}
          />
        </div>
      </div>

      {/* Cross-network arrow */}
      <div className="flex flex-col items-center justify-center gap-1 pt-12 shrink-0 w-20">
        <div className={`h-0.5 w-full transition-all duration-700 ${wireOutActive || wireInActive ? 'bg-blue-400' : 'bg-slate-300'}`} />
        <div className={wireInActive && !wireOutActive ? 'rotate-180' : ''}>
          <ArrowRight size={14} className={wireOutActive || wireInActive ? 'text-blue-500' : 'text-slate-400'} />
        </div>
        <div className="text-xs text-slate-400 text-center">gRPC</div>
        {(wireOutActive || wireInActive) && (
          <div className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">🔒</div>
        )}
      </div>

      {/* Remote server */}
      <div className="w-44 shrink-0 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 p-4">
        <div className="text-xs font-medium text-purple-400 mb-4 text-center">Remote server</div>
        <DiagramNode
          icon={<Cpu size={22} />}
          title="FHEInferenceServer"
          subtitle=":8000"
          badge={
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center">
              <EyeOff size={9} /> No plaintext
            </span>
          }
          active={serverActive}
          done={step > 3 && !serverActive}
        />
      </div>
    </div>
  )
}

export default function ArchitecturePage() {
  const [step, setStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const play = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setStep(0)
    setPlaying(true)
    let s = 0
    timerRef.current = setInterval(() => {
      s++
      if (s >= STEPS.length) {
        clearInterval(timerRef.current!)
        setPlaying(false)
        setStep(STEPS.length - 1)
      } else {
        setStep(s)
      }
    }, 1800)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System Architecture</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Two services, one privacy guarantee. Here is how data moves through the system and what each part actually sees.
        </p>
      </div>

      {/* Interactive diagram */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Data Flow</h2>
            <p className="text-xs text-slate-400 mt-0.5">Click steps below or animate the full flow</p>
          </div>
          <button
            onClick={play}
            disabled={playing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {playing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            {playing ? 'Animating…' : step >= 0 ? 'Replay' : 'Animate'}
          </button>
        </div>

        <SystemDiagram step={step} />

        {/* Step description */}
        <div className="mt-6 min-h-16">
          {step >= 0 && step < STEPS.length && (
            <div className={`rounded-xl border px-4 py-3 transition-all ${STEPS[step].color}`}>
              <div className="text-xs font-bold uppercase tracking-wide mb-1">
                Step {step + 1} of {STEPS.length}
              </div>
              <div className="text-sm font-semibold mb-0.5">{STEPS[step].label}</div>
              <div className="text-xs opacity-80 leading-relaxed">{STEPS[step].desc}</div>
            </div>
          )}
        </div>

        {/* Step selector */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                step === i
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              }`}
            >
              {i + 1}. {s.label.split(' ').slice(0, 2).join(' ')}…
            </button>
          ))}
        </div>
      </div>

      {/* Trust model */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-green-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">DoctorClientService</div>
              <div className="text-xs text-slate-400">Runs on the doctor's machine, fully trusted</div>
            </div>
          </div>
          <ul className="space-y-2.5 text-xs text-slate-600">
            {[
              ['Holds the FHE private key', true],
              ['Sees plaintext symptom features', true],
              ['Encrypts before sending', true],
              ['Decrypts after receiving', true],
              ['Stores patient records (textproto)', true],
              ['Communicates with browser via REST', true],
            ].map(([item, ok]) => (
              <li key={item as string} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-green-400' : 'bg-slate-300'}`} />
                {item as string}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Server size={18} className="text-slate-500" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">FHEInferenceServer</div>
              <div className="text-xs text-slate-400">Can run remotely, no trust needed</div>
            </div>
          </div>
          <ul className="space-y-2.5 text-xs text-slate-600">
            {[
              ['Holds FHE server model + eval keys', true],
              ['Never sees plaintext features', false],
              ['Never holds the private key', false],
              ['Computes on ciphertext only', true],
              ['Caches eval keys by UUID handle', true],
              ['No patient data stored', false],
            ].map(([item, positive]) => (
              <li key={item as string} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${positive ? 'bg-slate-400' : 'bg-red-300'}`} />
                {item as string}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Eval key handle pattern */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Eval Key Handle Pattern</h3>
        <div className="flex items-start gap-8">
          <div className="flex-1">
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              FHE evaluation keys for this model are around 29 MB. Uploading them on every inference
              would add 10+ seconds per request, so the system uses a{' '}
              <strong className="text-slate-700">handle pattern</strong>: upload once, reference by UUID after that.
            </p>
            <ol className="space-y-3">
              {[
                'Keys are generated on the client and uploaded once per bit-width per session',
                'The inference server stores them in memory and returns a UUID handle',
                'Every subsequent inference sends only the ciphertext and the UUID, no key transfer needed',
                'Handles expire after a configurable TTL (default 1 hour). Regenerate if needed.',
              ].map((item, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-600">
                  <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div className="shrink-0 bg-slate-900 rounded-xl p-4 text-xs font-mono w-52 space-y-2">
            <div className="text-slate-400"># One-time upload per session</div>
            <div className="text-green-400">eval_key (29 MB)</div>
            <div className="text-slate-400">→ server returns:</div>
            <div className="text-blue-400">handle: "a3f8-b2c9-…"</div>
            <div className="mt-3 text-slate-400"># Each inference</div>
            <div className="text-green-400">ciphertext</div>
            <div className="text-blue-400">+ handle</div>
            <div className="text-slate-400">→ enc_result</div>
          </div>
        </div>
      </div>

      {/* Tech stack */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Technology Stack</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'Concrete ML (Zama)', desc: 'FHE-compiled XGBoost circuits via TFHE', color: 'bg-blue-50 border-blue-100' },
            { name: 'gRPC + Protocol Buffers', desc: 'Typed binary transport for ciphertexts and eval keys', color: 'bg-slate-50 border-slate-100' },
            { name: 'FastAPI', desc: 'DoctorClientService and InferenceService', color: 'bg-green-50 border-green-100' },
            { name: 'React + Vite + Tailwind', desc: 'Doctor-facing browser UI (:5173)', color: 'bg-purple-50 border-purple-100' },
            { name: 'Textproto storage', desc: 'Patient records stored as protobuf text files, no database required', color: 'bg-orange-50 border-orange-100' },
            { name: 'Python 3.11', desc: 'Required for Concrete ML compatibility', color: 'bg-slate-50 border-slate-100' },
          ].map(item => (
            <div key={item.name} className={`rounded-xl border px-4 py-3 ${item.color}`}>
              <div className="text-sm font-semibold text-slate-800">{item.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
