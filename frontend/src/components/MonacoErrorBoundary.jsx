import { Component } from 'react'

/**
 * Error boundary specifically for Monaco Editor.
 * Catches initialization failures and provides a textarea fallback with retry option.
 */
export default class MonacoErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Monaco Editor failed to load:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const { value, onChange, placeholder, readOnly } = this.props

      return (
        <div className="h-full flex flex-col">
          <div className="bg-amber-900/30 text-amber-400 px-3 py-2 text-sm border-b border-amber-800 flex items-center justify-between">
            <span>Editor failed to load. Using fallback text area.</span>
            <button
              onClick={this.handleRetry}
              className="px-2 py-1 text-xs bg-amber-800 hover:bg-amber-700 rounded transition-colors"
            >
              Retry Editor
            </button>
          </div>
          <textarea
            className="flex-1 w-full bg-surface text-zinc-200 p-4 font-mono text-sm resize-none focus:outline-none"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder || 'Enter JSON...'}
            readOnly={readOnly}
            spellCheck={false}
          />
        </div>
      )
    }

    return this.props.children
  }
}
