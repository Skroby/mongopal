import { useState, useEffect, type FC, type SVGProps } from 'react'
import { useNotification } from './NotificationContext'

// Type definitions for Wails bindings
interface WailsApp {
  GetCollectionStats?: (connectionId: string, database: string, collection: string) => Promise<CollectionStats>
}

// Access window.go dynamically for testability
const getGo = (): WailsApp | undefined => {
  const win = window as Window & { go?: { main?: { App?: WailsApp } } }
  return win.go?.main?.App
}

export interface CollectionStats {
  namespace: string
  count: number
  size: number
  storageSize: number
  avgObjSize: number
  indexCount: number
  totalIndexSize: number
  capped: boolean
}

export interface CollectionStatsModalProps {
  connectionId: string
  database: string
  collection: string
  onClose: () => void
}

interface IconProps extends SVGProps<SVGSVGElement> {
  className?: string
}

const CopyIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const CheckIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

const CollectionStatsModal: FC<CollectionStatsModalProps> = ({ connectionId, database, collection, onClose }) => {
  const { notify } = useNotification()
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const handleCopy = async (): Promise<void> => {
    if (!stats) return
    const text = `Collection: ${database}.${collection}
Documents: ${formatNumber(stats.count)}
Avg Document Size: ${formatBytes(stats.avgObjSize)}
Data Size: ${formatBytes(stats.size)}
Storage Size: ${formatBytes(stats.storageSize)}
Index Count: ${stats.indexCount}
Total Index Size: ${formatBytes(stats.totalIndexSize)}${stats.capped ? '\nCapped: Yes' : ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      notify.error('Failed to copy to clipboard')
    }
  }

  useEffect(() => {
    loadStats()
  }, [connectionId, database, collection])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const loadStats = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const go = getGo()
      if (go?.GetCollectionStats) {
        const result = await go.GetCollectionStats(connectionId, database, collection)
        setStats(result)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      notify.error(`Failed to load stats: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-border rounded-lg w-[450px] shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-lg font-medium text-zinc-100">Collection Statistics</h2>
          <p className="text-sm text-zinc-400 mt-0.5 font-mono">
            {database}.{collection}
          </p>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button className="mt-3 btn btn-secondary text-sm" onClick={loadStats}>
                Retry
              </button>
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {/* Document stats */}
              <div>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Documents</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Count</div>
                    <div className="text-lg font-medium text-zinc-100">{formatNumber(stats.count)}</div>
                  </div>
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Avg Size</div>
                    <div className="text-lg font-medium text-zinc-100">{formatBytes(stats.avgObjSize)}</div>
                  </div>
                </div>
              </div>

              {/* Storage stats */}
              <div>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Storage</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Data Size</div>
                    <div className="text-lg font-medium text-zinc-100">{formatBytes(stats.size)}</div>
                  </div>
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Storage Size</div>
                    <div className="text-lg font-medium text-zinc-100">{formatBytes(stats.storageSize)}</div>
                  </div>
                </div>
              </div>

              {/* Index stats */}
              <div>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">Indexes</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Index Count</div>
                    <div className="text-lg font-medium text-zinc-100">{stats.indexCount}</div>
                  </div>
                  <div className="bg-zinc-800 rounded px-3 py-2">
                    <div className="text-xs text-zinc-400">Total Index Size</div>
                    <div className="text-lg font-medium text-zinc-100">{formatBytes(stats.totalIndexSize)}</div>
                  </div>
                </div>
              </div>

              {/* Flags */}
              {stats.capped && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/20 border border-blue-800 rounded text-blue-400 text-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  This is a capped collection
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-between">
          {stats && (
            <button
              className={`btn btn-ghost flex items-center gap-1.5 ${copied ? 'text-accent' : ''}`}
              onClick={handleCopy}
            >
              {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Stats'}
            </button>
          )}
          {!stats && <div />}
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CollectionStatsModal
