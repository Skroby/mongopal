import { Component, ErrorInfo, ReactNode } from 'react'

// LocalStorage key for preserved state
const PRESERVED_STATE_KEY = 'mongopal_error_recovery_state'
// GitHub issues URL - set to actual repo when available
const GITHUB_ISSUES_URL: string | null = null // 'https://github.com/your-org/mongopal/issues/new'

/**
 * Props interface for ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** Child components to render when no error has occurred */
  children: ReactNode
}

/**
 * State interface for ErrorBoundary component
 */
export interface ErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean
  /** The caught error object */
  error: Error | null
  /** Additional error information from React */
  errorInfo: ErrorInfo | null
  /** Whether state has been saved for recovery */
  stateSaved: boolean
  /** Whether to show the save confirmation message */
  showSaveConfirmation: boolean
  /** Whether to show the "report copied" message */
  showReportCopied: boolean
}

/**
 * Preserved state structure saved to localStorage
 */
export interface PreservedState {
  /** ISO timestamp when the error occurred */
  timestamp: string
  /** String representation of the error */
  error?: string
  /** Query history from localStorage */
  queryHistory: string | null
  /** Sidebar width from localStorage */
  sidebarWidth: string | null
  /** Settings from localStorage */
  settings: string | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      stateSaved: false,
      showSaveConfirmation: false,
      showReportCopied: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  // Attempt to gather current application state for preservation
  gatherCurrentState = (): PreservedState | null => {
    try {
      // Get tabs from TabContext (we can't access React context directly from class component,
      // but we can try to get it from any global state or localStorage)
      // The TabContext doesn't persist to localStorage by default, so we'll save what we can

      const state: PreservedState = {
        timestamp: new Date().toISOString(),
        error: this.state.error?.toString(),
        // Try to preserve query history (this is already in localStorage)
        queryHistory: localStorage.getItem('mongopal_query_history'),
        // Preserve sidebar width
        sidebarWidth: localStorage.getItem('mongopal_sidebar_width'),
        // Preserve any settings
        settings: localStorage.getItem('mongopal_settings'),
        // Note: tabs state is in React state and not easily accessible here
        // We'll add a note about this limitation
      }

      return state
    } catch (err) {
      console.error('Failed to gather state:', err)
      return null
    }
  }

  // Save current state to localStorage before reset
  saveStateForRecovery = (): boolean => {
    try {
      const state = this.gatherCurrentState()
      if (state) {
        localStorage.setItem(PRESERVED_STATE_KEY, JSON.stringify(state))
        this.setState({ stateSaved: true, showSaveConfirmation: true })
        setTimeout(() => this.setState({ showSaveConfirmation: false }), 2000)
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to save state for recovery:', err)
      return false
    }
  }

  handleReload = (): void => {
    // Save state before reloading
    this.saveStateForRecovery()
    window.location.reload()
  }

  handleDismiss = (): void => {
    // Save state before dismissing (resetting)
    this.saveStateForRecovery()
    this.setState({ hasError: false, error: null, errorInfo: null, stateSaved: false })
  }

  handleCopy = async (): Promise<void> => {
    const errorText = [
      'MongoPal Error Report',
      '='.repeat(40),
      '',
      'Error:',
      this.state.error?.toString(),
      '',
      'Stack Trace:',
      this.state.errorInfo?.componentStack,
      '',
      'Timestamp: ' + new Date().toISOString(),
      'User Agent: ' + navigator.userAgent,
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(errorText)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  handleReportIssue = async (): Promise<void> => {
    // Copy error details to clipboard
    await this.handleCopy()

    if (GITHUB_ISSUES_URL) {
      const errorSummary = this.state.error?.toString() || 'Unknown error'
      const issueTitle = encodeURIComponent(`Bug: ${errorSummary.slice(0, 80)}`)
      const issueBody = encodeURIComponent([
        '## Description',
        'An unexpected error occurred in the application.',
        '',
        '## Error Details',
        '```',
        this.state.error?.toString(),
        '```',
        '',
        '## Steps to Reproduce',
        '1. [Describe what you were doing when the error occurred]',
        '',
        '## Environment',
        `- Timestamp: ${new Date().toISOString()}`,
        `- User Agent: ${navigator.userAgent}`,
        '',
        '## Stack Trace',
        '```',
        this.state.errorInfo?.componentStack || 'Not available',
        '```',
      ].join('\n'))

      window.open(`${GITHUB_ISSUES_URL}?title=${issueTitle}&body=${issueBody}`, '_blank')
    } else {
      // No GitHub URL configured - just show that error was copied
      this.setState({ showReportCopied: true })
      setTimeout(() => this.setState({ showReportCopied: false }), 3000)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface p-8">
          <div className="max-w-lg w-full bg-surface-secondary text-text border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error-dark/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">Something went wrong</h2>
                <p className="text-sm text-text-muted">The application encountered an unexpected error</p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 bg-background rounded border border-border overflow-auto max-h-32">
                <code className="text-sm text-error whitespace-pre-wrap">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            {this.state.errorInfo?.componentStack && (
              <details className="mb-4">
                <summary className="text-sm text-text-muted cursor-pointer hover:text-text-secondary">
                  Show stack trace
                </summary>
                <div className="mt-2 p-3 bg-background rounded border border-border overflow-auto max-h-48">
                  <code className="text-xs text-text-muted whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </code>
                </div>
              </details>
            )}

            {/* Warning about state reset */}
            <div className="mb-4 p-3 bg-warning-dark/20 border border-amber-700/50 rounded flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm">
                <p className="text-amber-400 font-medium">Recovery will reset your session</p>
                <p className="text-amber-500/80 text-xs mt-1">
                  Open tabs and unsaved changes may be lost. Query history and settings are preserved.
                </p>
              </div>
            </div>

            {/* Save confirmation */}
            {this.state.showSaveConfirmation && (
              <div className="mb-4 p-2 bg-success-dark/20 border border-green-700/50 rounded text-sm text-success text-center">
                State saved for recovery
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleCopy}
                className="w-full py-2 px-4 bg-surface-hover hover:bg-surface-active text-text rounded flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Error to Clipboard
              </button>
              <div className="flex gap-2">
                <button
                  onClick={this.handleReload}
                  className="btn btn-primary flex-1"
                >
                  Reload Application
                </button>
                <button
                  onClick={this.handleDismiss}
                  className="btn btn-ghost"
                  title="Attempt to recover without reloading. Open tabs will be lost."
                >
                  Reset and Continue
                </button>
              </div>
              {/* Report Issue link */}
              <button
                onClick={this.handleReportIssue}
                className="w-full py-2 px-4 text-text-muted hover:text-text-light text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {this.state.showReportCopied ? (
                  <>
                    <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-success">Error details copied to clipboard</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Report this issue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Helper function to check for preserved state (can be called by App.jsx on load)
export function getPreservedState(): PreservedState | null {
  try {
    const saved = localStorage.getItem(PRESERVED_STATE_KEY)
    if (saved) {
      return JSON.parse(saved) as PreservedState
    }
  } catch (err) {
    console.error('Failed to retrieve preserved state:', err)
  }
  return null
}

// Helper function to clear preserved state
export function clearPreservedState(): void {
  try {
    localStorage.removeItem(PRESERVED_STATE_KEY)
  } catch (err) {
    console.error('Failed to clear preserved state:', err)
  }
}

// Helper function to check if recovery state exists
export function hasPreservedState(): boolean {
  try {
    return localStorage.getItem(PRESERVED_STATE_KEY) !== null
  } catch {
    return false
  }
}

export default ErrorBoundary
