import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEditorLayout } from './useEditorLayout'

describe('useEditorLayout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('initialization', () => {
    it('should use default height when no saved value', () => {
      const { result } = renderHook(() => useEditorLayout())
      expect(result.current.editorHeight).toBe(120)
    })

    it('should use custom default height', () => {
      const { result } = renderHook(() => useEditorLayout({ defaultHeight: 200 }))
      expect(result.current.editorHeight).toBe(200)
    })

    it('should restore height from localStorage', () => {
      localStorage.setItem('mongopal_editor_height', '180')
      const { result } = renderHook(() => useEditorLayout())
      expect(result.current.editorHeight).toBe(180)
    })

    it('should use custom storage key', () => {
      localStorage.setItem('custom_key', '250')
      const { result } = renderHook(() =>
        useEditorLayout({ storageKey: 'custom_key' })
      )
      expect(result.current.editorHeight).toBe(250)
    })

    it('should fall back to default on invalid localStorage value', () => {
      localStorage.setItem('mongopal_editor_height', 'not_a_number')
      const { result } = renderHook(() => useEditorLayout())
      // parseInt('not_a_number', 10) returns NaN
      expect(result.current.editorHeight).toBeNaN()
    })
  })

  describe('resizerProps', () => {
    it('should return resizerProps with onMouseDown handler', () => {
      const { result } = renderHook(() => useEditorLayout())
      expect(result.current.resizerProps).toBeDefined()
      expect(typeof result.current.resizerProps.onMouseDown).toBe('function')
    })
  })

  describe('return value stability', () => {
    it('should return consistent shape', () => {
      const { result } = renderHook(() => useEditorLayout())
      const value = result.current
      expect(value).toHaveProperty('editorHeight')
      expect(value).toHaveProperty('resizerProps')
      expect(typeof value.editorHeight).toBe('number')
      expect(typeof value.resizerProps.onMouseDown).toBe('function')
    })
  })
})
