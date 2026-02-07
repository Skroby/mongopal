package storage

import (
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
	state            *core.AppState
	storage          *Service
	encryptedStorage *credential.EncryptedStorage
}

// NewConnectionService creates a new connection service.
func NewConnectionService(state *core.AppState, storage *Service, encStorage *credential.EncryptedStorage) *ConnectionService {
	return &ConnectionService{
		state:            state,
		storage:          storage,
		encryptedStorage: encStorage,
	}
}

// SaveExtendedConnection saves a connection with all credentials to encrypted storage.
func (s *ConnectionService) SaveExtendedConnection(conn types.ExtendedConnection) error {
	// Generate a new ID for imported connections that don't have one
	if conn.ID == "" {
		conn.ID = uuid.New().String()
	}

	// Resolve folder path from export — find or create folder hierarchy
	if conn.FolderID == "" && len(conn.FolderPath) > 0 {
		conn.FolderID = s.resolveOrCreateFolderPath(conn.FolderPath)
		conn.FolderPath = nil // consumed
	}

	// Preserve existing fields when the incoming connection doesn't supply them.
	// The UI strips passwords and doesn't manage folder assignment; the backend fills them back in.
	var existing types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(conn.ID, &existing); err == nil {
		if conn.FolderID == "" && existing.FolderID != "" {
			conn.FolderID = existing.FolderID
		}
		_, incomingPw, _ := credential.ExtractPasswordFromURI(conn.MongoURI)
		if incomingPw == "" {
			_, existingPw, _ := credential.ExtractPasswordFromURI(existing.MongoURI)
			if existingPw != "" {
				if injected, err := credential.InjectPasswordIntoURI(conn.MongoURI, existingPw); err == nil {
					conn.MongoURI = injected
				}
			}
		}
		if conn.SSHPassword == "" {
			conn.SSHPassword = existing.SSHPassword
		}
		if conn.SSHPassphrase == "" {
			conn.SSHPassphrase = existing.SSHPassphrase
		}
		if conn.SOCKS5Password == "" {
			conn.SOCKS5Password = existing.SOCKS5Password
		}
		if conn.TLSKeyPassword == "" {
			conn.TLSKeyPassword = existing.TLSKeyPassword
		}
	}

	// Save to encrypted storage (full URI with credentials)
	if err := s.encryptedStorage.SaveConnection(conn.ID, conn); err != nil {
		return fmt.Errorf("failed to save connection to encrypted storage: %w", err)
	}

	// Update in-memory state — strip password for display
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	savedConn := conn.ToSavedConnection()
	cleanURI, _, _ := credential.ExtractPasswordFromURI(savedConn.URI)
	savedConn.URI = cleanURI

	found := false
	for i, c := range s.state.SavedConnections {
		if c.ID == conn.ID {
			s.state.SavedConnections[i] = savedConn
			found = true
			break
		}
	}
	if !found {
		s.state.SavedConnections = append(s.state.SavedConnections, savedConn)
	}

	return nil
}

// resolveOrCreateFolderPath walks a folder name path (e.g. ["Work", "Backend"]),
// finding existing folders or creating new ones as needed. Returns the leaf folder ID.
// Caller must NOT hold state.Mu — this method locks internally.
func (s *ConnectionService) resolveOrCreateFolderPath(path []string) string {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	parentID := ""
	for _, name := range path {
		// Look for an existing folder with this name under the current parent
		found := ""
		for _, f := range s.state.Folders {
			if f.Name == name && f.ParentID == parentID {
				found = f.ID
				break
			}
		}
		if found != "" {
			parentID = found
			continue
		}
		// Create the folder
		newFolder := types.Folder{
			ID:       uuid.New().String(),
			Name:     name,
			ParentID: parentID,
		}
		s.state.Folders = append(s.state.Folders, newFolder)
		parentID = newFolder.ID
	}

	// Persist any new folders — ignore errors (folder creation is best-effort)
	_ = s.storage.PersistFolders(s.state.Folders)
	return parentID
}

// UpdateFolderID updates a connection's folder assignment in encrypted storage.
func (s *ConnectionService) UpdateFolderID(connID, folderID string) error {
	var conn types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &conn); err != nil {
		return nil // not in encrypted storage (legacy connection) — skip
	}
	conn.FolderID = folderID
	return s.encryptedStorage.SaveConnection(connID, conn)
}

// UpdateLastAccessed updates the last accessed time for a connection.
func (s *ConnectionService) UpdateLastAccessed(connID string) error {
	// Load full connection from encrypted storage
	var extended types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &extended); err != nil {
		return fmt.Errorf("failed to load connection: %w", err)
	}

	// Update timestamp
	extended.LastAccessedAt = time.Now()

	// Save back to encrypted storage
	if err := s.encryptedStorage.SaveConnection(connID, extended); err != nil {
		return fmt.Errorf("failed to save connection: %w", err)
	}

	// Update in-memory state
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i, c := range s.state.SavedConnections {
		if c.ID == connID {
			s.state.SavedConnections[i].LastAccessedAt = extended.LastAccessedAt
			break
		}
	}

	return nil
}

// LoadAllConnections loads all connections from encrypted storage on startup.
func (s *ConnectionService) LoadAllConnections() error {
	// Get all connection IDs from encrypted storage
	connIDs, err := s.encryptedStorage.ListConnectionIDs()
	if err != nil {
		return fmt.Errorf("failed to list connections: %w", err)
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	// Clear existing connections
	s.state.SavedConnections = make([]types.SavedConnection, 0, len(connIDs))

	// Load each connection
	for _, connID := range connIDs {
		var extended types.ExtendedConnection
		if err := s.encryptedStorage.LoadConnection(connID, &extended); err != nil {
			// Log error but continue loading other connections
			s.state.EmitEvent("app:warning", map[string]string{
				"message": fmt.Sprintf("Failed to load connection %s", connID),
				"detail":  err.Error(),
			})
			continue
		}

		// Convert to SavedConnection for in-memory state (strip password from URI for display)
		saved := extended.ToSavedConnection()
		cleanURI, _, _ := credential.ExtractPasswordFromURI(saved.URI)
		saved.URI = cleanURI
		s.state.SavedConnections = append(s.state.SavedConnections, saved)
	}

	return nil
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

// GetExtendedConnection returns the full connection including all credentials.
func (s *ConnectionService) GetExtendedConnection(connID string) (types.ExtendedConnection, error) {
	var conn types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &conn); err != nil {
		return types.ExtendedConnection{}, fmt.Errorf("failed to load connection: %w", err)
	}
	return conn, nil
}

// DeleteSavedConnection removes a saved connection and its encrypted file.
func (s *ConnectionService) DeleteSavedConnection(connID string) error {
	// Delete from encrypted storage (also removes encryption key from keyring)
	if err := s.encryptedStorage.DeleteConnection(connID); err != nil {
		s.state.EmitEvent("app:warning", map[string]string{
			"message": "Could not remove encrypted connection file",
			"detail":  err.Error(),
		})
	}

	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i, c := range s.state.SavedConnections {
		if c.ID == connID {
			s.state.SavedConnections = append(s.state.SavedConnections[:i], s.state.SavedConnections[i+1:]...)
			return nil
		}
	}
	return &core.ConnectionNotFoundError{ConnID: connID}
}

// DuplicateConnection creates a copy of a connection including all credentials.
func (s *ConnectionService) DuplicateConnection(connID, newName string) (types.SavedConnection, error) {
	// Load original connection from encrypted storage
	var original types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &original); err != nil {
		return types.SavedConnection{}, fmt.Errorf("failed to load original connection: %w", err)
	}

	// Create new connection with new ID
	newConn := original
	newConn.ID = uuid.New().String()
	newConn.Name = newName
	newConn.CreatedAt = time.Now()
	newConn.LastAccessedAt = time.Time{}

	// Save to encrypted storage
	if err := s.encryptedStorage.SaveConnection(newConn.ID, newConn); err != nil {
		return types.SavedConnection{}, fmt.Errorf("failed to save duplicated connection: %w", err)
	}

	// Update in-memory state
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	savedConn := newConn.ToSavedConnection()
	cleanURI, _, _ := credential.ExtractPasswordFromURI(savedConn.URI)
	savedConn.URI = cleanURI
	s.state.SavedConnections = append(s.state.SavedConnections, savedConn)

	return savedConn, nil
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

// MergeStoredCredentials injects stored passwords into a URI that may have them stripped.
// Used for test connection where the form doesn't hold passwords in memory.
func (s *ConnectionService) MergeStoredCredentials(connID, uri string) string {
	var existing types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &existing); err != nil {
		return uri
	}

	_, incomingPw, _ := credential.ExtractPasswordFromURI(uri)
	if incomingPw == "" {
		_, storedPw, _ := credential.ExtractPasswordFromURI(existing.MongoURI)
		if storedPw != "" {
			if injected, err := credential.InjectPasswordIntoURI(uri, storedPw); err == nil {
				return injected
			}
		}
	}
	return uri
}

// GetConnectionURI returns the URI for a saved connection with password from encrypted storage.
func (s *ConnectionService) GetConnectionURI(connID string) (string, error) {
	var extended types.ExtendedConnection
	if err := s.encryptedStorage.LoadConnection(connID, &extended); err != nil {
		return "", fmt.Errorf("failed to load connection: %w", err)
	}

	return extended.MongoURI, nil
}
