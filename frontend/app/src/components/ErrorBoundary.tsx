import { Component, type ReactNode } from 'react'
import { BugReportModal } from './modals/BugReportModal'
import { useError } from '@/context/ErrorContext'
import { normalizeError } from '@/lib/errors'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryImpl extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const normalized = normalizeError(error, 'runtime', errorInfo.componentStack)
    const { showError } = this.context as { showError: (e: typeof normalized) => void }
    showError(normalized)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}

export function ErrorBoundary({ children, fallback }: Props) {
  const { error, clearError } = useError()

  return (
    <>
      <ErrorBoundaryImpl fallback={fallback}>
        {children}
      </ErrorBoundaryImpl>
      {error && error.category !== 'api' && (
        <BugReportModal error={error} onClose={clearError} />
      )}
    </>
  )
}
