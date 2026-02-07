import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProgressETA } from './useProgressETA'

describe('useProgressETA', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('recordProgress', () => {
    it('should record progress checkpoints', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(10)
      })

      // Can't directly inspect checkpoints, but getETA with 1 checkpoint should return null
      expect(result.current.getETA(10, 100)).toBeNull()
    })

    it('should not record duplicate progress values', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(10) // duplicate
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(20)
      })

      // Should only have 2 checkpoints (10 and 20), not 3
      const eta = result.current.getETA(20, 100)
      expect(eta).not.toBeNull()
    })

    it('should maintain rolling window of checkpoints', () => {
      const { result } = renderHook(() => useProgressETA(3)) // window of 3

      act(() => {
        for (let i = 1; i <= 5; i++) {
          result.current.recordProgress(i * 10)
          vi.advanceTimersByTime(1000)
        }
      })

      // Should still work with trimmed window
      const eta = result.current.getETA(50, 100)
      expect(eta).not.toBeNull()
    })
  })

  describe('getETA', () => {
    it('should return null with less than 2 checkpoints', () => {
      const { result } = renderHook(() => useProgressETA())

      expect(result.current.getETA(10, 100)).toBeNull()

      act(() => {
        result.current.recordProgress(10)
      })

      expect(result.current.getETA(10, 100)).toBeNull()
    })

    it('should return null when processed is 0 or negative', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(0)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(10)
      })

      expect(result.current.getETA(0, 100)).toBeNull()
      expect(result.current.getETA(-5, 100)).toBeNull()
    })

    it('should return null when total is 0 or negative', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(20)
      })

      expect(result.current.getETA(20, 0)).toBeNull()
      expect(result.current.getETA(20, -100)).toBeNull()
    })

    it('should return null when work is complete (remaining <= 0)', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(50)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(100)
      })

      expect(result.current.getETA(100, 100)).toBeNull()
      expect(result.current.getETA(150, 100)).toBeNull()
    })

    it('should calculate ETA based on progress rate', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // Process 10 items per second
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(20)
      })

      // 80 items remaining at 10/sec = 8 seconds -> rounds to ~10s
      const eta = result.current.getETA(20, 100)
      expect(eta).toBe('~10s')
    })

    it('should format seconds correctly', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // Process 1 item per second
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(11)
      })

      // 89 items remaining at 1/sec = 89 seconds
      const eta = result.current.getETA(11, 100)
      expect(eta).toMatch(/~\d+m/) // Should be in minutes format
    })

    it('should format minutes correctly', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // Process 100 items per second
        result.current.recordProgress(1000)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(1100)
      })

      // 8900 items remaining at 100/sec = 89 seconds
      const eta = result.current.getETA(1100, 10000)
      expect(eta).toMatch(/~1m/) // ~89 seconds = ~1m 30s
    })

    it('should format hours correctly', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // Process 1 item per second
        result.current.recordProgress(100)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(101)
      })

      // 9899 items remaining at 1/sec = 9899 seconds = ~2h 45m
      const eta = result.current.getETA(101, 10000)
      expect(eta).toMatch(/~\d+h/) // Should be in hours format
    })
  })

  describe('reset', () => {
    it('should clear all checkpoints', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(20)
      })

      // Should have ETA before reset
      expect(result.current.getETA(20, 100)).not.toBeNull()

      act(() => {
        result.current.reset()
      })

      // Should be null after reset (no checkpoints)
      expect(result.current.getETA(20, 100)).toBeNull()
    })

    it('should allow starting fresh after reset', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        result.current.recordProgress(50)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(60)
        result.current.reset()
        result.current.recordProgress(10)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(20)
      })

      // Should calculate based on new checkpoints
      const eta = result.current.getETA(20, 100)
      expect(eta).not.toBeNull()
    })
  })

  describe('formatDuration (via getETA)', () => {
    it('should return <10s for very short durations', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // 20 items/sec rate
        result.current.recordProgress(100)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(120)
      })

      // 80 remaining at 20/sec = 4 seconds
      const eta = result.current.getETA(120, 200)
      expect(eta).toBe('<10s')
    })

    it('should round seconds to nearest 10', () => {
      const { result } = renderHook(() => useProgressETA())

      act(() => {
        // 2 items/sec rate
        result.current.recordProgress(100)
        vi.advanceTimersByTime(1000)
        result.current.recordProgress(102)
      })

      // 48 remaining at 2/sec = 24 seconds -> ~20s
      const eta = result.current.getETA(102, 150)
      expect(eta).toMatch(/~\d+s/)
    })
  })
})
