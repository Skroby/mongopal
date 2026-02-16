package core

import (
	"context"
	"sync"
)

// PauseController provides thread-safe pause/resume control for long-running operations.
// It uses a condition variable to allow goroutines to block until resumed.
type PauseController struct {
	mu     sync.Mutex
	cond   *sync.Cond
	paused bool
}

// NewPauseController creates a new PauseController in the unpaused state.
func NewPauseController() *PauseController {
	pc := &PauseController{}
	pc.cond = sync.NewCond(&pc.mu)
	return pc
}

// Pause sets the paused flag. Goroutines calling WaitIfPaused will block.
func (pc *PauseController) Pause() {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.paused = true
}

// Resume clears the paused flag and wakes all waiting goroutines.
func (pc *PauseController) Resume() {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.paused = false
	pc.cond.Broadcast()
}

// IsPaused returns whether the controller is currently paused.
func (pc *PauseController) IsPaused() bool {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	return pc.paused
}

// WaitIfPaused blocks until the controller is resumed (if paused).
// Returns true if the operation should continue, false if the context was cancelled.
func (pc *PauseController) WaitIfPaused(ctx context.Context) bool {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	for pc.paused {
		// Check for cancellation before waiting
		select {
		case <-ctx.Done():
			return false
		default:
		}
		// Wait for resume signal
		pc.cond.Wait()
	}
	// Check for cancellation after waking up
	select {
	case <-ctx.Done():
		return false
	default:
		return true
	}
}

// Reset clears the paused flag without broadcasting (used when an operation completes or is cancelled).
func (pc *PauseController) Reset() {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.paused = false
}

// Broadcast wakes all goroutines waiting on this controller (e.g. after cancellation).
func (pc *PauseController) Broadcast() {
	pc.cond.Broadcast()
}
