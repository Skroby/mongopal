import { useState, useEffect, useCallback, type FC } from 'react'
import { useNotification } from './NotificationContext'
import type { ServerInfo } from '../types/wails.d'

interface WailsApp {
  GetServerInfo?: (connectionId: string) => Promise<ServerInfo>
}

const getGo = (): WailsApp | undefined => {
  const win = window as Window & { go?: { main?: { App?: WailsApp } } }
  return win.go?.main?.App
}

export interface ServerInfoModalProps {
  connectionId: string
  connectionName: string
  onClose: () => void
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

// Badge component for topology/state labels
function Badge({ children, color = 'default' }: { children: React.ReactNode; color?: 'default' | 'green' | 'blue' | 'yellow' | 'red' }) {
  const colorClasses = {
    default: 'bg-surface-hover text-text-secondary',
    green: 'bg-success-dark text-success',
    blue: 'bg-info-dark text-info',
    yellow: 'bg-warning-dark text-warning',
    red: 'bg-error-dark text-error',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${colorClasses[color]}`}>
      {children}
    </span>
  )
}

function getStateBadgeColor(state: string): 'green' | 'blue' | 'yellow' | 'red' | 'default' {
  const s = state.toUpperCase()
  if (s === 'PRIMARY') return 'green'
  if (s === 'SECONDARY') return 'blue'
  if (s === 'ARBITER') return 'yellow'
  if (s.includes('DOWN') || s.includes('ERROR')) return 'red'
  return 'default'
}

// Section with a header and content area
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-lg border border-border/50 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/50">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">{title}</h3>
      </div>
      <div className="py-1">{children}</div>
    </section>
  )
}

// Key-value table (clean rows)
function KVTable({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border/20">{children}</div>
}

// Single key-value row
function KVRow({ label, value, mono, children, fallback }: {
  label: string
  value?: string
  mono?: boolean
  children?: React.ReactNode
  fallback?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`text-text ${mono ? 'font-mono text-xs' : ''}`}>
        {children || value || fallback || '-'}
      </span>
    </div>
  )
}

// Compact stat cell (label above value, for grids)
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-text-muted text-xs">{label}</span>
      <span className="text-text font-medium tabular-nums">{value}</span>
    </div>
  )
}

// Collapsible JSON tree view
function JsonTreeView({ data, searchQuery }: { data: Record<string, unknown>; searchQuery: string }) {
  return (
    <div className="font-mono text-xs">
      <JsonNode value={data} path="" depth={0} searchQuery={searchQuery} defaultExpanded={false} />
    </div>
  )
}

function matchesSearch(key: string, searchQuery: string): boolean {
  if (!searchQuery) return false
  return key.toLowerCase().includes(searchQuery.toLowerCase())
}

function subtreeMatchesSearch(value: unknown, searchQuery: string): boolean {
  if (!searchQuery) return true
  if (typeof value !== 'object' || value === null) return false
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (matchesSearch(key, searchQuery)) return true
    if (subtreeMatchesSearch((value as Record<string, unknown>)[key], searchQuery)) return true
  }
  return false
}

function JsonNode({
  value,
  path,
  depth,
  searchQuery,
  defaultExpanded,
  keyName,
}: {
  value: unknown
  path: string
  depth: number
  searchQuery: string
  defaultExpanded: boolean
  keyName?: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { notify } = useNotification()

  // Auto-expand when search matches a key within this subtree
  useEffect(() => {
    if (searchQuery && subtreeMatchesSearch(value, searchQuery)) {
      setExpanded(true)
    }
  }, [searchQuery, value])

  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)
  const isArray = Array.isArray(value)
  const isExpandable = isObject || isArray

  if (!isExpandable) {
    // Primitive value
    const isHighlighted = keyName && matchesSearch(keyName, searchQuery)
    return (
      <div className="flex items-baseline gap-1 py-0.5 hover:bg-surface-hover/50 rounded px-1 group">
        {keyName !== undefined && (
          <span className={`${isHighlighted ? 'bg-warning-dark text-warning rounded px-0.5' : 'text-text-secondary'}`}>
            {keyName}:
          </span>
        )}
        <span
          className={`cursor-pointer hover:underline ${
            typeof value === 'string' ? 'text-success' :
            typeof value === 'number' ? 'text-info' :
            typeof value === 'boolean' ? 'text-warning' :
            'text-text-muted'
          }`}
          title="Click to copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(String(value))
              notify.success('Copied to clipboard')
            } catch {
              // ignore
            }
          }}
        >
          {typeof value === 'string' ? `"${value}"` : String(value ?? 'null')}
        </span>
      </div>
    )
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  const filteredEntries = searchQuery
    ? entries.filter(([k, v]) => matchesSearch(k, searchQuery) || subtreeMatchesSearch(v, searchQuery))
    : entries

  const count = entries.length
  const bracket = isArray ? ['[', ']'] : ['{', '}']
  const isHighlighted = keyName && matchesSearch(keyName, searchQuery)

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-surface-hover/50 rounded px-1"
        onClick={() => setExpanded(e => !e)}
      >
        <svg
          className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {keyName !== undefined && (
          <span className={`${isHighlighted ? 'bg-warning-dark text-warning rounded px-0.5' : 'text-text-secondary'}`}>
            {keyName}:
          </span>
        )}
        <span className="text-text-dim">
          {bracket[0]}
          {!expanded && <span className="text-text-muted"> ... {count} {isArray ? 'items' : 'keys'} </span>}
          {!expanded && bracket[1]}
        </span>
      </div>
      {expanded && (
        <div className="ml-4 border-l border-border/50 pl-1">
          {filteredEntries.map(([k, v]) => (
            <JsonNode
              key={path + '.' + k}
              keyName={k}
              value={v}
              path={path + '.' + k}
              depth={depth + 1}
              searchQuery={searchQuery}
              defaultExpanded={false}
            />
          ))}
          <div className="text-text-dim px-1">{bracket[1]}</div>
        </div>
      )}
    </div>
  )
}

const ServerInfoModal: FC<ServerInfoModalProps> = ({ connectionId, connectionName, onClose }) => {
  const { notify } = useNotification()
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'raw'>('summary')
  const [rawSource, setRawSource] = useState<'serverStatus' | 'replSetGetStatus'>('serverStatus')
  const [treeSearch, setTreeSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const loadInfo = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const go = getGo()
      if (go?.GetServerInfo) {
        const result = await go.GetServerInfo(connectionId)
        setInfo(result)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleCopySummary = async (): Promise<void> => {
    if (!info) return
    const lines: string[] = [
      `Server: ${connectionName}`,
      `Version: ${info.serverVersion}`,
      `FCV: ${info.fcv || 'N/A'}`,
      `Topology: ${info.topology}`,
    ]
    if (info.status?.storageEngine) lines.push(`Storage Engine: ${info.status.storageEngine}`)
    if (info.host) {
      lines.push(`Host: ${info.host.hostname}`)
      lines.push(`OS: ${info.host.os} (${info.host.arch})`)
      lines.push(`CPUs: ${info.host.cpus}, Memory: ${(info.host.memoryMB / 1024).toFixed(1)} GB`)
    }
    if (info.status) {
      lines.push(`Uptime: ${formatUptime(info.status.uptime)}`)
      lines.push(`Connections: ${info.status.connsCurrent} current, ${info.status.connsAvailable} available`)
      lines.push(`Memory: ${info.status.memResident} MB resident, ${info.status.memVirtual} MB virtual`)
    }
    if (info.replicaSet) {
      lines.push(`Replica Set: ${info.replicaSet.name} (${info.replicaSet.members.length} members)`)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      notify.error('Failed to copy to clipboard')
    }
  }

  const rawData = rawSource === 'serverStatus' ? info?.rawServerStatus : info?.rawReplStatus
  let parsedRawData: Record<string, unknown> | null = null
  if (rawData) {
    try {
      parsedRawData = JSON.parse(rawData)
    } catch {
      // ignore parse errors
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-secondary text-text border border-border rounded-lg w-full max-w-3xl max-h-[85vh] shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-medium text-text">Server Info</h2>
          <p className="text-sm text-text-muted mt-0.5">{connectionName}</p>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-2 border-b border-border flex gap-4 flex-shrink-0">
          <button
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'raw' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => setActiveTab('raw')}
          >
            Raw
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-error text-sm">{error}</p>
              <button className="mt-3 btn btn-secondary text-sm" onClick={loadInfo}>
                Retry
              </button>
            </div>
          ) : info && activeTab === 'summary' ? (
            <div className="space-y-5">
              {/* Server section */}
              <Section title="Server">
                <KVTable>
                  <KVRow label="Version" value={info.serverVersion} />
                  <KVRow label="FCV" value={info.fcv || undefined} fallback={
                    info.fcvError
                      ? <span className="text-warning" title={info.fcvError}>Unavailable</span>
                      : undefined
                  } />
                  <KVRow label="Topology">
                    <Badge color={
                      info.topology === 'replicaset' ? 'blue' :
                      info.topology === 'sharded' ? 'yellow' : 'default'
                    }>
                      {info.topology}
                    </Badge>
                  </KVRow>
                  {info.status?.storageEngine && <KVRow label="Storage Engine" value={info.status.storageEngine} />}
                  {info.modules.length > 0 && <KVRow label="Modules" value={info.modules.join(', ')} />}
                  {info.gitVersion && <KVRow label="Git Version" value={info.gitVersion} mono />}
                  {info.readOnly && <KVRow label="Read-Only"><span className="text-warning">Yes</span></KVRow>}
                </KVTable>
              </Section>

              {/* Host section */}
              {info.host ? (
                <Section title="Host">
                  <KVTable>
                    <KVRow label="Hostname" value={info.host.hostname} />
                    <KVRow label="OS" value={info.host.os} />
                    {info.host.arch && <KVRow label="Architecture" value={info.host.arch} />}
                    <KVRow label="CPUs" value={String(info.host.cpus)} />
                    <KVRow label="Memory" value={`${(info.host.memoryMB / 1024).toFixed(1)} GB`} />
                  </KVTable>
                </Section>
              ) : info.errors?.['hostInfo'] ? (
                <Section title="Host">
                  <p className="text-sm text-text-muted italic px-3 py-2">Insufficient privileges</p>
                </Section>
              ) : null}

              {/* Connections & Operations section */}
              {info.status ? (
                <Section title="Status">
                  <KVTable>
                    <KVRow label="Uptime" value={formatUptime(info.status.uptime)} />
                  </KVTable>

                  {/* Connections as compact 2x2 */}
                  <div className="mt-3 mb-1 px-3">
                    <div className="text-xs text-text-muted font-medium mb-1.5">Connections</div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      <StatCell label="Current" value={formatNumber(info.status.connsCurrent)} />
                      <StatCell label="Available" value={formatNumber(info.status.connsAvailable)} />
                      <StatCell label="Active" value={formatNumber(info.status.connsActive)} />
                      <StatCell label="Total Created" value={formatNumber(info.status.connsTotalCreated)} />
                    </div>
                  </div>

                  {/* Opcounters as a compact inline grid */}
                  <div className="mt-3 mb-1 px-3">
                    <div className="text-xs text-text-muted font-medium mb-1.5">Operations</div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      <StatCell label="Query" value={formatNumber(info.status.opsQuery)} />
                      <StatCell label="Insert" value={formatNumber(info.status.opsInsert)} />
                      <StatCell label="Update" value={formatNumber(info.status.opsUpdate)} />
                      <StatCell label="Delete" value={formatNumber(info.status.opsDelete)} />
                      <StatCell label="Getmore" value={formatNumber(info.status.opsGetmore)} />
                      <StatCell label="Command" value={formatNumber(info.status.opsCommand)} />
                    </div>
                  </div>

                  {/* Memory */}
                  <div className="mt-3 mb-1 px-3">
                    <div className="text-xs text-text-muted font-medium mb-1.5">Memory</div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      <StatCell label="Resident" value={`${formatNumber(info.status.memResident)} MB`} />
                      <StatCell label="Virtual" value={`${formatNumber(info.status.memVirtual)} MB`} />
                    </div>
                  </div>

                  {/* Network */}
                  <div className="mt-3 px-3">
                    <div className="text-xs text-text-muted font-medium mb-1.5">Network</div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      <StatCell label="In" value={formatBytes(info.status.networkBytesIn)} />
                      <StatCell label="Out" value={formatBytes(info.status.networkBytesOut)} />
                      <StatCell label="Requests" value={formatNumber(info.status.networkRequests)} />
                    </div>
                  </div>
                </Section>
              ) : info.errors?.['serverStatus'] ? (
                <Section title="Status">
                  <p className="text-sm text-text-muted italic px-3 py-2">Insufficient privileges</p>
                </Section>
              ) : null}

              {/* Replica Set section */}
              {info.replicaSet ? (
                <Section title={`Replica Set \u00b7 ${info.replicaSet.name}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">Member</th>
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">State</th>
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">Health</th>
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">Uptime</th>
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">Optime</th>
                          <th className="text-left text-xs font-medium text-text-muted py-1.5 px-3">Sync Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.replicaSet.members.map(member => (
                          <tr
                            key={member.id}
                            className={`border-b border-border/30 ${member.self ? 'bg-primary/5' : ''}`}
                          >
                            <td className="py-1.5 px-3 font-mono text-text text-xs">
                              {member.name}
                              {member.self && <span className="ml-1 text-primary">(self)</span>}
                            </td>
                            <td className="py-1.5 px-3">
                              <Badge color={getStateBadgeColor(member.stateStr)}>{member.stateStr}</Badge>
                            </td>
                            <td className="py-1.5 px-3">
                              {member.health === 1
                                ? <span className="text-success text-xs">OK</span>
                                : <span className="text-error text-xs">DOWN</span>
                              }
                            </td>
                            <td className="py-1.5 px-3 text-text-secondary text-xs">{formatUptime(member.uptime)}</td>
                            <td className="py-1.5 px-3 text-text-secondary text-xs font-mono">
                              {member.optimeDate ? new Date(member.optimeDate).toLocaleString() : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-text-secondary font-mono text-xs">{member.syncSource || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              ) : info.topology === 'replicaset' && info.errors?.['replSetGetStatus'] ? (
                <Section title="Replica Set">
                  <p className="text-sm text-text-muted italic px-3 py-2">Insufficient privileges</p>
                </Section>
              ) : null}

              {/* Error summary — only if errors exist */}
              {info.errors && Object.keys(info.errors).length > 0 && (
                <Section title="Errors">
                  <div className="space-y-0.5 px-3 py-1">
                    {Object.entries(info.errors).map(([cmd, errMsg]) => (
                      <div key={cmd} className="text-xs flex gap-2">
                        <span className="font-mono text-text-secondary shrink-0 w-36">{cmd}</span>
                        <span className="text-error truncate" title={errMsg}>{errMsg}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          ) : info && activeTab === 'raw' ? (
            <div className="space-y-3">
              {/* Source selector */}
              <div className="flex items-center gap-3">
                <select
                  className="bg-surface border border-border rounded px-2 py-1 text-sm text-text focus:outline-none focus:border-primary"
                  value={rawSource}
                  onChange={e => {
                    setRawSource(e.target.value as 'serverStatus' | 'replSetGetStatus')
                    setTreeSearch('')
                  }}
                >
                  <option value="serverStatus">serverStatus</option>
                  {info.rawReplStatus && <option value="replSetGetStatus">replSetGetStatus</option>}
                </select>
                <input
                  type="text"
                  className="flex-1 bg-surface border border-border rounded px-2 py-1 text-sm text-text placeholder-text-dim focus:outline-none focus:border-primary"
                  placeholder="Search keys..."
                  value={treeSearch}
                  onChange={e => setTreeSearch(e.target.value)}
                />
              </div>

              {/* Tree view */}
              <div className="bg-surface rounded border border-border p-3 overflow-auto max-h-[55vh]">
                {parsedRawData ? (
                  <JsonTreeView data={parsedRawData} searchQuery={treeSearch} />
                ) : (
                  <p className="text-text-muted text-sm italic">
                    {rawSource === 'replSetGetStatus' && !info.rawReplStatus
                      ? 'Replica set status not available'
                      : 'No data available'}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {info && (
              <button
                className={`btn btn-ghost flex items-center gap-1.5 ${copied ? 'text-primary' : ''}`}
                onClick={handleCopySummary}
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {copied ? 'Copied!' : 'Copy Summary'}
              </button>
            )}
            {info && (
              <button className="btn btn-ghost flex items-center gap-1.5" onClick={loadInfo}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            )}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ServerInfoModal
