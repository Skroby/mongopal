package database

import (
	"fmt"
	"sort"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// DropDatabase drops an entire database.
func (s *Service) DropDatabase(connID, dbName string) error {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	err = client.Database(dbName).Drop(ctx)
	if err != nil {
		return fmt.Errorf("failed to drop database: %w", err)
	}

	return nil
}

// DropCollection drops a collection from a database.
func (s *Service) DropCollection(connID, dbName, collName string) error {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	err = client.Database(dbName).Collection(collName).Drop(ctx)
	if err != nil {
		return fmt.Errorf("failed to drop collection: %w", err)
	}

	return nil
}

// ClearCollection deletes all documents from a collection but keeps the collection.
func (s *Service) ClearCollection(connID, dbName, collName string) error {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	_, err = coll.DeleteMany(ctx, bson.M{})
	if err != nil {
		return fmt.Errorf("failed to clear collection: %w", err)
	}

	return nil
}

// GetCollectionsForExport returns collections with their stats for export selection.
func (s *Service) GetCollectionsForExport(connID, dbName string) ([]types.CollectionExportInfo, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	db := client.Database(dbName)

	// Get database stats
	var result bson.M
	err = db.RunCommand(ctx, bson.D{{Key: "dbStats", Value: 1}}).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("failed to get database stats: %w", err)
	}

	// Get list of collections
	cursor, err := db.ListCollections(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}
	defer cursor.Close(ctx)

	var collections []types.CollectionExportInfo
	for cursor.Next(ctx) {
		var collInfo struct {
			Name string `bson:"name"`
			Type string `bson:"type"`
		}
		if err := cursor.Decode(&collInfo); err != nil {
			continue
		}
		if collInfo.Type == "view" {
			continue // Skip views
		}

		coll := db.Collection(collInfo.Name)
		count, _ := coll.EstimatedDocumentCount(ctx)

		// Get collection stats for size
		var collStats bson.M
		db.RunCommand(ctx, bson.D{{Key: "collStats", Value: collInfo.Name}}).Decode(&collStats)
		var size int64
		if sz, ok := collStats["size"].(int64); ok {
			size = sz
		} else if sz, ok := collStats["size"].(int32); ok {
			size = int64(sz)
		}

		collections = append(collections, types.CollectionExportInfo{
			Name:       collInfo.Name,
			Count:      count,
			SizeOnDisk: size,
		})
	}

	// Sort by name
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].Name < collections[j].Name
	})

	return collections, nil
}
