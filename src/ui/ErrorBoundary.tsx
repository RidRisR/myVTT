import { Component, createElement } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (error) {
      if (fallback) {
        return fallback(error, this.handleReset)
      }

      return (
        <div className="flex items-center justify-center min-h-[200px] p-6">
          <div className="max-w-md w-full rounded-lg border border-border-glass bg-surface p-6 shadow-lg shadow-black/30">
            {/* Error icon */}
            <div className="flex items-center gap-3 mb-4">
              {createElement(AlertCircle, {
                size: 24,
                strokeWidth: 1.5,
                className: 'shrink-0 text-danger',
                'aria-hidden': true,
              })}
              <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
            </div>

            {/* Error message */}
            <p className="text-sm text-text-muted mb-4 break-words">
              {error.message || 'An unexpected error occurred.'}
            </p>

            {/* Retry button */}
            <button
              onClick={this.handleReset}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-deep transition-colors duration-fast hover:bg-accent-bold motion-reduce:transition-none"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return children
  }
}
