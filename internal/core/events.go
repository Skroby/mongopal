package core

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// EventEmitter defines the interface for emitting events to the UI.
type EventEmitter interface {
	Emit(eventName string, data interface{})
}

// WailsEventEmitter emits events using the Wails runtime.
type WailsEventEmitter struct {
	Ctx context.Context
}

// Emit sends an event to the frontend via Wails runtime.
func (e *WailsEventEmitter) Emit(eventName string, data interface{}) {
	if e.Ctx != nil {
		runtime.EventsEmit(e.Ctx, eventName, data)
	}
}

// NoopEventEmitter is a no-op event emitter for testing.
type NoopEventEmitter struct{}

// Emit does nothing (used for tests).
func (e *NoopEventEmitter) Emit(eventName string, data interface{}) {}

// =============================================================================
// Custom Error Types
// =============================================================================

// NotConnectedError indicates a connection is not established.
type NotConnectedError struct {
	ConnID string
}

func (e *NotConnectedError) Error() string {
	return fmt.Sprintf("not connected: %s", e.ConnID)
}

// ConnectionNotFoundError indicates a saved connection was not found.
type ConnectionNotFoundError struct {
	ConnID string
}

func (e *ConnectionNotFoundError) Error() string {
	return fmt.Sprintf("connection not found: %s", e.ConnID)
}

// FolderNotFoundError indicates a folder was not found.
type FolderNotFoundError struct {
	FolderID string
}

func (e *FolderNotFoundError) Error() string {
	return fmt.Sprintf("folder not found: %s", e.FolderID)
}
