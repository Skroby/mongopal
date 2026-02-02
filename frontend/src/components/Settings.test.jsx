import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Settings, { loadSettings, saveSettings } from './Settings'

describe('Settings', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('loadSettings', () => {
    it('returns default settings when localStorage is empty', () => {
      const settings = loadSettings()

      expect(settings).toEqual({
        queryLimit: 50,
        autoFormat: true,
        confirmDelete: true,
        wordWrap: true,
        showLineNumbers: true,
        freezeIdColumn: false,
      })
    })

    it('returns saved settings from localStorage', () => {
      localStorage.setItem('mongopal-settings', JSON.stringify({
        queryLimit: 100,
        autoFormat: false,
      }))

      const settings = loadSettings()

      expect(settings.queryLimit).toBe(100)
      expect(settings.autoFormat).toBe(false)
      // Defaults for missing values
      expect(settings.confirmDelete).toBe(true)
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('mongopal-settings', 'invalid json')

      const settings = loadSettings()

      expect(settings).toEqual({
        queryLimit: 50,
        autoFormat: true,
        confirmDelete: true,
        wordWrap: true,
        showLineNumbers: true,
        freezeIdColumn: false,
      })
    })
  })

  describe('saveSettings', () => {
    it('saves settings to localStorage', () => {
      saveSettings({ queryLimit: 200, autoFormat: false })

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.queryLimit).toBe(200)
      expect(saved.autoFormat).toBe(false)
    })
  })

  describe('rendering', () => {
    it('renders settings dialog', () => {
      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('renders query limit dropdown with default value', () => {
      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByText('Default query limit')).toBeInTheDocument()
      const select = screen.getByRole('combobox')
      expect(select).toHaveValue('50')
    })

    it('renders all toggle options', () => {
      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByText('Auto-format JSON')).toBeInTheDocument()
      expect(screen.getByText('Confirm before delete')).toBeInTheDocument()
      expect(screen.getByText('Word wrap in editor')).toBeInTheDocument()
      expect(screen.getByText('Show line numbers')).toBeInTheDocument()
    })

    it('renders reset button', () => {
      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByText('Reset to defaults')).toBeInTheDocument()
    })

    it('renders done button', () => {
      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByText('Done')).toBeInTheDocument()
    })
  })

  describe('query limit', () => {
    it('changes query limit and persists to localStorage', () => {
      render(<Settings onClose={mockOnClose} />)

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '100' } })

      expect(select).toHaveValue('100')

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.queryLimit).toBe(100)
    })

    it('shows all query limit options', () => {
      render(<Settings onClose={mockOnClose} />)

      const options = screen.getAllByRole('option')
      const values = options.map(o => o.value)

      expect(values).toContain('10')
      expect(values).toContain('25')
      expect(values).toContain('50')
      expect(values).toContain('100')
      expect(values).toContain('200')
      expect(values).toContain('500')
    })
  })

  describe('toggle options', () => {
    // Order: freezeIdColumn[0], autoFormat[1], wordWrap[2], showLineNumbers[3], confirmDelete[4]
    it('toggles autoFormat and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      const autoFormatCheckbox = checkboxes[1] // autoFormat is now index 1

      expect(autoFormatCheckbox).toBeChecked()

      fireEvent.click(autoFormatCheckbox)

      expect(autoFormatCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.autoFormat).toBe(false)
    })

    it('toggles wordWrap and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      // Order: freezeIdColumn[0], autoFormat[1], wordWrap[2], showLineNumbers[3], confirmDelete[4]
      const wordWrapCheckbox = checkboxes[2]

      expect(wordWrapCheckbox).toBeChecked()

      fireEvent.click(wordWrapCheckbox)

      expect(wordWrapCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.wordWrap).toBe(false)
    })

    it('toggles showLineNumbers and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      // Order: freezeIdColumn[0], autoFormat[1], wordWrap[2], showLineNumbers[3], confirmDelete[4]
      const showLineNumbersCheckbox = checkboxes[3]

      expect(showLineNumbersCheckbox).toBeChecked()

      fireEvent.click(showLineNumbersCheckbox)

      expect(showLineNumbersCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.showLineNumbers).toBe(false)
    })

    it('toggles confirmDelete and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      // Order: freezeIdColumn[0], autoFormat[1], wordWrap[2], showLineNumbers[3], confirmDelete[4]
      const confirmDeleteCheckbox = checkboxes[4]

      expect(confirmDeleteCheckbox).toBeChecked()

      fireEvent.click(confirmDeleteCheckbox)

      expect(confirmDeleteCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.confirmDelete).toBe(false)
    })
  })

  describe('reset to defaults', () => {
    it('resets all settings to default values', () => {
      // First change some settings
      localStorage.setItem('mongopal-settings', JSON.stringify({
        queryLimit: 200,
        autoFormat: false,
        confirmDelete: false,
        wordWrap: false,
        showLineNumbers: false,
      }))

      render(<Settings onClose={mockOnClose} />)

      // Verify settings are loaded
      expect(screen.getByRole('combobox')).toHaveValue('200')

      // Click reset
      fireEvent.click(screen.getByText('Reset to defaults'))

      // Verify reset
      expect(screen.getByRole('combobox')).toHaveValue('50')
      const checkboxes = screen.getAllByRole('checkbox')
      // freezeIdColumn[0] defaults to false, rest default to true
      expect(checkboxes[0]).not.toBeChecked() // freezeIdColumn
      expect(checkboxes[1]).toBeChecked() // autoFormat
      expect(checkboxes[2]).toBeChecked() // wordWrap
      expect(checkboxes[3]).toBeChecked() // showLineNumbers
      expect(checkboxes[4]).toBeChecked() // confirmDelete

      // Verify persisted
      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.queryLimit).toBe(50)
      expect(saved.autoFormat).toBe(true)
    })
  })

  describe('close button', () => {
    it('calls onClose when Done button is clicked', () => {
      render(<Settings onClose={mockOnClose} />)

      fireEvent.click(screen.getByText('Done'))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when close icon is clicked', () => {
      render(<Settings onClose={mockOnClose} />)

      // Find close button by its position (in header)
      // The header structure is: div.header > div.titleWrapper > h2 + savedIndicator
      //                                      > button.closeButton
      const header = screen.getByText('Settings').closest('div').parentElement
      const closeBtn = header.querySelector('button')

      fireEvent.click(closeBtn)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('loading saved settings', () => {
    it('loads saved settings on render', () => {
      localStorage.setItem('mongopal-settings', JSON.stringify({
        queryLimit: 100,
        autoFormat: false,
        confirmDelete: true,
        wordWrap: false,
        showLineNumbers: true,
      }))

      render(<Settings onClose={mockOnClose} />)

      expect(screen.getByRole('combobox')).toHaveValue('100')

      // New order: freezeIdColumn[0], autoFormat[1], wordWrap[2], showLineNumbers[3], confirmDelete[4]
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).not.toBeChecked() // freezeIdColumn (default false)
      expect(checkboxes[1]).not.toBeChecked() // autoFormat
      expect(checkboxes[2]).not.toBeChecked() // wordWrap
      expect(checkboxes[3]).toBeChecked() // showLineNumbers
      expect(checkboxes[4]).toBeChecked() // confirmDelete
    })
  })

  describe('save confirmation feedback', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterAll(() => {
      vi.useRealTimers()
    })

    it('shows saved indicator when a setting changes', () => {
      render(<Settings onClose={mockOnClose} />)

      // Initially, saved indicator should be hidden (opacity-0)
      const savedIndicator = screen.getByText('Saved').parentElement
      expect(savedIndicator).toHaveClass('opacity-0')

      // Change a setting
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0])

      // Now saved indicator should be visible (opacity-100)
      expect(savedIndicator).toHaveClass('opacity-100')
    })

    it('hides saved indicator after timeout', () => {
      render(<Settings onClose={mockOnClose} />)

      const savedIndicator = screen.getByText('Saved').parentElement

      // Change a setting
      fireEvent.click(screen.getAllByRole('checkbox')[0])
      expect(savedIndicator).toHaveClass('opacity-100')

      // Fast-forward time - wrap in act() since it triggers state change
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Should be hidden again
      expect(savedIndicator).toHaveClass('opacity-0')
    })

    it('shows saved indicator when reset to defaults is clicked', () => {
      render(<Settings onClose={mockOnClose} />)

      const savedIndicator = screen.getByText('Saved').parentElement
      expect(savedIndicator).toHaveClass('opacity-0')

      fireEvent.click(screen.getByText('Reset to defaults'))

      expect(savedIndicator).toHaveClass('opacity-100')
    })

    it('resets timeout when multiple changes occur', () => {
      render(<Settings onClose={mockOnClose} />)

      const savedIndicator = screen.getByText('Saved').parentElement
      const checkboxes = screen.getAllByRole('checkbox')

      // First change
      fireEvent.click(checkboxes[0])
      expect(savedIndicator).toHaveClass('opacity-100')

      // Wait 1000ms (less than timeout) - wrap in act() since timers may trigger state
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(savedIndicator).toHaveClass('opacity-100')

      // Second change resets the timer
      fireEvent.click(checkboxes[1])
      expect(savedIndicator).toHaveClass('opacity-100')

      // Wait another 1000ms (still less than 1500ms from second change)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(savedIndicator).toHaveClass('opacity-100')

      // Wait remaining time
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(savedIndicator).toHaveClass('opacity-0')
    })
  })
})
