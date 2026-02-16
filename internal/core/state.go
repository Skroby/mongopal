// Package core provides shared application state and event handling.
package core

import (
	"context"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"

	"github.com/peternagy/mongopal/internal/types"
)

// DefaultQueryTimeout is the default timeout for database queries.
const DefaultQueryTimeout = 30 * time.Second

// DefaultConnectTimeout is the default timeout for connection attempts.
const DefaultConnectTimeout = 10 * time.Second

// AppState holds the shared application state.
type AppState struct {
	Clients          map[string]*mongo.Client        // Active connections by ID
	Connecting       map[string]bool                 // Connection IDs currently being connected (to prevent races)
	SavedConnections []types.SavedConnection         // In-memory cache of saved connections
	Folders          []types.Folder                  // Connection folders
	ConfigDir        string                          // Config directory path
	Mu               sync.RWMutex
	CancelMu         sync.Mutex                      // Mutex for export/import cancel functions
	ExportCancels    map[string]context.CancelFunc   // Cancel functions for ongoing exports (keyed by export ID)
	ImportCancel     context.CancelFunc              // Cancel function for ongoing import
	ExportPause      *PauseController                // Pause controller for export operations
	ImportPause      *PauseController                // Pause controller for import operations
	Ctx              context.Context                 // Wails context
	DisableEvents    bool                            // Disable event emission (for tests)
	Emitter          EventEmitter                    // Event emitter for UI notifications
}

// NewAppState creates a new AppState with initialized maps.
func NewAppState() *AppState {
	return &AppState{
		Clients:          make(map[string]*mongo.Client),
		Connecting:       make(map[string]bool),
		SavedConnections: []types.SavedConnection{},
		Folders:          []types.Folder{},
		ExportCancels:    make(map[string]context.CancelFunc),
		ExportPause:      NewPauseController(),
		ImportPause:      NewPauseController(),
	}
}

// ConnectionInProgressError is returned when a connection attempt is already in progress.
type ConnectionInProgressError struct {
	ConnID string
}

func (e *ConnectionInProgressError) Error() string {
	return "connection attempt already in progress for " + e.ConnID
}

// StartConnecting marks a connection as being connected. Returns error if already connecting.
func (s *AppState) StartConnecting(connID string) error {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	if s.Connecting[connID] {
		return &ConnectionInProgressError{ConnID: connID}
	}
	s.Connecting[connID] = true
	return nil
}

// FinishConnecting marks a connection attempt as finished.
func (s *AppState) FinishConnecting(connID string) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	delete(s.Connecting, connID)
}

// GetClient returns the MongoDB client for a connection, or error if not connected.
func (s *AppState) GetClient(connID string) (*mongo.Client, error) {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	client, ok := s.Clients[connID]
	if !ok {
		return nil, &NotConnectedError{ConnID: connID}
	}
	return client, nil
}

// SetClient stores a client for a connection ID.
func (s *AppState) SetClient(connID string, client *mongo.Client) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	// Disconnect existing client if any
	if existing, ok := s.Clients[connID]; ok {
		existing.Disconnect(context.Background())
	}
	s.Clients[connID] = client
}

// RemoveClient removes a client for a connection ID.
func (s *AppState) RemoveClient(connID string) {
	s.Mu.Lock()
	defer s.Mu.Unlock()
	if client, ok := s.Clients[connID]; ok {
		client.Disconnect(context.Background())
		delete(s.Clients, connID)
	}
}

// HasClient checks if a client exists for a connection ID.
func (s *AppState) HasClient(connID string) bool {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	_, ok := s.Clients[connID]
	return ok
}

// GetAllClients returns a copy of the clients map.
func (s *AppState) GetAllClients() map[string]*mongo.Client {
	s.Mu.RLock()
	defer s.Mu.RUnlock()
	result := make(map[string]*mongo.Client, len(s.Clients))
	for k, v := range s.Clients {
		result[k] = v
	}
	return result
}

// ContextWithTimeout creates a context with the default query timeout.
func ContextWithTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), DefaultQueryTimeout)
}

// ContextWithConnectTimeout creates a context with the default connect timeout.
func ContextWithConnectTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), DefaultConnectTimeout)
}

// SetExportCancel safely sets an export cancel function by ID.
func (s *AppState) SetExportCancel(exportID string, cancel context.CancelFunc) {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	s.ExportCancels[exportID] = cancel
}

// ClearExportCancel safely removes an export cancel function by ID (does NOT call it).
func (s *AppState) ClearExportCancel(exportID string) {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	delete(s.ExportCancels, exportID)
}

// CancelExport cancels an export by ID, or all exports if ID is empty.
func (s *AppState) CancelExport(exportID string) {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	if exportID == "" {
		// Cancel all exports
		for id, cancel := range s.ExportCancels {
			if cancel != nil {
				cancel()
			}
			delete(s.ExportCancels, id)
		}
	} else if cancel, ok := s.ExportCancels[exportID]; ok {
		if cancel != nil {
			cancel()
		}
		delete(s.ExportCancels, exportID)
	}
	// Wake any goroutines blocked in WaitIfExportPaused so they see the cancelled context
	s.ExportPause.Broadcast()
}

// SetImportCancel safely sets the import cancel function.
func (s *AppState) SetImportCancel(cancel context.CancelFunc) {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	s.ImportCancel = cancel
}

// ClearImportCancel safely clears the import cancel function and calls it.
func (s *AppState) ClearImportCancel() {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	if s.ImportCancel != nil {
		s.ImportCancel()
		s.ImportCancel = nil
	}
	// Wake any goroutines blocked in WaitIfImportPaused so they see the cancelled context
	s.ImportPause.Broadcast()
}

// GetImportCancel safely gets the import cancel function.
func (s *AppState) GetImportCancel() context.CancelFunc {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	return s.ImportCancel
}

// EmitEvent safely emits an event through the emitter.
func (s *AppState) EmitEvent(eventName string, data interface{}) {
	if s.DisableEvents || s.Emitter == nil {
		return
	}
	s.Emitter.Emit(eventName, data)
}

// PauseExport pauses ongoing export operations.
func (s *AppState) PauseExport() { s.ExportPause.Pause() }

// ResumeExport resumes paused export operations.
func (s *AppState) ResumeExport() { s.ExportPause.Resume() }

// IsExportPaused returns whether export is currently paused.
func (s *AppState) IsExportPaused() bool { return s.ExportPause.IsPaused() }

// WaitIfExportPaused blocks until export is resumed (if paused).
// Returns true if the operation should continue, false if cancelled.
func (s *AppState) WaitIfExportPaused(ctx context.Context) bool {
	return s.ExportPause.WaitIfPaused(ctx)
}

// ResetExportPause resets the export pause state (called when export completes or is cancelled).
func (s *AppState) ResetExportPause() { s.ExportPause.Reset() }

// PauseImport pauses ongoing import operations.
func (s *AppState) PauseImport() { s.ImportPause.Pause() }

// ResumeImport resumes paused import operations.
func (s *AppState) ResumeImport() { s.ImportPause.Resume() }

// IsImportPaused returns whether import is currently paused.
func (s *AppState) IsImportPaused() bool { return s.ImportPause.IsPaused() }

// WaitIfImportPaused blocks until import is resumed (if paused).
// Returns true if the operation should continue, false if cancelled.
func (s *AppState) WaitIfImportPaused(ctx context.Context) bool {
	return s.ImportPause.WaitIfPaused(ctx)
}

// ResetImportPause resets the import pause state (called when import completes or is cancelled).
func (s *AppState) ResetImportPause() { s.ImportPause.Reset() }
