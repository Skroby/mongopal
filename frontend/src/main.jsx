import React from 'react'
import { createRoot } from 'react-dom/client'
// Configure Monaco to use local files (must be before any Editor imports)
import './monacoConfig'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { NotificationProvider } from './components/NotificationContext'
import { ConnectionProvider, TabProvider, StatusProvider, OperationProvider, ExportQueueProvider } from './components/contexts'
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
                <ExportQueueProvider>
                  <App />
                </ExportQueueProvider>
              </OperationProvider>
            </StatusProvider>
          </TabProvider>
        </ConnectionProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
