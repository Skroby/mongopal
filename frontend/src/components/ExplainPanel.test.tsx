import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExplainPanel, { type ExplainResult } from './ExplainPanel'

describe('ExplainPanel', () => {
  const mockResult: ExplainResult = {
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

  const mockResultWithIndex: ExplainResult = {
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

  it('shows placeholder when result is null', () => {
    render(<ExplainPanel result={null} />)
    expect(screen.getByText('Click the Explain tab to analyze the current query')).toBeInTheDocument()
  })

  it('shows loading state when explaining', () => {
    render(<ExplainPanel result={null} explaining />)
    expect(screen.getByText('Analyzing query plan...')).toBeInTheDocument()
  })

  it('shows warning for collection scan with many documents', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('Collection Scan Detected')).toBeInTheDocument()
  })

  it('shows efficient badge when using index', () => {
    render(<ExplainPanel result={mockResultWithIndex} />)
    expect(screen.getByText('Efficient Query')).toBeInTheDocument()
  })

  it('displays stage information', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('Stage')).toBeInTheDocument()
    expect(screen.getAllByText('COLLSCAN').length).toBeGreaterThanOrEqual(1)
  })

  it('displays index used when available', () => {
    render(<ExplainPanel result={mockResultWithIndex} />)
    expect(screen.getByText('field_1')).toBeInTheDocument()
  })

  it('displays documents examined/returned', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('Docs Returned / Examined')).toBeInTheDocument()
  })

  it('displays execution time', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('15ms')).toBeInTheDocument()
  })

  it('toggles raw explain output', () => {
    render(<ExplainPanel result={mockResult} />)

    // Raw output should not be visible initially
    expect(screen.queryByText('Show Raw Output')).toBeInTheDocument()

    // Click to show raw output
    fireEvent.click(screen.getByText('Show Raw Output'))
    expect(screen.getByText('Hide Raw Output')).toBeInTheDocument()

    // Click to hide raw output
    fireEvent.click(screen.getByText('Hide Raw Output'))
    expect(screen.getByText('Show Raw Output')).toBeInTheDocument()
  })

  it('displays keys examined', () => {
    render(<ExplainPanel result={mockResultWithIndex} />)
    expect(screen.getByText('Keys Examined')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('displays rejected plans count', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('Rejected Plans')).toBeInTheDocument()
  })

  it('displays namespace', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('testdb.testcoll')).toBeInTheDocument()
  })

  it('shows "None" when no index is used', () => {
    render(<ExplainPanel result={mockResult} />)
    expect(screen.getByText('None')).toBeInTheDocument()
  })
})
