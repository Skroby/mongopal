import React from 'react'
import { createRoot } from 'react-dom/client'
// Configure Monaco to use local files (must be before any Editor imports)
import './monacoConfig'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { NotificationProvider } from './components/NotificationContext'
import { ConnectionProvider, TabProvider, StatusProvider, OperationProvider, ExportQueueProvider, DebugProvider, SchemaProvider } from './components/contexts'
import './index.css'

const container = document.getElementById('root')
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <DebugProvider>
        <NotificationProvider>
          <ConnectionProvider>
            <TabProvider>
              <StatusProvider>
                <OperationProvider>
                  <ExportQueueProvider>
                    <SchemaProvider>
                      <App />
                    </SchemaProvider>
                  </ExportQueueProvider>
                </OperationProvider>
              </StatusProvider>
            </TabProvider>
          </ConnectionProvider>
        </NotificationProvider>
      </DebugProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
