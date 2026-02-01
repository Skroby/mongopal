import { useState } from 'react'
import { parseError } from '../utils/errorParser'
import { useNotification } from './NotificationContext'

/**
 * Copy icon for the copy button
 */
const CopyIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

/**
 * Chevron icon for expand/collapse
 */
const ChevronIcon = ({ className = "w-4 h-4", expanded }) => (
  <svg
    className={`${className} transition-transform ${expanded ? 'rotate-90' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

/**
 * External link icon
 */
const ExternalLinkIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
)

/**
 * Settings/cog icon
 */
const SettingsIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

/**
 * Edit/pencil icon
 */
const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

/**
 * ActionableError component - displays errors with friendly messages, hints, and action buttons.
 *
 * @param {Object} props
 * @param {string} props.error - The error message to parse and display
 * @param {Function} props.onEditConnection - Callback when "Edit Connection" is clicked
 * @param {Function} props.onOpenSettings - Callback when "Open Settings" is clicked
 * @param {Function} props.onDismiss - Optional callback to dismiss/close the error
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.compact - Use compact layout (default: false)
 */
export default function ActionableError({
  error,
  onEditConnection,
  onOpenSettings,
  onDismiss,
  className = '',
  compact = false,
}) {
  const { notify } = useNotification()
  const [showDetails, setShowDetails] = useState(false)

  if (!error) return null

  const parsed = parseError(error)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(parsed.raw)
      notify.success('Error copied to clipboard')
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleAction = () => {
    if (parsed.action === 'editConnection' && onEditConnection) {
      onEditConnection()
    } else if (parsed.action === 'openSettings' && onOpenSettings) {
      onOpenSettings()
    } else if (parsed.action === 'openLink' && parsed.actionData) {
      window.open(parsed.actionData, '_blank', 'noopener,noreferrer')
    }
  }

  const getActionIcon = () => {
    switch (parsed.action) {
      case 'editConnection':
        return <EditIcon className="w-3.5 h-3.5" />
      case 'openSettings':
        return <SettingsIcon className="w-3.5 h-3.5" />
      case 'openLink':
        return <ExternalLinkIcon className="w-3.5 h-3.5" />
      default:
        return null
    }
  }

  const canShowAction = parsed.action && (
    (parsed.action === 'editConnection' && onEditConnection) ||
    (parsed.action === 'openSettings' && onOpenSettings) ||
    (parsed.action === 'openLink' && parsed.actionData)
  )

  if (compact) {
    // Compact layout for inline display
    return (
      <div className={`bg-red-900/30 border border-red-800 rounded px-3 py-2 ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-red-300 font-medium">{parsed.friendlyMessage}</div>
            {parsed.isKnown && (
              <div className="text-xs text-red-400/80 mt-0.5">{parsed.hint}</div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canShowAction && (
              <button
                className="p-1 rounded hover:bg-red-800/50 text-red-300 hover:text-red-200 text-xs flex items-center gap-1"
                onClick={handleAction}
                title={parsed.actionLabel}
              >
                {getActionIcon()}
              </button>
            )}
            <button
              className="p-1 rounded hover:bg-red-800/50 text-red-400 hover:text-red-300"
              onClick={handleCopy}
              title="Copy error"
            >
              <CopyIcon className="w-3.5 h-3.5" />
            </button>
            {parsed.raw !== parsed.friendlyMessage && (
              <button
                className="p-1 rounded hover:bg-red-800/50 text-red-400 hover:text-red-300"
                onClick={() => setShowDetails(!showDetails)}
                title={showDetails ? 'Hide details' : 'Show details'}
              >
                <ChevronIcon className="w-3.5 h-3.5" expanded={showDetails} />
              </button>
            )}
          </div>
        </div>
        {showDetails && (
          <div className="mt-2 pt-2 border-t border-red-800/50">
            <pre className="text-xs text-red-400/70 whitespace-pre-wrap break-words font-mono">
              {parsed.raw}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // Full layout (default)
  return (
    <div className={`bg-red-900/30 border border-red-800 rounded-lg ${className}`}>
      {/* Header with friendly message */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-red-300 font-medium mb-1">{parsed.friendlyMessage}</div>
          {parsed.isKnown && (
            <div className="text-sm text-red-400/80">{parsed.hint}</div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="p-1.5 rounded hover:bg-red-800/50 text-red-400 hover:text-red-300"
            onClick={handleCopy}
            title="Copy error"
          >
            <CopyIcon className="w-4 h-4" />
          </button>
          {onDismiss && (
            <button
              className="p-1.5 rounded hover:bg-red-800/50 text-red-400 hover:text-red-300"
              onClick={onDismiss}
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Actions and details toggle */}
      <div className="px-4 py-2 border-t border-red-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canShowAction && (
            <button
              className="text-xs text-red-300 hover:text-red-200 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-800/30"
              onClick={handleAction}
            >
              {getActionIcon()}
              <span>{parsed.actionLabel}</span>
            </button>
          )}
        </div>
        {parsed.raw !== parsed.friendlyMessage && (
          <button
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
            onClick={() => setShowDetails(!showDetails)}
          >
            <span>{showDetails ? 'Hide details' : 'Show details'}</span>
            <ChevronIcon className="w-3.5 h-3.5" expanded={showDetails} />
          </button>
        )}
      </div>

      {/* Expandable details */}
      {showDetails && (
        <div className="px-4 py-3 border-t border-red-800/50 bg-red-950/30">
          <pre className="text-xs text-red-400/70 whitespace-pre-wrap break-words font-mono overflow-auto max-h-32">
            {parsed.raw}
          </pre>
        </div>
      )}
    </div>
  )
}
