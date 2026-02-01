import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
    it('toggles autoFormat and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      const autoFormatCheckbox = checkboxes[0] // First checkbox is autoFormat

      expect(autoFormatCheckbox).toBeChecked()

      fireEvent.click(autoFormatCheckbox)

      expect(autoFormatCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.autoFormat).toBe(false)
    })

    it('toggles confirmDelete and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
      const confirmDeleteCheckbox = checkboxes[1]

      expect(confirmDeleteCheckbox).toBeChecked()

      fireEvent.click(confirmDeleteCheckbox)

      expect(confirmDeleteCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.confirmDelete).toBe(false)
    })

    it('toggles wordWrap and persists', () => {
      render(<Settings onClose={mockOnClose} />)

      const checkboxes = screen.getAllByRole('checkbox')
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
      const showLineNumbersCheckbox = checkboxes[3]

      expect(showLineNumbersCheckbox).toBeChecked()

      fireEvent.click(showLineNumbersCheckbox)

      expect(showLineNumbersCheckbox).not.toBeChecked()

      const saved = JSON.parse(localStorage.getItem('mongopal-settings'))
      expect(saved.showLineNumbers).toBe(false)
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
      checkboxes.forEach(cb => expect(cb).toBeChecked())

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
      const header = screen.getByText('Settings').closest('div')
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

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).not.toBeChecked() // autoFormat
      expect(checkboxes[1]).toBeChecked() // confirmDelete
      expect(checkboxes[2]).not.toBeChecked() // wordWrap
      expect(checkboxes[3]).toBeChecked() // showLineNumbers
    })
  })
})
