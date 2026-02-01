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

// ListIndexes returns all indexes for a collection.
func (s *Service) ListIndexes(connID, dbName, collName string) ([]types.IndexInfo, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list indexes: %w", err)
	}
	defer cursor.Close(ctx)

	var indexes []types.IndexInfo
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		name, _ := result["name"].(string)
		unique, _ := result["unique"].(bool)
		sparse, _ := result["sparse"].(bool)

		keys := make(map[string]int)
		if keyDoc, ok := result["key"].(bson.M); ok {
			for k, v := range keyDoc {
				if intVal, ok := v.(int32); ok {
					keys[k] = int(intVal)
				} else if intVal, ok := v.(int64); ok {
					keys[k] = int(intVal)
				} else if intVal, ok := v.(float64); ok {
					keys[k] = int(intVal)
				}
			}
		}

		indexes = append(indexes, types.IndexInfo{
			Name:   name,
			Keys:   keys,
			Unique: unique,
			Sparse: sparse,
		})
	}

	return indexes, nil
}
