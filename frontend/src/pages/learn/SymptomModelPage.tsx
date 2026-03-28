import { useState, useEffect, useRef } from 'react'
import {
  FlaskConical, Lock, Unlock, Key, ArrowRight, ShieldCheck,
  Activity, Database, Brain, Cpu, Server, Eye, EyeOff, Zap, RefreshCw,
} from 'lucide-react'

const TABS = ['The Model', 'FHE Encryption', 'Bit-Width Guide', 'How PBS Works'] as const
type Tab = typeof TABS[number]

// ── helpers ──────────────────────────────────────────────────────────────────

function StatCard({ value, label, sublabel, icon }: {
  value: string; label: string; sublabel: string; icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{sublabel}</div>
      </div>
    </div>
  )
}

function StumpSVG({ feature, disease, score }: { feature: string; disease: string; score: string }) {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" className="shrink-0">
      <rect x="20" y="8" width="120" height="32" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
      <text x="80" y="22" textAnchor="middle" fontSize="8.5" fill="#3b82f6" fontFamily="system-ui">{feature}</text>
      <text x="80" y="34" textAnchor="middle" fontSize="8" fill="#60a5fa" fontFamily="system-ui">≤ 0.5?</text>
      <line x1="50" y1="40" x2="28" y2="76" stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="32" y="62" fontSize="8" fill="#94a3b8" fontFamily="system-ui">No</text>
      <line x1="110" y1="40" x2="132" y2="76" stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="114" y="62" fontSize="8" fill="#94a3b8" fontFamily="system-ui">Yes</text>
      <rect x="4" y="76" width="50" height="32" rx="5" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1.5" />
      <text x="29" y="93" textAnchor="middle" fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">Other</text>
      <text x="29" y="103" textAnchor="middle" fontSize="7.5" fill="#94a3b8" fontFamily="system-ui">score: 0</text>
      <rect x="106" y="76" width="50" height="32" rx="5" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5" />
      <text x="131" y="91" textAnchor="middle" fontSize="7.5" fill="#16a34a" fontFamily="system-ui">{disease}</text>
      <text x="131" y="103" textAnchor="middle" fontSize="7.5" fill="#16a34a" fontFamily="system-ui">score {score}</text>
    </svg>
  )
}

// ── Tab 1: The Model ──────────────────────────────────────────────────────────

function ModelTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard value="4,920" label="Training samples" sublabel="120 per class, evenly split across all diseases" icon={<Database size={18} className="text-blue-500" />} />
        <StatCard value="132" label="Symptom features" sublabel="Each one is either present (1) or absent (0)" icon={<Activity size={18} className="text-green-500" />} />
        <StatCard value="41" label="Disease classes" sublabel="Ranging from diabetes to vertigo" icon={<Brain size={18} className="text-purple-500" />} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-1">XGBoost with Decision Stumps</h3>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          20 decision trees, each with a single split (depth 1). We keep trees shallow because in FHE,
          every extra layer of depth multiplies the circuit size and inference time. Stumps are a sweet
          spot: fast to run encrypted, and accurate enough for this dataset.
        </p>

        <div className="flex items-end gap-3 overflow-x-auto pb-2">
          <StumpSVG feature="polyuria" disease="+Diabetes" score="+2.1" />
          <StumpSVG feature="polydipsia" disease="+Diabetes" score="+1.8" />
          <StumpSVG feature="weight loss" disease="+Diabetes" score="+1.4" />
          <div className="shrink-0 flex flex-col items-center justify-center h-[120px] w-20 text-slate-400">
            <div className="text-2xl font-light">…</div>
            <div className="text-xs text-center">17 more</div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
          <FlaskConical size={13} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Each stump checks one symptom and adds to the score of the diseases it correlates with. Once all
            20 stumps have voted, softmax turns the raw scores into probabilities across the 41 classes.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Prediction Pipeline</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: '132 binary features', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            null,
            { label: '20 stump trees', color: 'bg-slate-50 border-slate-200 text-slate-700' },
            null,
            { label: 'Aggregate scores (41 classes)', color: 'bg-slate-50 border-slate-200 text-slate-700' },
            null,
            { label: 'Softmax', color: 'bg-slate-50 border-slate-200 text-slate-700' },
            null,
            { label: 'Top-K diseases', color: 'bg-green-50 border-green-200 text-green-700' },
          ].map((step, i) =>
            step === null
              ? <ArrowRight key={i} size={14} className="text-slate-300 shrink-0" />
              : <div key={i} className={`px-3 py-2 rounded-xl border text-xs font-medium ${step.color}`}>{step.label}</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Training Results (this deployment)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="text-left pb-3 font-medium">Configuration</th>
              <th className="text-right pb-3 font-medium">Accuracy</th>
              <th className="text-right pb-3 font-medium">FHE Latency</th>
              <th className="text-right pb-3 font-medium">Compile time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-slate-700">
            {[
              { label: 'Float baseline (GBT)', acc: '99.5%', latency: '33 ms', compile: '—', highlight: false },
              { label: '3-bit FHE circuit', acc: '89.7%', latency: '~4 s', compile: '1.4 s', highlight: false },
              { label: '4-bit FHE circuit', acc: '94.2%', latency: '~8 s', compile: '1.7 s', highlight: false },
              { label: '5-bit FHE circuit', acc: '99.5%', latency: '~10 s', compile: '1.7 s', highlight: true },
            ].map(r => (
              <tr key={r.label} className={r.highlight ? 'bg-green-50/50' : ''}>
                <td className="py-3">{r.label}</td>
                <td className={`py-3 text-right font-semibold ${r.highlight ? 'text-green-700' : ''}`}>{r.acc}</td>
                <td className="py-3 text-right text-slate-500">{r.latency}</td>
                <td className="py-3 text-right text-slate-500">{r.compile}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-3">
          5-bit matches the float baseline exactly. At this precision the model's decision boundaries
          are fully preserved even after quantization.
        </p>
      </div>
    </div>
  )
}

// ── Tab 2: FHE Encryption ─────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  {
    id: 'symptoms',
    label: 'Symptom Vector',
    icon: <Activity size={18} />,
    color: 'bg-blue-50 border-blue-300',
    iconColor: 'text-blue-500',
    desc: 'The doctor checks which symptoms the patient has. Each of the 132 features becomes a 1 if present or a 0 if not.',
    preview: (
      <div className="flex flex-wrap gap-1 mt-2">
        {['polyuria ✓', 'polydipsia ✓', 'fatigue ✓', 'weight loss ✓', 'blurred vision ✓', 'headache ✗', 'cough ✗'].map(s => (
          <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-mono ${s.endsWith('✓') ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{s}</span>
        ))}
      </div>
    ),
  },
  {
    id: 'vector',
    label: 'Binary Encoding',
    icon: <span className="text-xs font-mono font-bold">[0,1]</span>,
    color: 'bg-violet-50 border-violet-300',
    iconColor: 'text-violet-500',
    desc: 'The selected symptoms are packed into a binary vector with 132 positions, one per symptom.',
    preview: (
      <div className="font-mono text-xs text-violet-700 mt-2 break-all leading-relaxed">
        [<span className="text-blue-600 font-bold">1</span>,<span className="text-blue-600 font-bold">1</span>,0,0,0,<span className="text-blue-600 font-bold">1</span>,0,0,<span className="text-blue-600 font-bold">1</span>,0,0,<span className="text-blue-600 font-bold">1</span>,0,0,…]
      </div>
    ),
  },
  {
    id: 'encrypt',
    label: 'FHE Encryption',
    icon: <Lock size={18} />,
    color: 'bg-green-50 border-green-300',
    iconColor: 'text-green-600',
    desc: 'The private key, which never leaves the doctor\'s machine, is used to encrypt the vector. The resulting ciphertext looks like random bytes to anyone without the key.',
    preview: (
      <div className="font-mono text-xs text-slate-400 mt-2 break-all leading-relaxed">
        🔒 a3f8b2c9d1e4f7a0b5c8d2e6f1a4b7c0d3e7f2a5b8c1d4e8…
      </div>
    ),
  },
  {
    id: 'upload',
    label: 'gRPC Upload',
    icon: <Server size={18} />,
    color: 'bg-slate-50 border-slate-300',
    iconColor: 'text-slate-500',
    desc: 'The ciphertext is streamed to the inference server over gRPC. All the server receives is encrypted bytes with no symptom names or values in sight.',
    preview: (
      <div className="flex items-center gap-2 mt-2">
        <EyeOff size={12} className="text-slate-400" />
        <span className="text-xs text-slate-400 italic">Server sees: ████████████████ (ciphertext only)</span>
      </div>
    ),
  },
  {
    id: 'compute',
    label: 'FHE Inference',
    icon: <Cpu size={18} />,
    color: 'bg-purple-50 border-purple-300',
    iconColor: 'text-purple-600',
    desc: 'The server runs the XGBoost circuit on the ciphertext using homomorphic operations. It never decrypts anything and has no way to do so.',
    preview: (
      <div className="flex items-center gap-2 mt-2">
        <div className="flex gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-1.5 h-6 bg-purple-200 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <span className="text-xs text-purple-600 font-medium">Homomorphic arithmetic…</span>
      </div>
    ),
  },
  {
    id: 'decrypt',
    label: 'Decrypt & Softmax',
    icon: <Unlock size={18} />,
    color: 'bg-green-50 border-green-300',
    iconColor: 'text-green-600',
    desc: 'The encrypted scores come back to the doctor\'s machine and get decrypted there. Softmax then converts the 41 raw scores into probabilities you can read.',
    preview: (
      <div className="space-y-1 mt-2">
        {[['Diabetes', '5.6%', 72], ['Jaundice', '2.4%', 30], ['Hepatitis D', '2.4%', 30]].map(([name, pct, w]) => (
          <div key={name as string} className="flex items-center gap-2">
            <span className="text-xs text-slate-600 w-24">{name}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${w}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-600 w-8 text-right">{pct}</span>
          </div>
        ))}
      </div>
    ),
  },
]

function FheTab() {
  const [activeStep, setActiveStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const play = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setActiveStep(0)
    setPlaying(true)
    let s = 0
    intervalRef.current = setInterval(() => {
      s++
      setActiveStep(s)
      if (s >= PIPELINE_STEPS.length - 1) {
        clearInterval(intervalRef.current!)
        setPlaying(false)
      }
    }, 1800)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return (
    <div className="space-y-6">
      {/* Pipeline animation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-slate-800">End-to-End Encryption Flow</h3>
            <p className="text-xs text-slate-400 mt-0.5">Step through the full FHE inference lifecycle</p>
          </div>
          <button
            onClick={play}
            disabled={playing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {playing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            {playing ? 'Playing…' : activeStep >= 0 ? 'Replay' : 'Play Animation'}
          </button>
        </div>

        {/* Step cards */}
        <div className="space-y-2">
          {PIPELINE_STEPS.map((step, i) => {
            const isActive = i === activeStep
            const isDone = i < activeStep
            const isPending = activeStep === -1 || i > activeStep

            return (
              <div
                key={step.id}
                onClick={() => setActiveStep(i)}
                className={`rounded-xl border-2 p-4 cursor-pointer transition-all duration-300 ${
                  isActive
                    ? `${step.color} shadow-md`
                    : isDone
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : 'bg-slate-50 border-transparent opacity-40 hover:opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isActive ? `bg-white shadow-sm ${step.iconColor}` : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isDone ? <ShieldCheck size={16} className="text-green-500" /> : step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                        Step {i + 1}
                      </span>
                      <span className={`text-sm font-semibold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                        {step.label}
                      </span>
                    </div>
                    {isActive && (
                      <div className="mt-1">
                        <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
                        {step.preview}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">Click any step to expand it, or use Play to animate through.</p>
      </div>

      {/* Why probabilities are flat */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-1">Why FHE probabilities look flat</h3>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          The <strong>ranking is always correct</strong>, but the confidence percentages look very different between
          plaintext and FHE. Here is why:
        </p>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Eye size={11} /> Plaintext inference (33 ms)
            </div>
            <div className="space-y-2">
              {[
                { name: 'Diabetes', pct: 97.7, w: 98, color: 'bg-blue-500' },
                { name: 'Jaundice', pct: 0.9, w: 1, color: 'bg-blue-300' },
                { name: 'Hyperthyroidism', pct: 0.1, w: 0.5, color: 'bg-blue-200' },
                { name: 'Heart attack', pct: 0.1, w: 0.5, color: 'bg-blue-200' },
              ].map(r => (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-28 truncate">{r.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${r.color} transition-all`} style={{ width: `${r.w}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-10 text-right">{r.pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Full float32 logits give softmax a wide range to work with, so it picks one clear winner.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Lock size={11} /> FHE 5-bit inference (~10 s)
            </div>
            <div className="space-y-2">
              {[
                { name: 'Diabetes', pct: 5.6, w: 72, color: 'bg-green-400' },
                { name: 'Jaundice', pct: 2.4, w: 30, color: 'bg-green-300' },
                { name: 'Hepatitis D', pct: 2.4, w: 30, color: 'bg-green-200' },
                { name: 'Chicken pox', pct: 2.4, w: 30, color: 'bg-green-200' },
              ].map(r => (
                <div key={r.name} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-28 truncate">{r.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${r.color} transition-all`} style={{ width: `${r.w}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-10 text-right">{r.pct}%</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Quantized logits lose range, so the scores end up closer together and softmax spreads more evenly.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Key size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <strong>The takeaway:</strong> Quantizing to n_bits compresses the spread of the 41 logit scores,
            so softmax distributes probability more evenly across classes. The winner is still the same
            (Diabetes is #1 in both cases), only the percentage changes. The diagnostic result holds.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: Bit-Width Guide ────────────────────────────────────────────────────

const BIT_DATA = [
  {
    bits: 3,
    acc: 89.7,
    latency: '~4 s',
    latencyMs: 4000,
    keys: 'Small',
    use: 'Quick screening, useful when you need a fast answer and can accept slightly lower accuracy',
    color: 'border-l-orange-400',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    bits: 4,
    acc: 94.2,
    latency: '~8 s',
    latencyMs: 8000,
    keys: 'Medium',
    use: 'A balanced option, good accuracy without paying the full latency cost of 5-bit',
    color: 'border-l-blue-400',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    bits: 5,
    acc: 99.5,
    latency: '~10 s',
    latencyMs: 10000,
    keys: 'Large',
    use: 'Best accuracy, results match plaintext exactly and confidence calibration is as good as it gets',
    color: 'border-l-green-400',
    badge: 'bg-green-50 text-green-700 border-green-200',
  },
]

function BitWidthTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-1">What is bit-width quantization?</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          FHE circuits work with integers, not floats. Before compiling the model, each weight and activation
          gets rounded to fit in n_bits of precision. More bits means values stay closer to the original floats
          and accuracy is better, but the circuit grows larger and inference takes longer.
        </p>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-mono text-xs">
            float32: 3.14159265…
          </div>
          <ArrowRight size={14} className="text-slate-300" />
          <div className="px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-orange-700 font-mono text-xs">
            3-bit: 3
          </div>
          <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-mono text-xs">
            4-bit: 3.1
          </div>
          <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-green-700 font-mono text-xs">
            5-bit: 3.14
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {BIT_DATA.map(d => (
          <div key={d.bits} className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 border-l-4 ${d.color}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className={`font-mono font-bold text-lg px-3 py-1 rounded-xl border ${d.badge}`}>
                  {d.bits}-bit
                </span>
                <div>
                  <div className="font-semibold text-slate-800">{d.latency} latency</div>
                  <div className="text-xs text-slate-400">Eval keys: {d.keys}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{d.acc}%</div>
                <div className="text-xs text-slate-400">accuracy</div>
              </div>
            </div>

            {/* Accuracy bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Accuracy vs float baseline (99.5%)</span>
                <span>{d.acc}%</span>
              </div>
              <div className="bg-slate-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-400 transition-all duration-700"
                  style={{ width: `${(d.acc / 99.5) * 100}%` }}
                />
              </div>
            </div>

            {/* Latency bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>FHE latency</span>
                <span>{d.latency}</span>
              </div>
              <div className="bg-slate-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-purple-300 transition-all duration-700"
                  style={{ width: `${(d.latencyMs / 10000) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-sm text-slate-600">
              <span className="font-medium">Best for:</span> {d.use}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-800 mb-3">Why separate circuits and keys per bit-width?</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          Each bit-width compiles to a different circuit with different{' '}
          <span className="font-medium text-slate-700">PBS (Programmable Bootstrapping)</span> parameter tables.
          Because the circuit structure changes, the evaluation keys change too. You generate and upload keys
          for each bit-width you want to use, the server caches them, and switching precision after that is instant.
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Tab 4: How PBS Works ──────────────────────────────────────────────────────

// Noise bar heights for each phase. 16 bars, heights in px (max 56).
const NOISE_BARS: number[][] = [
  [20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],       // 0 clean
  [18,23,17,24,19,22,21,17,20,25,16,23,20,17,24,18],       // 1 slight
  [13,30,10,33,12,28,34,12,17,35,9,30,15,11,32,14],        // 2 moderate
  [6,46,4,52,5,40,56,6,10,54,4,48,8,5,50,7],               // 3 heavy (danger)
  [20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],       // 4 clean again
]

const NOISE_LABELS = ['Start', 'Op 1', 'Op 2', 'Op 3 ⚠', 'After PBS']
const NOISE_COLORS = [
  'bg-green-400', 'bg-blue-400', 'bg-amber-400', 'bg-red-400', 'bg-green-400',
]

function PBSTab() {
  const [noisePhase, setNoisePhase]   = useState(0)
  const [noiseAnim,  setNoiseAnim]    = useState(false)
  const [lutBits,    setLutBits]      = useState(3)
  const noiseTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const playNoise = () => {
    if (noiseTimer.current) clearInterval(noiseTimer.current)
    setNoisePhase(0)
    setNoiseAnim(true)
    let p = 0
    noiseTimer.current = setInterval(() => {
      p++
      setNoisePhase(p)
      if (p >= 4) { clearInterval(noiseTimer.current!); setNoiseAnim(false) }
    }, 900)
  }
  useEffect(() => () => { if (noiseTimer.current) clearInterval(noiseTimer.current) }, [])

  const lutSize     = Math.pow(2, lutBits)
  const threshold   = Math.floor(lutSize * 0.4)   // where the step function fires

  return (
    <div className="space-y-6">

      {/* Noise problem */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-2">The noise problem in FHE</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          Every arithmetic operation on a ciphertext adds a tiny amount of random noise. A single
          comparison or addition is fine, but run 20 stump trees and the noise stacks up. If it
          gets too large, decryption breaks. Bootstrapping is the fix: it resets the noise back to
          a safe level so computation can continue. PBS does this while also evaluating a function
          on the encrypted value at the same time.
        </p>

        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Noise in the ciphertext over time
            </span>
            <button
              onClick={playNoise}
              disabled={noiseAnim}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {noiseAnim ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
              {noiseAnim ? 'Running…' : 'Animate'}
            </button>
          </div>

          <div className="flex items-end gap-3">
            {NOISE_BARS.map((bars, phase) => {
              const isActive  = phase === noisePhase
              const isPast    = phase < noisePhase
              const isPbs     = phase === 4
              return (
                <div
                  key={phase}
                  className={`flex-1 rounded-xl p-3 transition-all duration-500 cursor-pointer ${
                    isActive
                      ? isPbs ? 'bg-green-50 border-2 border-green-300' : 'bg-white border-2 border-blue-300 shadow-md'
                      : isPast ? 'bg-slate-50 border border-slate-100 opacity-60' : 'bg-slate-50 border border-slate-100 opacity-40'
                  }`}
                  onClick={() => setNoisePhase(phase)}
                >
                  {/* Bar chart */}
                  <div className="flex items-end justify-center gap-0.5 h-14 mb-2">
                    {bars.map((h, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-t transition-all duration-700 ${
                          isPbs ? 'bg-green-400' :
                          phase === 3 ? 'bg-red-400' :
                          phase === 2 ? 'bg-amber-400' :
                          phase === 1 ? 'bg-blue-400' : 'bg-green-400'
                        }`}
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  {/* Label */}
                  <div className={`text-center text-xs font-semibold ${
                    isPbs ? 'text-green-700' : phase === 3 ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {NOISE_LABELS[phase]}
                  </div>
                  {isPbs && (
                    <div className="text-center text-xs text-green-600 mt-0.5 font-medium">✓ refreshed</div>
                  )}
                  {phase === 3 && isActive && (
                    <div className="text-center text-xs text-red-500 mt-0.5">too noisy!</div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center">
            Click any column or press Animate. The PBS step resets noise to the same level as the start.
          </p>
        </div>
      </div>

      {/* The programmable part: LUT */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-2">The "Programmable" part: lookup tables</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          Regular bootstrapping just refreshes noise. PBS goes further: during the refresh, it secretly
          evaluates a lookup table (LUT) on the encrypted value. You define the LUT ahead of time with
          the function you want to compute. The server runs it without ever seeing the input value.
          For this model, each stump's comparison (<em>is this symptom score above the threshold?</em>)
          is encoded as a step function in a LUT.
        </p>

        {/* LUT bits selector */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-sm text-slate-600 font-medium">Bit-width:</span>
          {[3, 4, 5].map(b => (
            <button
              key={b}
              onClick={() => setLutBits(b)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                lutBits === b
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {b}-bit
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-1">= {lutSize} LUT entries (2^{lutBits})</span>
        </div>

        <div className="grid grid-cols-2 gap-6 items-start">
          {/* LUT table */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Step function LUT — "is score &gt; threshold?"
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
              <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 px-3 py-2">
                <span>Input (enc)</span>
                <span className="text-center">f(x)</span>
                <span className="text-right">Output (enc)</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {Array.from({ length: lutSize }, (_, i) => {
                  const isThreshold = i === threshold
                  const output = i >= threshold ? 1 : 0
                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-3 px-3 py-1.5 transition-colors ${
                        isThreshold ? 'bg-blue-50 border-l-2 border-blue-400' :
                        output === 1 ? 'bg-green-50/50' : ''
                      }`}
                    >
                      <span className="font-mono text-slate-500">🔒 x={i}</span>
                      <span className={`text-center font-mono font-semibold ${output ? 'text-green-700' : 'text-slate-400'}`}>
                        {output ? '1' : '0'}
                      </span>
                      <span className={`text-right font-mono ${output ? 'text-green-700' : 'text-slate-400'}`}>
                        🔒 {output ? 'score+' : 'score 0'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              The server evaluates this table on the ciphertext without knowing which row it landed on.
            </p>
          </div>

          {/* Visual bar showing threshold */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Value space ({lutSize} levels)
            </div>
            <div className="space-y-0.5">
              {Array.from({ length: lutSize }, (_, i) => {
                const j = lutSize - 1 - i   // render top to bottom
                const isAbove = j >= threshold
                const isThreshold = j === threshold
                return (
                  <div key={j} className="flex items-center gap-2">
                    <div className={`h-5 rounded transition-all ${isAbove ? 'bg-green-400' : 'bg-slate-200'} ${isThreshold ? 'ring-2 ring-blue-400' : ''}`}
                      style={{ width: `${((j + 1) / lutSize) * 100}%`, minWidth: '4px' }}
                    />
                    {isThreshold && (
                      <span className="text-xs text-blue-600 font-semibold whitespace-nowrap">
                        ← threshold (output flips here)
                      </span>
                    )}
                    {j === lutSize - 1 && !isThreshold && (
                      <span className="text-xs text-green-600">output = 1</span>
                    )}
                    {j === 0 && (
                      <span className="text-xs text-slate-400">output = 0</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Stump → PBS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-2">How a decision stump becomes a PBS call</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-5">
          When Concrete ML compiles the XGBoost model to an FHE circuit, each stump's comparison
          gets replaced by a PBS call. The LUT encodes the step function for that stump. The rest
          (accumulating scores, applying softmax) also gets lowered into a chain of PBS operations.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Stump */}
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-5 py-4 text-center">
            <div className="text-xs font-semibold text-blue-500 uppercase mb-1">Decision stump</div>
            <div className="font-mono text-sm text-blue-800 font-bold">polyuria ≤ 0.5?</div>
            <div className="text-xs text-blue-500 mt-1">if Yes → +score</div>
          </div>

          <ArrowRight size={18} className="text-slate-300 shrink-0" />

          {/* Compile */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Compile</div>
            <div className="text-xs text-slate-500 leading-relaxed">
              FHEModelDev<br/>quantize + lower
            </div>
          </div>

          <ArrowRight size={18} className="text-slate-300 shrink-0" />

          {/* PBS */}
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50 px-5 py-4 text-center">
            <div className="text-xs font-semibold text-purple-500 uppercase mb-1">PBS call</div>
            <div className="font-mono text-sm text-purple-800 font-bold">pbs(enc_x, LUT)</div>
            <div className="text-xs text-purple-500 mt-1">noise reset + f(x) applied</div>
          </div>

          <ArrowRight size={18} className="text-slate-300 shrink-0" />

          {/* Output */}
          <div className="rounded-xl border-2 border-green-200 bg-green-50 px-5 py-4 text-center">
            <div className="text-xs font-semibold text-green-500 uppercase mb-1">Result</div>
            <div className="font-mono text-sm text-green-800 font-bold">enc(score_delta)</div>
            <div className="text-xs text-green-500 mt-1">still encrypted</div>
          </div>
        </div>

        <div className="mt-5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500 leading-relaxed">
          This model has 20 stumps predicting across 41 classes, so the full circuit runs many PBS calls
          in sequence. Each bit-width compiles to a different set of PBS parameter tables and a
          correspondingly different evaluation key. That is why 3-bit, 4-bit, and 5-bit need separate keys
          and separate key uploads.
        </div>
      </div>

      {/* Key size comparison */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">How bit-width affects the keys and latency</h3>
        <div className="space-y-4">
          {[
            { bits: 3, lutEntries: 8,  relKeySize: 40, relLatency: 38, latency: '~4 s',  keyDesc: 'smaller LUT, simpler PBS parameters' },
            { bits: 4, lutEntries: 16, relKeySize: 70, relLatency: 80, latency: '~8 s',  keyDesc: 'double the LUT entries vs 3-bit' },
            { bits: 5, lutEntries: 32, relKeySize: 100, relLatency: 100, latency: '~10 s', keyDesc: 'largest LUT, most precise, needs the biggest eval key' },
          ].map(d => (
            <div key={d.bits} className="space-y-1.5">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-slate-700 w-10">{d.bits}-bit</span>
                <span className="text-xs text-slate-400 w-20">{d.lutEntries} LUT entries</span>
                <span className="text-xs text-slate-400 flex-1">{d.keyDesc}</span>
                <span className="text-xs font-semibold text-slate-600">{d.latency}</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-slate-400 w-20">Key size</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-blue-400 transition-all duration-700" style={{ width: `${d.relKeySize}%` }} />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-slate-400 w-20">Latency</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-purple-400 transition-all duration-700" style={{ width: `${d.relLatency}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

export default function SymptomModelPage() {
  const [tab, setTab] = useState<Tab>('The Model')

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Symptom Model</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          How the FHE-compiled XGBoost model works, what it predicts, and how encryption affects the results
        </p>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'The Model'       && <ModelTab />}
      {tab === 'FHE Encryption'  && <FheTab />}
      {tab === 'Bit-Width Guide' && <BitWidthTab />}
      {tab === 'How PBS Works'   && <PBSTab />}
    </div>
  )
}
