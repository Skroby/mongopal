import { useRef, useCallback } from 'react'

/**
 * Hook for calculating ETA based on recent progress rate.
 * Uses a rolling window of checkpoints to estimate time remaining.
 *
 * @param {number} windowSize - Number of checkpoints to keep (default: 15)
 * @returns {Object} - { recordProgress, getETA, reset }
 */
export function useProgressETA(windowSize = 15) {
  // Circular buffer of checkpoints: { timestamp, processed }
  const checkpoints = useRef([])
  const startTime = useRef(null)

  /**
   * Record a progress checkpoint
   * @param {number} processed - Items processed so far
   * @param {number} total - Total items (unused here, but caller has it)
   */
  const recordProgress = useCallback((processed) => {
    const now = Date.now()

    // Initialize start time on first call
    if (startTime.current === null) {
      startTime.current = now
    }

    // Only record if processed count changed
    const lastCheckpoint = checkpoints.current[checkpoints.current.length - 1]
    if (lastCheckpoint && lastCheckpoint.processed === processed) {
      return
    }

    // Add checkpoint
    checkpoints.current.push({ timestamp: now, processed })

    // Keep only the last windowSize checkpoints
    if (checkpoints.current.length > windowSize) {
      checkpoints.current.shift()
    }
  }, [windowSize])

  /**
   * Calculate ETA based on recent progress rate
   * @param {number} processed - Current items processed
   * @param {number} total - Total items to process
   * @returns {string|null} - Human-readable ETA or null if not enough data
   */
  const getETA = useCallback((processed, total) => {
    const points = checkpoints.current

    // Need at least 2 checkpoints to calculate rate
    if (points.length < 2 || processed <= 0 || total <= 0) {
      return null
    }

    const remaining = total - processed
    if (remaining <= 0) {
      return null
    }

    // Calculate rate from rolling window
    const oldest = points[0]
    const newest = points[points.length - 1]

    const timeDelta = newest.timestamp - oldest.timestamp
    const itemsDelta = newest.processed - oldest.processed

    if (timeDelta <= 0 || itemsDelta <= 0) {
      return null
    }

    // Items per millisecond
    const rate = itemsDelta / timeDelta

    // Estimated milliseconds remaining
    const msRemaining = remaining / rate

    return formatDuration(msRemaining)
  }, [])

  /**
   * Reset the ETA tracker (call when starting a new operation)
   */
  const reset = useCallback(() => {
    checkpoints.current = []
    startTime.current = null
  }, [])

  return { recordProgress, getETA, reset }
}

/**
 * Format milliseconds into human-readable duration
 * @param {number} ms - Milliseconds
 * @returns {string} - e.g., "2m 30s", "1h 5m", "<1m"
 */
function formatDuration(ms) {
  if (ms < 0 || !isFinite(ms)) {
    return null
  }

  const seconds = Math.round(ms / 1000)

  if (seconds < 60) {
    return seconds <= 5 ? '<10s' : `~${Math.round(seconds / 10) * 10}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    if (remainingSeconds < 15) {
      return `~${minutes}m`
    }
    return `~${minutes}m ${Math.round(remainingSeconds / 30) * 30}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours < 24) {
    return `~${hours}h ${remainingMinutes}m`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `~${days}d ${remainingHours}h`
}

export default useProgressETA
