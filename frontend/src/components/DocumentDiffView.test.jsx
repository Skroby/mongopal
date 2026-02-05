import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocumentDiffView from './DocumentDiffView'

// Track props passed to MonacoDiffEditor
let capturedProps = {}

vi.mock('./MonacoDiffEditor', () => ({
  default: (props) => {
    capturedProps = props
    return (
      <div data-testid="mock-diff-editor">
        <div data-testid="diff-original">{props.original}</div>
        <div data-testid="diff-modified">{props.modified}</div>
      </div>
    )
  },
}))

beforeEach(() => {
  capturedProps = {}
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DocumentDiffView', () => {
  const defaultProps = {
    sourceDocument: { _id: 'doc1', name: 'Original' },
    targetDocument: { _id: 'doc2', name: 'Modified' },
    onClose: vi.fn(),
    onSwap: vi.fn(),
  }

  describe('rendering', () => {
    it('renders the diff editor with source and target documents', () => {
      render(<DocumentDiffView {...defaultProps} />)

      expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument()
      expect(screen.getByTestId('diff-original')).toHaveTextContent('"name": "Original"')
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('"name": "Modified"')
    })

    it('renders header with Document Comparison title', () => {
      render(<DocumentDiffView {...defaultProps} />)

      expect(screen.getByText('Document Comparison')).toBeInTheDocument()
    })

    it('renders swap button', () => {
      render(<DocumentDiffView {...defaultProps} />)

      expect(screen.getByTitle('Swap left and right')).toBeInTheDocument()
    })

    it('renders close button', () => {
      render(<DocumentDiffView {...defaultProps} />)

      expect(screen.getByTitle('Close (Escape)')).toBeInTheDocument()
    })
  })

  describe('configuration', () => {
    it('should use json language for document comparison', () => {
      render(<DocumentDiffView {...defaultProps} />)

      expect(capturedProps.language).toBe('json')
    })
  })

  describe('interactions', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn()
      render(<DocumentDiffView {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTitle('Close (Escape)'))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onSwap when swap button clicked', () => {
      const onSwap = vi.fn()
      render(<DocumentDiffView {...defaultProps} onSwap={onSwap} />)

      fireEvent.click(screen.getByTitle('Swap left and right'))
      expect(onSwap).toHaveBeenCalled()
    })

    it('calls onClose when Escape key pressed', () => {
      const onClose = vi.fn()
      render(<DocumentDiffView {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('document ID formatting', () => {
    it('displays truncated ObjectId correctly', () => {
      render(
        <DocumentDiffView
          {...defaultProps}
          sourceDocument={{ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Test' }}
        />
      )

      // ObjectId gets truncated to first 12 chars + '...' = '507f1f77bcf8...'
      // It appears in multiple places (header + labels)
      const sourceLabels = screen.getAllByText(/507f1f77bcf8\.\.\./)
      expect(sourceLabels.length).toBeGreaterThan(0)
    })

    it('displays Binary ID as Binary(...)', () => {
      render(
        <DocumentDiffView
          {...defaultProps}
          sourceDocument={{ _id: { $binary: { base64: 'dGVzdA==', subType: '03' } }, name: 'Test' }}
        />
      )

      // Binary IDs display as "Binary(...)" - may appear in multiple places (header + labels)
      const binaryLabels = screen.getAllByText('Binary(...)')
      expect(binaryLabels.length).toBeGreaterThan(0)
    })
  })

  describe('property sorting', () => {
    it('sorts object keys alphabetically for consistent comparison', () => {
      // Same document with different key order should produce identical JSON
      const doc1 = { _id: 'doc1', zebra: 1, apple: 2, banana: 3 }
      const doc2 = { _id: 'doc2', apple: 2, banana: 3, zebra: 1 }

      render(
        <DocumentDiffView
          sourceDocument={doc1}
          targetDocument={doc2}
          onClose={vi.fn()}
          onSwap={vi.fn()}
        />
      )

      // Both should have keys in same order: _id, apple, banana, zebra
      const original = capturedProps.original
      const modified = capturedProps.modified

      // Extract key order from JSON
      const originalKeyOrder = original.match(/"(\w+)":/g).map(k => k.replace(/[":]/g, ''))
      const modifiedKeyOrder = modified.match(/"(\w+)":/g).map(k => k.replace(/[":]/g, ''))

      expect(originalKeyOrder).toEqual(['_id', 'apple', 'banana', 'zebra'])
      expect(modifiedKeyOrder).toEqual(['_id', 'apple', 'banana', 'zebra'])
    })

    it('keeps _id as first property', () => {
      const doc = { zebra: 1, _id: 'doc1', apple: 2 }

      render(
        <DocumentDiffView
          sourceDocument={doc}
          targetDocument={doc}
          onClose={vi.fn()}
          onSwap={vi.fn()}
        />
      )

      const original = capturedProps.original
      const firstKey = original.match(/"(\w+)":/)[1]
      expect(firstKey).toBe('_id')
    })

    it('sorts nested object keys', () => {
      const doc = {
        _id: 'doc1',
        nested: { zebra: 1, apple: 2 },
      }

      render(
        <DocumentDiffView
          sourceDocument={doc}
          targetDocument={doc}
          onClose={vi.fn()}
          onSwap={vi.fn()}
        />
      )

      const original = capturedProps.original
      // nested object should have apple before zebra
      expect(original.indexOf('"apple"')).toBeLessThan(original.indexOf('"zebra"'))
    })
  })
})
