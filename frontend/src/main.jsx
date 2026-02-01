import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { NotificationProvider } from './components/NotificationContext'
import { ConnectionProvider, TabProvider, StatusProvider, OperationProvider } from './components/contexts'
import './index.css'

const container = document.getElementById('root')
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotificationProvider>
        <ConnectionProvider>
          <TabProvider>
            <StatusProvider>
              <OperationProvider>
                <App />
              </OperationProvider>
            </StatusProvider>
          </TabProvider>
        </ConnectionProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
