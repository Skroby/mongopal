import React from 'react'
import { createRoot } from 'react-dom/client'
// Configure Monaco to use local files (must be before any Editor imports)
import './monacoConfig'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { NotificationProvider } from './components/NotificationContext'
import { ConnectionProvider, TabProvider, StatusProvider, OperationProvider, ExportQueueProvider, DebugProvider, SchemaProvider, ThemeProvider } from './components/contexts'
import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
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
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
