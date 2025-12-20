import { Routes, Route } from 'react-router-dom'
import './App.css'
import LoginPage from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminProtectedRoute } from './components/AdminProtectedRoute'
import { ToastProvider } from './context/ToastContext'
import SignupPage from './pages/Signup'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/Dashboard'
import SettingsPage from './pages/Settings'
import ProfilePage from './pages/Profile'
import UsersPage from './pages/Users'
import DIDSystemView from './pages/DIDSystemView'
import AlterDetail from './pages/AlterDetail'
import UserIntro from './pages/UserIntro'
import AdminPanel from './pages/AdminPanel'
import FamilyTreeView from './pages/FamilyTreeView'
import AffiliationDetail from './pages/AffiliationDetail'
import SubsystemDetail from './pages/SubsystemDetail'
import AdminSettings from './pages/AdminSettings'
import AdminUsers from './pages/AdminUsers'
import AdminDatabase from './pages/AdminDatabase'
import AdminSecurity from './pages/AdminSecurity'
import AdminJobs from './pages/AdminJobs'
import AdminSystemRequests from './pages/AdminSystemRequests'
import AdminUpdates from './pages/AdminUpdates'
import AwaitingApproval from './pages/AwaitingApproval'
import BirthdayCalendar from './pages/BirthdayCalendar'

function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/awaiting-approval" element={<AwaitingApproval />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* All other routes use the AppLayout which includes top appbar + sidebar */}
        <Route element={<AppLayout />}> 
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/users/:id" element={<ProtectedRoute><UserIntro /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
          <Route path="/system/:userId?" element={<ProtectedRoute><DIDSystemView /></ProtectedRoute>} />
          <Route path="/alter/:alterId" element={<ProtectedRoute><AlterDetail /></ProtectedRoute>} />
          <Route path="/affiliation/:affiliationId" element={<ProtectedRoute><AffiliationDetail /></ProtectedRoute>} />
          <Route path="/subsystem/:subsystemId" element={<ProtectedRoute><SubsystemDetail /></ProtectedRoute>} />
          <Route path="/family-tree" element={<ProtectedRoute><FamilyTreeView /></ProtectedRoute>} />
          <Route path="/birthdays" element={<ProtectedRoute><BirthdayCalendar /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/admin" element={<AdminProtectedRoute><AdminPanel /></AdminProtectedRoute>} />
          <Route path="/admin/settings" element={<AdminProtectedRoute><AdminSettings /></AdminProtectedRoute>} />
          <Route path="/admin/users" element={<AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>} />
          <Route path="/admin/database" element={<AdminProtectedRoute><AdminDatabase /></AdminProtectedRoute>} />
          <Route path="/admin/security" element={<AdminProtectedRoute><AdminSecurity /></AdminProtectedRoute>} />
          <Route path="/admin/jobs" element={<AdminProtectedRoute><AdminJobs /></AdminProtectedRoute>} />
          <Route path="/admin/system-requests" element={<AdminProtectedRoute><AdminSystemRequests /></AdminProtectedRoute>} />
          <Route path="/admin/updates" element={<AdminProtectedRoute><AdminUpdates /></AdminProtectedRoute>} />
          {/* child routes can be added here and will render into <Outlet /> */}
        </Route>
      </Routes>
    </ToastProvider>
  )
}

export default App
