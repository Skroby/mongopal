import { Component, type ReactNode, type ErrorInfo, type ChangeEvent } from 'react'

/**
 * Props for the MonacoErrorBoundary component.
 */
export interface MonacoErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode
  /** Current value for fallback textarea */
  value?: string
  /** Callback when fallback textarea value changes */
  onChange?: (value: string) => void
  /** Placeholder text for fallback textarea */
  placeholder?: string
  /** Whether fallback textarea is read-only */
  readOnly?: boolean
}

interface MonacoErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary specifically for Monaco Editor.
 * Catches initialization failures and provides a textarea fallback with retry option.
 */
export default class MonacoErrorBoundary extends Component<MonacoErrorBoundaryProps, MonacoErrorBoundaryState> {
  constructor(props: MonacoErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): MonacoErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Monaco Editor failed to load:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    this.props.onChange?.(e.target.value)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { value, placeholder, readOnly } = this.props

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
            onChange={this.handleTextareaChange}
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
