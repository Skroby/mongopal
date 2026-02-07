import { useState, useEffect, useRef, useCallback, type FC, type ChangeEvent } from 'react'

// Type definitions for Wails bindings
interface WailsApp {
  GetPerformanceMetrics?: () => Promise<PerformanceMetrics>
  ForceGC?: () => Promise<void>
}

const getGo = (): WailsApp | undefined => {
  const win = window as Window & { go?: { main?: { App?: WailsApp } } }
  return win.go?.main?.App
}

const go: WailsApp | undefined = getGo()

export interface PerformanceMetrics {
  heapAlloc: number
  heapSys: number
  heapInuse: number
  stackInuse: number
  sys: number
  totalAllocated: number
  goroutines: number
  numGC: number
  lastGCPauseNs: number
  activeConnections: number
  uptimeSeconds: number
}

export interface PerformancePanelProps {
  onClose: () => void
}

interface HistoryData {
  heapAlloc: number[]
  goroutines: number[]
  gcPause: number[]
}

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

interface MetricRowProps {
  label: string
  value: string
  subValue?: string
  sparklineData?: number[]
  sparklineColor?: string
}

interface SectionProps {
  title: string
  children: React.ReactNode
  icon: React.ReactNode
}

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Format nanoseconds to human readable
function formatNanoseconds(ns: number): string {
  if (ns < 1000) return ns + ' ns'
  if (ns < 1000000) return (ns / 1000).toFixed(2) + ' \u00b5s'
  if (ns < 1000000000) return (ns / 1000000).toFixed(2) + ' ms'
  return (ns / 1000000000).toFixed(2) + ' s'
}

// Format seconds to human readable duration
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${secs}s`)

  return parts.join(' ')
}

// Simple sparkline component
const Sparkline: FC<SparklineProps> = ({ data, width = 100, height = 20, color = '#4CC38A' }) => {
  if (!data || data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="inline-block ml-2">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Metric row component
const MetricRow: FC<MetricRowProps> = ({ label, value, subValue, sparklineData, sparklineColor }) => {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-400 text-sm">{label}</span>
      <div className="flex items-center">
        <div className="text-right">
          <span className="text-zinc-200 font-mono text-sm">{value}</span>
          {subValue && (
            <span className="text-zinc-500 text-xs ml-1">({subValue})</span>
          )}
        </div>
        {sparklineData && <Sparkline data={sparklineData} color={sparklineColor} />}
      </div>
    </div>
  )
}

// Section component
const Section: FC<SectionProps> = ({ title, children, icon }) => {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{title}</h3>
        <div className="flex-1 h-px bg-zinc-700" />
      </div>
      <div className="pl-1">
        {children}
      </div>
    </div>
  )
}

const PerformancePanel: FC<PerformancePanelProps> = ({ onClose }) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [history, setHistory] = useState<HistoryData>({
    heapAlloc: [],
    goroutines: [],
    gcPause: [],
  })
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [pollInterval, setPollInterval] = useState<number>(1500)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const maxHistoryPoints = 60

  const fetchMetrics = useCallback(async (): Promise<void> => {
    if (!go?.GetPerformanceMetrics) {
      setError('Performance metrics not available')
      return
    }

    try {
      const data = await go.GetPerformanceMetrics()
      setMetrics(data)
      setError(null)

      // Update history
      setHistory(prev => ({
        heapAlloc: [...prev.heapAlloc, data.heapAlloc].slice(-maxHistoryPoints),
        goroutines: [...prev.goroutines, data.goroutines].slice(-maxHistoryPoints),
        gcPause: [...prev.gcPause, data.lastGCPauseNs].slice(-maxHistoryPoints),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    }
  }, [])

  // Start/stop polling
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Fetch immediately
    fetchMetrics()

    // Start interval
    intervalRef.current = setInterval(fetchMetrics, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [fetchMetrics, isPaused, pollInterval])

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleForceGC = async (): Promise<void> => {
    if (!go?.ForceGC) return
    try {
      await go.ForceGC()
      await fetchMetrics()
    } catch (err) {
      console.error('Failed to trigger GC:', err)
    }
  }

  const handlePollIntervalChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    setPollInterval(Number(e.target.value))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary rounded-lg shadow-xl w-full max-w-lg mx-4 border border-border max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-lg font-medium">Performance</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Pause/Resume button */}
            <button
              className={`p-1.5 rounded transition-colors ${isPaused ? 'bg-accent/20 text-accent' : 'hover:bg-zinc-700 text-zinc-400'}`}
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume polling' : 'Pause polling'}
            >
              {isPaused ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
            {/* Poll interval selector */}
            <select
              className="bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1 border border-zinc-700"
              value={pollInterval}
              onChange={handlePollIntervalChange}
            >
              <option value={500}>500ms</option>
              <option value={1000}>1s</option>
              <option value={1500}>1.5s</option>
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
            </select>
            {/* Close button */}
            <button
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400"
              onClick={onClose}
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {error ? (
            <div className="text-center py-8 text-red-400">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>{error}</p>
            </div>
          ) : !metrics ? (
            <div className="text-center py-8 text-zinc-400">
              <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p>Loading metrics...</p>
            </div>
          ) : (
            <>
              {/* Memory Section */}
              <Section
                title="Memory"
                icon={
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                }
              >
                <MetricRow
                  label="Heap Used"
                  value={formatBytes(metrics.heapAlloc)}
                  subValue={`of ${formatBytes(metrics.heapSys)}`}
                  sparklineData={history.heapAlloc}
                  sparklineColor="#60A5FA"
                />
                <MetricRow
                  label="Heap In Use"
                  value={formatBytes(metrics.heapInuse)}
                />
                <MetricRow
                  label="Stack In Use"
                  value={formatBytes(metrics.stackInuse)}
                />
                <MetricRow
                  label="System Memory"
                  value={formatBytes(metrics.sys)}
                />
                <MetricRow
                  label="Total Allocated"
                  value={formatBytes(metrics.totalAllocated)}
                  subValue="cumulative"
                />
              </Section>

              {/* Runtime Section */}
              <Section
                title="Runtime"
                icon={
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              >
                <MetricRow
                  label="Goroutines"
                  value={metrics.goroutines.toLocaleString()}
                  sparklineData={history.goroutines}
                  sparklineColor="#4CC38A"
                />
                <MetricRow
                  label="GC Cycles"
                  value={metrics.numGC.toLocaleString()}
                />
                <MetricRow
                  label="Last GC Pause"
                  value={formatNanoseconds(metrics.lastGCPauseNs)}
                  sparklineData={history.gcPause}
                  sparklineColor="#F59E0B"
                />
              </Section>

              {/* Connections Section */}
              <Section
                title="Connections"
                icon={
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                }
              >
                <MetricRow
                  label="Active Connections"
                  value={metrics.activeConnections.toString()}
                />
              </Section>

              {/* Uptime Section */}
              <Section
                title="Application"
                icon={
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              >
                <MetricRow
                  label="Uptime"
                  value={formatUptime(metrics.uptimeSeconds)}
                />
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface flex-shrink-0">
          <div className="text-xs text-zinc-500">
            {isPaused ? 'Paused' : `Polling every ${pollInterval / 1000}s`}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost text-zinc-400 text-sm"
              onClick={handleForceGC}
              title="Trigger garbage collection"
            >
              Force GC
            </button>
            <button
              className="btn btn-primary text-sm"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PerformancePanel
