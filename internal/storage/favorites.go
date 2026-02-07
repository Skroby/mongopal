package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// favoritesData represents the JSON structure for favorites storage.
type favoritesData struct {
	Collections     []string `json:"collections"`     // Collection favorite keys
	DatabaseOrder   []string `json:"databaseOrder"`   // Ordered database favorite keys
}

// FavoriteService handles collection and database favorites storage operations.
type FavoriteService struct {
	configDir         string
	collectionFavs    map[string]bool // Set of collection favorite keys: "connectionId:database:collection"
	databaseFavOrder  []string        // Ordered list of database favorite keys: "db:connectionId:database"
	databaseFavLookup map[string]bool // Quick lookup for database favorites
	mu                sync.RWMutex
}

// NewFavoriteService creates a new favorite service.
func NewFavoriteService(configDir string) *FavoriteService {
	svc := &FavoriteService{
		configDir:         configDir,
		collectionFavs:    make(map[string]bool),
		databaseFavOrder:  make([]string, 0),
		databaseFavLookup: make(map[string]bool),
	}
	// Load favorites on startup
	svc.loadFavorites()
	return svc
}

// favoritesFile returns the path to the favorites file.
func (s *FavoriteService) favoritesFile() string {
	return filepath.Join(s.configDir, "favorites.json")
}

// loadFavorites loads favorites from disk.
func (s *FavoriteService) loadFavorites() {
	data, err := os.ReadFile(s.favoritesFile())
	if err != nil {
		if os.IsNotExist(err) {
			s.collectionFavs = make(map[string]bool)
			s.databaseFavOrder = make([]string, 0)
			s.databaseFavLookup = make(map[string]bool)
			return
		}
		fmt.Printf("Warning: failed to load favorites: %v\n", err)
		s.collectionFavs = make(map[string]bool)
		s.databaseFavOrder = make([]string, 0)
		s.databaseFavLookup = make(map[string]bool)
		return
	}

	var stored favoritesData
	if err := json.Unmarshal(data, &stored); err != nil {
		fmt.Printf("Warning: failed to parse favorites: %v\n", err)
		s.collectionFavs = make(map[string]bool)
		s.databaseFavOrder = make([]string, 0)
		s.databaseFavLookup = make(map[string]bool)
		return
	}

	s.collectionFavs = make(map[string]bool, len(stored.Collections))
	for _, k := range stored.Collections {
		s.collectionFavs[k] = true
	}
	s.databaseFavOrder = stored.DatabaseOrder
	if s.databaseFavOrder == nil {
		s.databaseFavOrder = make([]string, 0)
	}
	s.databaseFavLookup = make(map[string]bool, len(s.databaseFavOrder))
	for _, k := range s.databaseFavOrder {
		s.databaseFavLookup[k] = true
	}
}

// persistFavorites saves favorites to disk in the new format.
func (s *FavoriteService) persistFavorites() error {
	collections := make([]string, 0, len(s.collectionFavs))
	for k := range s.collectionFavs {
		collections = append(collections, k)
	}

	data := favoritesData{
		Collections:   collections,
		DatabaseOrder: s.databaseFavOrder,
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.favoritesFile(), jsonData, 0600)
}

// makeKey creates the storage key for a collection favorite.
func makeKey(connID, dbName, collName string) string {
	return connID + ":" + dbName + ":" + collName
}

// makeDatabaseKey creates the storage key for a database favorite.
// Uses "db:" prefix to distinguish from collection favorites.
func makeDatabaseKey(connID, dbName string) string {
	return "db:" + connID + ":" + dbName
}

// =============================================================================
// Collection Favorites
// =============================================================================

// AddFavorite adds a collection to favorites.
func (s *FavoriteService) AddFavorite(connID, dbName, collName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeKey(connID, dbName, collName)
	if s.collectionFavs[key] {
		return nil
	}

	s.collectionFavs[key] = true
	if err := s.persistFavorites(); err != nil {
		return fmt.Errorf("failed to save favorite: %w", err)
	}
	return nil
}

// RemoveFavorite removes a collection from favorites.
func (s *FavoriteService) RemoveFavorite(connID, dbName, collName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeKey(connID, dbName, collName)
	if !s.collectionFavs[key] {
		return nil
	}

	delete(s.collectionFavs, key)
	if err := s.persistFavorites(); err != nil {
		return fmt.Errorf("failed to remove favorite: %w", err)
	}
	return nil
}

// IsFavorite checks if a collection is a favorite.
func (s *FavoriteService) IsFavorite(connID, dbName, collName string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := makeKey(connID, dbName, collName)
	return s.collectionFavs[key]
}

// ListFavorites returns all collection favorite keys.
func (s *FavoriteService) ListFavorites() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keys := make([]string, 0, len(s.collectionFavs))
	for k := range s.collectionFavs {
		keys = append(keys, k)
	}
	return keys
}

// =============================================================================
// Database Favorites (Ordered)
// =============================================================================

// AddDatabaseFavorite adds a database to favorites at the end of the order.
func (s *FavoriteService) AddDatabaseFavorite(connID, dbName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeDatabaseKey(connID, dbName)
	if s.databaseFavLookup[key] {
		return nil
	}

	s.databaseFavOrder = append(s.databaseFavOrder, key)
	s.databaseFavLookup[key] = true
	if err := s.persistFavorites(); err != nil {
		return fmt.Errorf("failed to save database favorite: %w", err)
	}
	return nil
}

// RemoveDatabaseFavorite removes a database from favorites.
func (s *FavoriteService) RemoveDatabaseFavorite(connID, dbName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := makeDatabaseKey(connID, dbName)
	if !s.databaseFavLookup[key] {
		return nil
	}

	// Remove from order slice
	newOrder := make([]string, 0, len(s.databaseFavOrder)-1)
	for _, k := range s.databaseFavOrder {
		if k != key {
			newOrder = append(newOrder, k)
		}
	}
	s.databaseFavOrder = newOrder
	delete(s.databaseFavLookup, key)

	if err := s.persistFavorites(); err != nil {
		return fmt.Errorf("failed to remove database favorite: %w", err)
	}
	return nil
}

// IsDatabaseFavorite checks if a database is a favorite.
func (s *FavoriteService) IsDatabaseFavorite(connID, dbName string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := makeDatabaseKey(connID, dbName)
	return s.databaseFavLookup[key]
}

// ListDatabaseFavorites returns all database favorite keys in their display order.
func (s *FavoriteService) ListDatabaseFavorites() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Return a copy to prevent external modification
	result := make([]string, len(s.databaseFavOrder))
	copy(result, s.databaseFavOrder)
	return result
}

// =============================================================================
// Connection Cleanup
// =============================================================================

// RemoveFavoritesForConnection removes all favorites for a connection.
// This is useful when a connection is deleted.
func (s *FavoriteService) RemoveFavoritesForConnection(connID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Collection favorites use format: "connId:dbName:collName"
	collPrefix := connID + ":"
	// Database favorites use format: "db:connId:dbName"
	dbPrefix := "db:" + connID + ":"

	modified := false

	// Remove collection favorites
	for k := range s.collectionFavs {
		if len(k) > len(collPrefix) && k[:len(collPrefix)] == collPrefix {
			delete(s.collectionFavs, k)
			modified = true
		}
	}

	// Remove database favorites
	newDbOrder := make([]string, 0, len(s.databaseFavOrder))
	for _, k := range s.databaseFavOrder {
		if len(k) > len(dbPrefix) && k[:len(dbPrefix)] == dbPrefix {
			delete(s.databaseFavLookup, k)
			modified = true
		} else {
			newDbOrder = append(newDbOrder, k)
		}
	}
	s.databaseFavOrder = newDbOrder

	if modified {
		return s.persistFavorites()
	}
	return nil
}
