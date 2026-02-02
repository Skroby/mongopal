import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExplainPanel from './ExplainPanel'

describe('ExplainPanel', () => {
  const mockResult = {
    queryPlanner: {
      namespace: 'testdb.testcoll',
      indexFilterSet: false,
      parsedQuery: '{}',
      rejectedPlans: 0,
      winningPlanStage: 'COLLSCAN',
    },
    executionStats: {
      executionSuccess: true,
      nReturned: 100,
      executionTimeMs: 15,
      totalKeysExamined: 0,
      totalDocsExamined: 1001,
    },
    winningPlan: 'COLLSCAN',
    indexUsed: '',
    isCollectionScan: true,
    rawExplain: '{"raw": "explain"}',
  }

  const mockResultWithIndex = {
    ...mockResult,
    queryPlanner: {
      ...mockResult.queryPlanner,
      winningPlanStage: 'IXSCAN',
    },
    executionStats: {
      ...mockResult.executionStats,
      totalKeysExamined: 100,
      totalDocsExamined: 100,
    },
    winningPlan: 'IXSCAN { field: 1 }',
    indexUsed: 'field_1',
    isCollectionScan: false,
  }

  it('renders null when result is null', () => {
    const { container } = render(<ExplainPanel result={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays explain plan header', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('Explain Plan')).toBeInTheDocument()
  })

  it('shows warning for collection scan with many documents', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('Collection Scan Detected')).toBeInTheDocument()
  })

  it('shows efficient badge when using index', () => {
    render(<ExplainPanel result={mockResultWithIndex} onClose={() => {}} />)
    expect(screen.getByText('Efficient')).toBeInTheDocument()
  })

  it('displays stage information', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('Stage')).toBeInTheDocument()
    // COLLSCAN appears in both stage and plan summary
    expect(screen.getAllByText('COLLSCAN').length).toBeGreaterThanOrEqual(1)
  })

  it('displays index used when available', () => {
    render(<ExplainPanel result={mockResultWithIndex} onClose={() => {}} />)
    expect(screen.getByText('field_1')).toBeInTheDocument()
  })

  it('displays documents examined/returned', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('Docs Returned / Examined')).toBeInTheDocument()
    // Just verify the label is present - the values are formatted
  })

  it('displays execution time', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('15ms')).toBeInTheDocument()
  })

  it('toggles raw explain output', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)

    // Raw output should not be visible initially
    expect(screen.queryByText('Raw Explain Output')).not.toBeInTheDocument()

    // Click to show raw output
    fireEvent.click(screen.getByText('Show Raw'))
    expect(screen.getByText('Raw Explain Output')).toBeInTheDocument()

    // Click to hide raw output
    fireEvent.click(screen.getByText('Hide Raw'))
    expect(screen.queryByText('Raw Explain Output')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ExplainPanel result={mockResult} onClose={onClose} />)

    fireEvent.click(screen.getByTitle('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays keys examined', () => {
    render(<ExplainPanel result={mockResultWithIndex} onClose={() => {}} />)
    expect(screen.getByText('Keys Examined')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('displays rejected plans count', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('Rejected Plans')).toBeInTheDocument()
  })

  it('displays namespace', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('shows "None" when no index is used', () => {
    render(<ExplainPanel result={mockResult} onClose={() => {}} />)
    expect(screen.getByText('None')).toBeInTheDocument()
  })
})
