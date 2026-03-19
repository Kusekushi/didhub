import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminProtectedRoute } from './components/AdminProtectedRoute'
import { ToastProvider } from './context/ToastContext'
import { ErrorProvider } from './context/ErrorContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BugReportModal } from './components/modals/BugReportModal'
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
import { useEffect } from 'react'
import { useToast } from './context/ToastContext'
import { useError } from './context/ErrorContext'
import { normalizeError, normalizeApiError } from './lib/errors'

function GlobalErrorHandler() {
  const { showError } = useError()
  const { show: showToast } = useToast()

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const normalized = normalizeError(event.error || event.message, 'window_error')
      showError(normalized)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const normalized = normalizeError(event.reason, 'unhandled_rejection')
      showError(normalized)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [showError])

  return null
}

function App() {
  return (
    <ToastProvider>
      <ErrorProvider>
        <GlobalErrorHandler />
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
        <ApiErrorModal />
      </ErrorProvider>
    </ToastProvider>
  )
}

function AppRoutes() {
  return (
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
  )
}

function ApiErrorModal() {
  const { error, clearError } = useError()

  if (error?.category === 'api') {
    return (
      <BugReportModal error={error} onClose={clearError} />
    )
  }

  return null
}

export default App
