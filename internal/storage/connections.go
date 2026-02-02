package storage

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/credential"
	"github.com/peternagy/mongopal/internal/types"
)

// ConnectionService handles connection storage operations.
type ConnectionService struct {
	state      *core.AppState
	storage    *Service
	credential *credential.Service
}

// NewConnectionService creates a new connection service.
func NewConnectionService(state *core.AppState, storage *Service, cred *credential.Service) *ConnectionService {
	return &ConnectionService{
		state:      state,
		storage:    storage,
		credential: cred,
	}
}

// SaveConnection saves a connection to storage with password in keyring.
func (s *ConnectionService) SaveConnection(conn types.SavedConnection, password string) error {
	// Extract password from URI if present
	cleanURI, uriPassword, _ := credential.ExtractPasswordFromURI(conn.URI)

	// Determine password to store:
	// 1. Use explicitly provided password if given
	// 2. Otherwise use password from URI if present
	// 3. Otherwise preserve existing password (for edits where password wasn't changed)
	passwordToStore := password
	if passwordToStore == "" {
		passwordToStore = uriPassword
	}
	if passwordToStore == "" {
		// Check if this is an edit (connection already exists) and preserve existing password
		existingPassword, _ := s.credential.GetPassword(conn.ID)
		passwordToStore = existingPassword
	}

	// Store password in keyring (or preserve existing if passwordToStore is still empty)
	if err := s.credential.SetPassword(conn.ID, passwordToStore); err != nil {
		// Log but don't fail - password will be in URI as fallback
		fmt.Printf("Warning: failed to store password in keyring: %v\n", err)
		s.state.EmitEvent("app:warning", map[string]string{
			"message": "Password stored in connection URI (keyring unavailable)",
			"detail":  err.Error(),
		})
	} else {
		// Password stored in keyring, use clean URI
		conn.URI = cleanURI
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	// Update or add connection
	found := false
	for i, c := range s.state.SavedConnections {
		if c.ID == conn.ID {
			s.state.SavedConnections[i] = conn
			found = true
			break
		}
	}
	if !found {
		s.state.SavedConnections = append(s.state.SavedConnections, conn)
	}

	return s.storage.PersistConnections(s.state.SavedConnections)
}

// UpdateLastAccessed updates the last accessed time for a connection.
func (s *ConnectionService) UpdateLastAccessed(connID string) error {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i, c := range s.state.SavedConnections {
		if c.ID == connID {
			s.state.SavedConnections[i].LastAccessedAt = time.Now()
			return s.storage.PersistConnections(s.state.SavedConnections)
		}
	}
	return &core.ConnectionNotFoundError{ConnID: connID}
}

// ListSavedConnections returns all saved connections.
func (s *ConnectionService) ListSavedConnections() ([]types.SavedConnection, error) {
	s.state.Mu.RLock()
	defer s.state.Mu.RUnlock()
	result := make([]types.SavedConnection, len(s.state.SavedConnections))
	copy(result, s.state.SavedConnections)
	return result, nil
}

// GetSavedConnection returns a single saved connection.
func (s *ConnectionService) GetSavedConnection(connID string) (types.SavedConnection, error) {
	s.state.Mu.RLock()
	defer s.state.Mu.RUnlock()
	for _, c := range s.state.SavedConnections {
		if c.ID == connID {
			return c, nil
		}
	}
	return types.SavedConnection{}, &core.ConnectionNotFoundError{ConnID: connID}
}

// DeleteSavedConnection removes a saved connection and its password from keyring.
func (s *ConnectionService) DeleteSavedConnection(connID string) error {
	// Delete password from keyring
	if err := s.credential.DeletePassword(connID); err != nil {
		s.state.EmitEvent("app:warning", map[string]string{
			"message": "Could not remove password from keyring",
			"detail":  err.Error(),
		})
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i, c := range s.state.SavedConnections {
		if c.ID == connID {
			s.state.SavedConnections = append(s.state.SavedConnections[:i], s.state.SavedConnections[i+1:]...)
			return s.storage.PersistConnections(s.state.SavedConnections)
		}
	}
	return &core.ConnectionNotFoundError{ConnID: connID}
}

// DuplicateConnection creates a copy of a connection including password.
func (s *ConnectionService) DuplicateConnection(connID, newName string) (types.SavedConnection, error) {
	// Get original password from keyring before locking
	originalPassword, err := s.credential.GetPassword(connID)
	if err != nil {
		s.state.EmitEvent("app:warning", map[string]string{
			"message": "Could not copy password to new connection",
			"detail":  err.Error(),
		})
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	var original types.SavedConnection
	for _, c := range s.state.SavedConnections {
		if c.ID == connID {
			original = c
			break
		}
	}
	if original.ID == "" {
		return types.SavedConnection{}, &core.ConnectionNotFoundError{ConnID: connID}
	}

	newConn := types.SavedConnection{
		ID:        uuid.New().String(),
		Name:      newName,
		FolderID:  original.FolderID,
		URI:       original.URI,
		Color:     original.Color,
		CreatedAt: time.Now(),
	}

	// Copy password to new connection's keyring entry
	if originalPassword != "" {
		if err := s.credential.SetPassword(newConn.ID, originalPassword); err != nil {
			s.state.EmitEvent("app:warning", map[string]string{
				"message": "Password not stored in keyring for duplicated connection",
				"detail":  err.Error(),
			})
		}
	}

	s.state.SavedConnections = append(s.state.SavedConnections, newConn)
	if err := s.storage.PersistConnections(s.state.SavedConnections); err != nil {
		return types.SavedConnection{}, err
	}
	return newConn, nil
}

// ExportConnections exports connections as JSON (without passwords).
func (s *ConnectionService) ExportConnections(folderID string) (string, error) {
	s.state.Mu.RLock()
	defer s.state.Mu.RUnlock()

	// Filter by folder if specified
	var conns []types.SavedConnection
	for _, c := range s.state.SavedConnections {
		if folderID == "" || c.FolderID == folderID {
			// Mask password in URI for export
			conns = append(conns, c)
		}
	}

	data, err := json.MarshalIndent(conns, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ImportConnections imports connections from JSON.
func (s *ConnectionService) ImportConnections(jsonStr string) error {
	var conns []types.SavedConnection
	if err := json.Unmarshal([]byte(jsonStr), &conns); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	// Add imported connections with new IDs
	for _, c := range conns {
		c.ID = uuid.New().String()
		c.CreatedAt = time.Now()
		s.state.SavedConnections = append(s.state.SavedConnections, c)
	}

	return s.storage.PersistConnections(s.state.SavedConnections)
}

// ConnectionToURI returns the URI for a connection.
func (s *ConnectionService) ConnectionToURI(connID string) (string, error) {
	s.state.Mu.RLock()
	defer s.state.Mu.RUnlock()
	for _, c := range s.state.SavedConnections {
		if c.ID == connID {
			return c.URI, nil
		}
	}
	return "", &core.ConnectionNotFoundError{ConnID: connID}
}

// ConnectionFromURI parses a URI and creates a connection object (not saved).
func (s *ConnectionService) ConnectionFromURI(uri string) (types.SavedConnection, error) {
	// Basic validation
	if !strings.HasPrefix(uri, "mongodb://") && !strings.HasPrefix(uri, "mongodb+srv://") {
		return types.SavedConnection{}, fmt.Errorf("invalid MongoDB URI")
	}

	// Extract a name from the URI (use host or "New Connection")
	name := "New Connection"
	if strings.Contains(uri, "@") {
		parts := strings.Split(uri, "@")
		if len(parts) > 1 {
			hostPart := strings.Split(parts[1], "/")[0]
			hostPart = strings.Split(hostPart, "?")[0]
			if hostPart != "" {
				name = hostPart
			}
		}
	}

	return types.SavedConnection{
		ID:        uuid.New().String(),
		Name:      name,
		URI:       uri,
		Color:     "#4CC38A",
		CreatedAt: time.Now(),
	}, nil
}

// GetConnectionURI returns the URI for a saved connection with password from keyring.
func (s *ConnectionService) GetConnectionURI(connID string) (string, error) {
	s.state.Mu.RLock()
	var conn *types.SavedConnection
	for i := range s.state.SavedConnections {
		if s.state.SavedConnections[i].ID == connID {
			conn = &s.state.SavedConnections[i]
			break
		}
	}
	s.state.Mu.RUnlock()

	if conn == nil {
		return "", &core.ConnectionNotFoundError{ConnID: connID}
	}

	// Get password from keyring and inject into URI
	password, err := s.credential.GetPassword(connID)
	if err != nil {
		s.state.EmitEvent("app:warning", map[string]string{
			"message": "Could not retrieve password from keyring",
			"detail":  err.Error(),
		})
		return conn.URI, nil
	}
	if password == "" {
		// No password stored, return URI as-is
		return conn.URI, nil
	}

	return credential.InjectPasswordIntoURI(conn.URI, password)
}
