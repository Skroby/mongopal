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
	Clients          map[string]*mongo.Client // Active connections by ID
	SavedConnections []types.SavedConnection  // In-memory cache of saved connections
	Folders          []types.Folder           // Connection folders
	ConfigDir        string                   // Config directory path
	Mu               sync.RWMutex
	CancelMu         sync.Mutex         // Mutex for export/import cancel functions
	ExportCancel     context.CancelFunc // Cancel function for ongoing export
	ImportCancel     context.CancelFunc // Cancel function for ongoing import
	Ctx              context.Context    // Wails context
	DisableEvents    bool               // Disable event emission (for tests)
	Emitter          EventEmitter       // Event emitter for UI notifications
}

// NewAppState creates a new AppState with initialized maps.
func NewAppState() *AppState {
	return &AppState{
		Clients:          make(map[string]*mongo.Client),
		SavedConnections: []types.SavedConnection{},
		Folders:          []types.Folder{},
	}
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

// SetExportCancel safely sets the export cancel function.
func (s *AppState) SetExportCancel(cancel context.CancelFunc) {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	s.ExportCancel = cancel
}

// ClearExportCancel safely clears the export cancel function and calls it.
func (s *AppState) ClearExportCancel() {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	if s.ExportCancel != nil {
		s.ExportCancel()
		s.ExportCancel = nil
	}
}

// GetExportCancel safely gets the export cancel function.
func (s *AppState) GetExportCancel() context.CancelFunc {
	s.CancelMu.Lock()
	defer s.CancelMu.Unlock()
	return s.ExportCancel
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
