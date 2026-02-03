package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/peternagy/mongopal/internal/types"
)

// QueryNotFoundError is returned when a saved query is not found.
type QueryNotFoundError struct {
	QueryID string
}

func (e *QueryNotFoundError) Error() string {
	return fmt.Sprintf("saved query not found: %s", e.QueryID)
}

// QueryService handles saved query storage operations.
type QueryService struct {
	configDir string
	queries   []types.SavedQuery
	mu        sync.RWMutex
}

// NewQueryService creates a new query service.
func NewQueryService(configDir string) *QueryService {
	svc := &QueryService{
		configDir: configDir,
		queries:   []types.SavedQuery{},
	}
	// Load queries on startup
	svc.loadQueries()
	return svc
}

// queriesFile returns the path to the saved queries file.
func (s *QueryService) queriesFile() string {
	return filepath.Join(s.configDir, "saved_queries.json")
}

// loadQueries loads saved queries from disk.
func (s *QueryService) loadQueries() {
	data, err := os.ReadFile(s.queriesFile())
	if err != nil {
		if os.IsNotExist(err) {
			s.queries = []types.SavedQuery{}
			return
		}
		// Log error but don't fail
		fmt.Printf("Warning: failed to load saved queries: %v\n", err)
		s.queries = []types.SavedQuery{}
		return
	}
	var queries []types.SavedQuery
	if err := json.Unmarshal(data, &queries); err != nil {
		fmt.Printf("Warning: failed to parse saved queries: %v\n", err)
		s.queries = []types.SavedQuery{}
		return
	}
	s.queries = queries
}

// persistQueries saves queries to disk.
func (s *QueryService) persistQueries() error {
	data, err := json.MarshalIndent(s.queries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.queriesFile(), data, 0600)
}

// SaveQuery creates or updates a saved query.
func (s *QueryService) SaveQuery(query types.SavedQuery) (types.SavedQuery, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()

	// If no ID, this is a new query
	if query.ID == "" {
		query.ID = uuid.New().String()
		query.CreatedAt = now
		query.UpdatedAt = now
		s.queries = append(s.queries, query)
	} else {
		// Update existing query
		found := false
		for i := range s.queries {
			if s.queries[i].ID == query.ID {
				query.CreatedAt = s.queries[i].CreatedAt
				query.UpdatedAt = now
				s.queries[i] = query
				found = true
				break
			}
		}
		if !found {
			return types.SavedQuery{}, &QueryNotFoundError{QueryID: query.ID}
		}
	}

	if err := s.persistQueries(); err != nil {
		return types.SavedQuery{}, fmt.Errorf("failed to save query: %w", err)
	}

	return query, nil
}

// GetQuery returns a saved query by ID.
func (s *QueryService) GetQuery(queryID string) (types.SavedQuery, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, q := range s.queries {
		if q.ID == queryID {
			return q, nil
		}
	}
	return types.SavedQuery{}, &QueryNotFoundError{QueryID: queryID}
}

// ListQueries returns all saved queries, optionally filtered by connection, database, and collection.
func (s *QueryService) ListQueries(connectionID, database, collection string) ([]types.SavedQuery, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]types.SavedQuery, 0)
	for _, q := range s.queries {
		// Apply filters
		if connectionID != "" && q.ConnectionID != connectionID {
			continue
		}
		if database != "" && q.Database != database {
			continue
		}
		if collection != "" && q.Collection != collection {
			continue
		}
		result = append(result, q)
	}
	return result, nil
}

// DeleteQuery removes a saved query.
func (s *QueryService) DeleteQuery(queryID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, q := range s.queries {
		if q.ID == queryID {
			s.queries = append(s.queries[:i], s.queries[i+1:]...)
			return s.persistQueries()
		}
	}
	return &QueryNotFoundError{QueryID: queryID}
}

// DeleteQueriesForConnection removes all saved queries for a connection.
// This is useful when a connection is deleted.
func (s *QueryService) DeleteQueriesForConnection(connectionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	filtered := make([]types.SavedQuery, 0)
	for _, q := range s.queries {
		if q.ConnectionID != connectionID {
			filtered = append(filtered, q)
		}
	}
	s.queries = filtered
	return s.persistQueries()
}
