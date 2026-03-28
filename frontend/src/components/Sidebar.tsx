import { NavLink } from 'react-router-dom'
import { Users, Settings, ShieldCheck, ShieldOff, Stethoscope, Activity, Server, FlaskConical } from 'lucide-react'
import { useApp } from '../context/AppContext'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
  }`

export default function Sidebar() {
  const { settings } = useApp()
  const fhe = settings?.fhe_enabled ?? null

  return (
    <aside className="w-60 shrink-0 bg-slate-900 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Stethoscope size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">FHE Medical</div>
            <div className="text-slate-400 text-xs">Doctor Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Management
        </div>
        <NavLink to="/" end className={navLinkClass}>
          <Users size={16} />
          Patients
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          <Settings size={16} />
          Settings
        </NavLink>

        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mt-5 mb-2">
          Insights
        </div>
        <NavLink to="/learn/architecture" className={navLinkClass}>
          <Server size={16} />
          Architecture
        </NavLink>
        <NavLink to="/learn/symptom" className={navLinkClass}>
          <FlaskConical size={16} />
          Symptom Model
        </NavLink>
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        {fhe === null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
            <Activity size={14} className="text-slate-400 animate-pulse" />
            <span className="text-xs text-slate-400">Connecting…</span>
          </div>
        )}
        {fhe === true && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/50 border border-green-700/50">
            <ShieldCheck size={14} className="text-green-400" />
            <span className="text-xs text-green-300 font-medium">FHE Enabled</span>
          </div>
        )}
        {fhe === false && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/50 border border-amber-700/50">
            <ShieldOff size={14} className="text-amber-400" />
            <span className="text-xs text-amber-300 font-medium">FHE Disabled</span>
          </div>
        )}
      </div>
    </aside>
  )
}
