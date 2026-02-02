// Package database handles MongoDB database and collection operations.
package database

import (
	"fmt"
	"sort"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// Service handles database operations.
type Service struct {
	state *core.AppState
}

// NewService creates a new database service.
func NewService(state *core.AppState) *Service {
	return &Service{state: state}
}

// ListDatabases returns all databases for a connection.
func (s *Service) ListDatabases(connID string) ([]types.DatabaseInfo, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	result, err := client.ListDatabases(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}

	databases := make([]types.DatabaseInfo, 0, len(result.Databases))
	for _, db := range result.Databases {
		databases = append(databases, types.DatabaseInfo{
			Name:       db.Name,
			SizeOnDisk: db.SizeOnDisk,
			Empty:      db.Empty,
		})
	}

	// Sort by name
	sort.Slice(databases, func(i, j int) bool {
		return databases[i].Name < databases[j].Name
	})

	return databases, nil
}

// ListCollections returns all collections in a database.
func (s *Service) ListCollections(connID, dbName string) ([]types.CollectionInfo, error) {
	if err := ValidateDatabaseName(dbName); err != nil {
		return nil, err
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	db := client.Database(dbName)

	// Get collection names and types
	cursor, err := db.ListCollections(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}
	defer cursor.Close(ctx)

	var collections []types.CollectionInfo
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		name, _ := result["name"].(string)
		collType := "collection"
		if t, ok := result["type"].(string); ok {
			collType = t
		}

		// Get document count (skip for views)
		var count int64
		if collType == "collection" {
			count, _ = db.Collection(name).EstimatedDocumentCount(ctx)
		}

		collections = append(collections, types.CollectionInfo{
			Name:  name,
			Type:  collType,
			Count: count,
		})
	}

	// Sort by name
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].Name < collections[j].Name
	})

	return collections, nil
}
