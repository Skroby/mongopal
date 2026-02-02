import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'

const NotificationContext = createContext(null)

// Maximum number of visible toasts before collapsing
const MAX_VISIBLE_NOTIFICATIONS = 4

let notificationId = 0

// Maximum number of notifications to keep in history
const MAX_HISTORY_SIZE = 50

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [notificationHistory, setNotificationHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // Add notification to history when it's dismissed
  const addToHistory = useCallback((notification) => {
    const historyEntry = {
      ...notification,
      timestamp: new Date().toISOString(),
      important: notification.type === 'error', // Mark errors as important
    }

    setNotificationHistory(prev => {
      const newHistory = [historyEntry, ...prev]
      // Keep only the most recent MAX_HISTORY_SIZE items
      // But keep important (error) items longer - they're only removed when total exceeds limit
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(0, MAX_HISTORY_SIZE)
      }
      return newHistory
    })

    setUnreadCount(prev => prev + 1)
  }, [])

  const addNotification = useCallback((type, message, options = {}) => {
    const id = ++notificationId
    const notification = {
      id,
      type,
      message,
      duration: options.duration ?? (type === 'error' ? 8000 : 5000),
      dismissible: options.dismissible ?? true,
    }

    setNotifications(prev => {
      // Check if the last notification has the same message and type for grouping
      const lastNotification = prev[prev.length - 1]
      if (lastNotification && lastNotification.message === message && lastNotification.type === type) {
        // Update the count of the last notification instead of adding a new one
        return prev.map((n, index) =>
          index === prev.length - 1
            ? { ...n, count: (n.count || 1) + 1 }
            : n
        )
      }
      return [...prev, notification]
    })

    return id
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id)
      if (notification) {
        // Add to history when dismissed
        addToHistory(notification)
      }
      return prev.filter(n => n.id !== id)
    })
  }, [addToHistory])

  const clearHistory = useCallback(() => {
    setNotificationHistory([])
    setUnreadCount(0)
  }, [])

  const toggleHistory = useCallback(() => {
    setShowHistory(prev => {
      if (!prev) {
        // Opening history - mark all as read
        setUnreadCount(0)
      }
      return !prev
    })
  }, [])

  const closeHistory = useCallback(() => {
    setShowHistory(false)
  }, [])

  const clearAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const notify = {
    info: (message, options) => addNotification('info', message, options),
    success: (message, options) => addNotification('success', message, options),
    warning: (message, options) => addNotification('warning', message, options),
    error: (message, options) => addNotification('error', message, options),
  }

  return (
    <NotificationContext.Provider value={{
      notify,
      removeNotification,
      clearAllNotifications,
      notificationHistory,
      showHistory,
      unreadCount,
      toggleHistory,
      closeHistory,
      clearHistory,
    }}>
      {children}
      <NotificationContainer
        notifications={notifications}
        onDismiss={removeNotification}
        onClearAll={clearAllNotifications}
      />
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}

function NotificationContainer({ notifications, onDismiss, onClearAll }) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate visible notifications and hidden count
  const { visibleNotifications, hiddenCount } = useMemo(() => {
    if (isExpanded || notifications.length <= MAX_VISIBLE_NOTIFICATIONS) {
      return { visibleNotifications: notifications, hiddenCount: 0 }
    }
    return {
      visibleNotifications: notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS),
      hiddenCount: notifications.length - MAX_VISIBLE_NOTIFICATIONS
    }
  }, [notifications, isExpanded])

  // Reset expanded state when notifications are cleared
  useEffect(() => {
    if (notifications.length <= MAX_VISIBLE_NOTIFICATIONS) {
      setIsExpanded(false)
    }
  }, [notifications.length])

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {/* Clear All button when multiple notifications */}
      {notifications.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={onClearAll}
            className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700/80 px-2 py-1 rounded transition-colors"
          >
            Clear all ({notifications.length})
          </button>
        </div>
      )}

      {visibleNotifications.map(notification => (
        <Notification
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
        />
      ))}

      {/* Hidden notifications summary */}
      {hiddenCount > 0 && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-zinc-800/90 border-l-4 border-zinc-500 text-zinc-300 px-4 py-2 rounded-lg shadow-lg text-sm hover:bg-zinc-700/90 transition-colors flex items-center justify-between"
        >
          <span>+{hiddenCount} more notification{hiddenCount > 1 ? 's' : ''}</span>
          <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Collapse button when expanded */}
      {isExpanded && notifications.length > MAX_VISIBLE_NOTIFICATIONS && (
        <button
          onClick={() => setIsExpanded(false)}
          className="bg-zinc-800/90 border-l-4 border-zinc-500 text-zinc-300 px-4 py-2 rounded-lg shadow-lg text-sm hover:bg-zinc-700/90 transition-colors flex items-center justify-between"
        >
          <span>Show less</span>
          <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Notification({ notification, onDismiss }) {
  const { type, message, dismissible, duration, count } = notification
  const [isPaused, setIsPaused] = useState(false)
  const remainingTimeRef = useRef(duration)
  const startTimeRef = useRef(Date.now())
  const timerRef = useRef(null)

  useEffect(() => {
    if (duration <= 0) return

    const startTimer = () => {
      startTimeRef.current = Date.now()
      timerRef.current = setTimeout(() => {
        onDismiss()
      }, remainingTimeRef.current)
    }

    if (!isPaused) {
      startTimer()
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [isPaused, duration, onDismiss])

  const handleMouseEnter = () => {
    if (duration <= 0) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      const elapsed = Date.now() - startTimeRef.current
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed)
    }
    setIsPaused(true)
  }

  const handleMouseLeave = () => {
    if (duration <= 0) return
    setIsPaused(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const styles = {
    info: {
      bg: 'bg-blue-950/90',
      border: 'border-l-4 border-blue-400',
      text: 'text-zinc-100',
      iconColor: 'text-blue-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    success: {
      bg: 'bg-emerald-950/90',
      border: 'border-l-4 border-emerald-400',
      text: 'text-zinc-100',
      iconColor: 'text-emerald-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-amber-950/90',
      border: 'border-l-4 border-amber-400',
      text: 'text-zinc-100',
      iconColor: 'text-amber-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-red-950/90',
      border: 'border-l-4 border-red-400',
      text: 'text-zinc-100',
      iconColor: 'text-red-400',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }

  const style = styles[type] || styles.info

  return (
    <div
      className={`${style.bg} ${style.border} ${style.text} px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-slide-up max-w-md`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className={`flex-shrink-0 mt-0.5 ${style.iconColor}`}>{style.icon}</span>
      <span className="flex-1 text-sm select-text cursor-text max-h-32 overflow-y-auto break-words">
        {message}
        {count > 1 && <span className="ml-1 text-xs opacity-75">({count}x)</span>}
      </span>
      {type === 'error' && (
        <button
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          onClick={handleCopy}
          title="Copy error message"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      )}
      {dismissible && (
        <button
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          onClick={onDismiss}
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

// Notification history drawer/popover component
export function NotificationHistoryDrawer() {
  const {
    notificationHistory,
    showHistory,
    closeHistory,
    clearHistory,
  } = useNotification()
  const drawerRef = useRef(null)

  // Close drawer when clicking outside
  useEffect(() => {
    if (!showHistory) return

    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        // Check if click was on the toggle button
        const toggleButton = document.querySelector('[data-notification-history-toggle]')
        if (toggleButton && toggleButton.contains(e.target)) {
          return // Let the toggle button handle it
        }
        closeHistory()
      }
    }

    // Delay adding listener to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showHistory, closeHistory])

  // Close on Escape key
  useEffect(() => {
    if (!showHistory) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeHistory()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showHistory, closeHistory])

  if (!showHistory) return null

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const typeStyles = {
    info: {
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-950/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    success: {
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-950/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    warning: {
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-950/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    error: {
      iconColor: 'text-red-400',
      bgColor: 'bg-red-950/30',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }

  return (
    <div
      ref={drawerRef}
      className="fixed bottom-8 right-4 w-96 max-h-[60vh] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 flex flex-col animate-slide-up"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="text-sm font-medium text-zinc-200">Notification History</span>
          <span className="text-xs text-zinc-500">({notificationHistory.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {notificationHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Clear history"
            >
              Clear all
            </button>
          )}
          <button
            onClick={closeHistory}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notificationHistory.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {notificationHistory.map((notification) => {
              const style = typeStyles[notification.type] || typeStyles.info
              const handleCopy = async () => {
                try {
                  await navigator.clipboard.writeText(notification.message)
                } catch (err) {
                  console.error('Failed to copy:', err)
                }
              }
              return (
                <div
                  key={`${notification.id}-${notification.timestamp}`}
                  className={`px-4 py-3 hover:bg-zinc-800/50 transition-colors group ${notification.important ? 'border-l-2 border-red-500' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 mt-0.5 ${style.iconColor}`}>
                      {style.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 break-words">{notification.message}</p>
                      <p className="text-xs text-zinc-500 mt-1">{formatTimestamp(notification.timestamp)}</p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all"
                      title="Copy message"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Bell icon button for status bar
export function NotificationHistoryButton() {
  const { unreadCount, toggleHistory } = useNotification()

  return (
    <button
      data-notification-history-toggle
      className="relative p-1 rounded hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
      onClick={toggleHistory}
      title={`Notification history${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center bg-red-500 text-white text-[10px] font-medium rounded-full px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

export default NotificationContext
