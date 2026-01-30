import { createContext, useContext, useState, useCallback } from 'react'

const NotificationContext = createContext(null)

let notificationId = 0

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])

  const addNotification = useCallback((type, message, options = {}) => {
    const id = ++notificationId
    const notification = {
      id,
      type,
      message,
      duration: options.duration ?? (type === 'error' ? 8000 : 5000),
      dismissible: options.dismissible ?? true,
    }

    setNotifications(prev => [...prev, notification])

    if (notification.duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, notification.duration)
    }

    return id
  }, [])

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const notify = {
    info: (message, options) => addNotification('info', message, options),
    success: (message, options) => addNotification('success', message, options),
    warning: (message, options) => addNotification('warning', message, options),
    error: (message, options) => addNotification('error', message, options),
  }

  return (
    <NotificationContext.Provider value={{ notify, removeNotification }}>
      {children}
      <NotificationContainer notifications={notifications} onDismiss={removeNotification} />
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

function NotificationContainer({ notifications, onDismiss }) {
  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
        />
      ))}
    </div>
  )
}

function Notification({ notification, onDismiss }) {
  const { type, message, dismissible } = notification

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const styles = {
    info: {
      bg: 'bg-blue-900/90',
      text: 'text-blue-100',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    success: {
      bg: 'bg-green-900/90',
      text: 'text-green-100',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-yellow-900/90',
      text: 'text-yellow-100',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-red-900/90',
      text: 'text-red-100',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }

  const style = styles[type] || styles.info

  return (
    <div className={`${style.bg} ${style.text} px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 animate-slide-up max-w-md`}>
      <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
      <span className="flex-1 text-sm select-text cursor-text max-h-32 overflow-y-auto break-words">{message}</span>
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

export default NotificationContext
