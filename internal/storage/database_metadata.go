package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// DatabaseMeta stores metadata about a database.
type DatabaseMeta struct {
	LastAccessedAt time.Time `json:"lastAccessedAt"`
}

// databaseMetadataStore represents the JSON structure for database metadata storage.
// Key format: "connID:dbName"
type databaseMetadataStore struct {
	Databases map[string]DatabaseMeta `json:"databases"`
}

// DatabaseMetadataService handles database metadata storage operations.
type DatabaseMetadataService struct {
	configDir string
	data      map[string]DatabaseMeta // Key: "connID:dbName"
	mu        sync.RWMutex
}

// NewDatabaseMetadataService creates a new database metadata service.
func NewDatabaseMetadataService(configDir string) *DatabaseMetadataService {
	svc := &DatabaseMetadataService{
		configDir: configDir,
		data:      make(map[string]DatabaseMeta),
	}
	svc.load()
	return svc
}

func (s *DatabaseMetadataService) metadataFile() string {
	return filepath.Join(s.configDir, "database_metadata.json")
}

func (s *DatabaseMetadataService) load() {
	data, err := os.ReadFile(s.metadataFile())
	if err != nil {
		if os.IsNotExist(err) {
			s.data = make(map[string]DatabaseMeta)
			return
		}
		fmt.Printf("Warning: failed to load database metadata: %v\n", err)
		s.data = make(map[string]DatabaseMeta)
		return
	}

	var store databaseMetadataStore
	if err := json.Unmarshal(data, &store); err != nil {
		fmt.Printf("Warning: failed to parse database metadata: %v\n", err)
		s.data = make(map[string]DatabaseMeta)
		return
	}

	s.data = store.Databases
	if s.data == nil {
		s.data = make(map[string]DatabaseMeta)
	}
}

func (s *DatabaseMetadataService) persist() error {
	store := databaseMetadataStore{
		Databases: s.data,
	}
	jsonData, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.metadataFile(), jsonData, 0600)
}

func makeDbMetaKey(connID, dbName string) string {
	return connID + ":" + dbName
}

// UpdateDatabaseAccessed updates the last accessed time for a database.
func (s *DatabaseMetadataService) UpdateDatabaseAccessed(connID, dbName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeDbMetaKey(connID, dbName)
	s.data[key] = DatabaseMeta{
		LastAccessedAt: time.Now(),
	}

	if err := s.persist(); err != nil {
		return fmt.Errorf("failed to save database metadata: %w", err)
	}
	return nil
}

// GetDatabaseLastAccessed returns the last accessed time for a database.
// Returns zero time if not found.
func (s *DatabaseMetadataService) GetDatabaseLastAccessed(connID, dbName string) time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := makeDbMetaKey(connID, dbName)
	if meta, ok := s.data[key]; ok {
		return meta.LastAccessedAt
	}
	return time.Time{}
}

// GetAllDatabaseMetadata returns all database metadata for a connection.
// Returns a map of dbName -> DatabaseMeta.
func (s *DatabaseMetadataService) GetAllDatabaseMetadata(connID string) map[string]DatabaseMeta {
	s.mu.RLock()
	defer s.mu.RUnlock()

	prefix := connID + ":"
	result := make(map[string]DatabaseMeta)
	for key, meta := range s.data {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			dbName := key[len(prefix):]
			result[dbName] = meta
		}
	}
	return result
}

// RemoveDatabaseMetadata removes metadata for a specific database.
func (s *DatabaseMetadataService) RemoveDatabaseMetadata(connID, dbName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeDbMetaKey(connID, dbName)
	if _, exists := s.data[key]; !exists {
		return nil // Nothing to remove
	}

	delete(s.data, key)
	if err := s.persist(); err != nil {
		return fmt.Errorf("failed to remove database metadata: %w", err)
	}
	return nil
}

// RemoveMetadataForConnection removes all database metadata for a connection.
// Call this when a connection is deleted.
func (s *DatabaseMetadataService) RemoveMetadataForConnection(connID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	prefix := connID + ":"
	modified := false
	for key := range s.data {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			delete(s.data, key)
			modified = true
		}
	}

	if modified {
		return s.persist()
	}
	return nil
}

// CleanupStaleDatabases removes metadata for databases that no longer exist.
// Call this after listing databases from MongoDB to clean up stale entries.
func (s *DatabaseMetadataService) CleanupStaleDatabases(connID string, currentDatabases []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Build a set of current database names
	currentSet := make(map[string]bool, len(currentDatabases))
	for _, db := range currentDatabases {
		currentSet[db] = true
	}

	prefix := connID + ":"
	modified := false
	for key := range s.data {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			dbName := key[len(prefix):]
			if !currentSet[dbName] {
				delete(s.data, key)
				modified = true
			}
		}
	}

	if modified {
		return s.persist()
	}
	return nil
}
