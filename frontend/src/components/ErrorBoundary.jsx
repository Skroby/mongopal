import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleDismiss = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleCopy = async () => {
    const errorText = [
      this.state.error?.toString(),
      this.state.errorInfo?.componentStack
    ].filter(Boolean).join('\n\n')

    try {
      await navigator.clipboard.writeText(errorText)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface p-8">
          <div className="max-w-lg w-full bg-surface-secondary border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Something went wrong</h2>
                <p className="text-sm text-zinc-400">The application encountered an unexpected error</p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 bg-zinc-900 rounded border border-zinc-700 overflow-auto max-h-32">
                <code className="text-sm text-red-400 whitespace-pre-wrap">
                  {this.state.error.toString()}
                </code>
              </div>
            )}

            {this.state.errorInfo?.componentStack && (
              <details className="mb-4">
                <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300">
                  Show stack trace
                </summary>
                <div className="mt-2 p-3 bg-zinc-900 rounded border border-zinc-700 overflow-auto max-h-48">
                  <code className="text-xs text-zinc-500 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </code>
                </div>
              </details>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleCopy}
                className="w-full py-2 px-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded flex items-center justify-center gap-2 transition-colors"
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
                >
                  Try to Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
