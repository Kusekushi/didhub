import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminProtectedRoute } from './components/AdminProtectedRoute'
import { ErrorProvider } from './context/ErrorContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BugReportModal } from './components/modals/BugReportModal'
import AppLayout from './components/AppLayout'
import { useError } from './context/ErrorContext'
import { normalizeError } from './lib/errors'

const LoginPage = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const SignupPage = lazy(() => import('./pages/Signup'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const ProfilePage = lazy(() => import('./pages/Profile'))
const UsersPage = lazy(() => import('./pages/Users'))
const DIDSystemView = lazy(() => import('./pages/DIDSystemView'))
const AlterDetail = lazy(() => import('./pages/AlterDetail'))
const UserIntro = lazy(() => import('./pages/UserIntro'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const FamilyTreeView = lazy(() => import('./pages/FamilyTreeView'))
const AffiliationDetail = lazy(() => import('./pages/AffiliationDetail'))
const SubsystemDetail = lazy(() => import('./pages/SubsystemDetail'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminDatabase = lazy(() => import('./pages/AdminDatabase'))
const AdminSecurity = lazy(() => import('./pages/AdminSecurity'))
const AdminJobs = lazy(() => import('./pages/AdminJobs'))
const AdminSystemRequests = lazy(() => import('./pages/AdminSystemRequests'))
const AdminUpdates = lazy(() => import('./pages/AdminUpdates'))
const AwaitingApproval = lazy(() => import('./pages/AwaitingApproval'))
const BirthdayCalendar = lazy(() => import('./pages/BirthdayCalendar'))

function GlobalErrorHandler() {
  const { showError } = useError()

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
    <ErrorProvider>
      <GlobalErrorHandler />
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-svh">
              <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
          }
        >
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
      <ApiErrorModal />
    </ErrorProvider>
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
