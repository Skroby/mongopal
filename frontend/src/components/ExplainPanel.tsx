import { useState, type FC, type SVGProps } from 'react'

// Icons
interface IconProps extends SVGProps<SVGSVGElement> {
  className?: string
}

const WarningIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

const CheckIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ChevronDownIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

const ChevronUpIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
)

const CloseIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const CopyIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const CopyCheckIcon: FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

export interface QueryPlanner {
  namespace: string
  indexFilterSet: boolean
  parsedQuery: string
  rejectedPlans: number
  winningPlanStage: string
}

export interface ExecutionStats {
  executionSuccess: boolean
  nReturned: number
  executionTimeMs: number
  totalKeysExamined: number
  totalDocsExamined: number
}

export interface ExplainResult {
  queryPlanner: QueryPlanner
  executionStats: ExecutionStats
  winningPlan: string
  indexUsed: string
  isCollectionScan: boolean
  rawExplain: string
}

export interface ExplainPanelProps {
  result: ExplainResult | null
  onClose: () => void
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

const ExplainPanel: FC<ExplainPanelProps> = ({ result, onClose }) => {
  const [showRaw, setShowRaw] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  const handleCopyRaw = async (): Promise<void> => {
    if (!result?.rawExplain) return
    try {
      await navigator.clipboard.writeText(result.rawExplain)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (!result) return null

  const { queryPlanner, executionStats, winningPlan, indexUsed, isCollectionScan, rawExplain } = result

  // Calculate efficiency ratio
  const docsExamined = executionStats.totalDocsExamined
  const docsReturned = executionStats.nReturned
  const efficiency = docsExamined > 0 ? ((docsReturned / docsExamined) * 100).toFixed(1) : '100'

  // Determine if this is a good or bad query plan
  const isEfficient = !isCollectionScan && parseFloat(efficiency) >= 50
  const hasWarning = isCollectionScan && docsExamined > 1000

  return (
    <div className="border-t border-border bg-surface-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-100">Explain Plan</span>
          {isEfficient ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckIcon className="w-3.5 h-3.5" />
              Efficient
            </span>
          ) : hasWarning ? (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <WarningIcon className="w-3.5 h-3.5" />
              Collection Scan
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
            onClick={() => setShowRaw(!showRaw)}
          >
            {showRaw ? (
              <>
                <ChevronUpIcon className="w-3 h-3" />
                Hide Raw
              </>
            ) : (
              <>
                <ChevronDownIcon className="w-3 h-3" />
                Show Raw
              </>
            )}
          </button>
          <button
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {/* Warning for collection scan */}
        {hasWarning && (
          <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-800 rounded text-amber-400 text-xs flex items-start gap-2">
            <WarningIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Collection Scan Detected</p>
              <p className="mt-1 text-amber-400/80">
                This query examined {formatNumber(docsExamined)} documents without using an index.
                Consider adding an index to improve performance.
              </p>
            </div>
          </div>
        )}

        {/* Stats grid - 2 column layout with wrapping values */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-3">
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Stage</div>
            <div className={`text-sm font-mono ${isCollectionScan ? 'text-amber-400' : 'text-green-400'}`}>
              {queryPlanner.winningPlanStage}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Index Used</div>
            <div className={`text-sm font-mono break-words ${indexUsed ? 'text-green-400' : 'text-zinc-400'}`}>
              {indexUsed || 'None'}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Docs Returned / Examined</div>
            <div className="text-sm font-mono text-zinc-200">
              {formatNumber(docsReturned)} / {formatNumber(docsExamined)}
              <span className={`ml-2 text-xs ${parseFloat(efficiency) >= 50 ? 'text-green-400' : 'text-amber-400'}`}>
                ({efficiency}%)
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Execution Time</div>
            <div className="text-sm font-mono text-zinc-200">
              {executionStats.executionTimeMs}ms
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Keys Examined</div>
            <div className="text-sm font-mono text-zinc-200">
              {formatNumber(executionStats.totalKeysExamined)}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Rejected Plans</div>
            <div className="text-sm font-mono text-zinc-200">
              {queryPlanner.rejectedPlans}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Namespace</div>
            <div className="text-sm font-mono text-zinc-200 break-words">
              {queryPlanner.namespace}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-0.5">Plan Summary</div>
            <div className="text-sm font-mono text-zinc-200 break-words">
              {winningPlan}
            </div>
          </div>
        </div>

        {/* Raw explain output */}
        {showRaw && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400">Raw Explain Output</span>
              <button
                className={`p-1 rounded hover:bg-zinc-700 ${copied ? 'text-accent' : 'text-zinc-400 hover:text-zinc-200'}`}
                onClick={handleCopyRaw}
                title={copied ? 'Copied!' : 'Copy raw output'}
              >
                {copied ? <CopyCheckIcon className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
              </button>
            </div>
            <pre className="p-2 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-300 overflow-auto max-h-64">
              {rawExplain}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExplainPanel
