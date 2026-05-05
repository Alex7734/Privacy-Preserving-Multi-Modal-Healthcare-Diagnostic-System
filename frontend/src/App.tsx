import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import SymptomFormPage from './pages/SymptomFormPage'
import HeartFormPage from './pages/HeartFormPage'
import EEGFormPage from './pages/EEGFormPage'
import SettingsPage from './pages/SettingsPage'
import ArchitecturePage from './pages/learn/ArchitecturePage'
import SymptomModelPage from './pages/learn/SymptomModelPage'
import { AppProvider } from './context/AppContext'
import Sidebar from './components/Sidebar'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-slate-50">
            <div className="px-8 py-8">
              <Routes>
                <Route path="/"                      element={<PatientsPage />} />
                <Route path="/patients/:id"          element={<PatientDetailPage />} />
                <Route path="/patients/:id/symptoms" element={<SymptomFormPage />} />
                <Route path="/patients/:id/heart"   element={<HeartFormPage />} />
                <Route path="/patients/:id/eeg"     element={<EEGFormPage />} />
                <Route path="/settings"              element={<SettingsPage />} />
                <Route path="/learn/architecture"   element={<ArchitecturePage />} />
                <Route path="/learn/symptom"        element={<SymptomModelPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </AppProvider>
    </BrowserRouter>
  )
}
