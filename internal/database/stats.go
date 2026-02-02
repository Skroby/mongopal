package database

import (
	"fmt"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// GetCollectionStats returns statistics about a collection.
func (s *Service) GetCollectionStats(connID, dbName, collName string) (*types.CollectionStats, error) {
	if err := ValidateDatabaseAndCollection(dbName, collName); err != nil {
		return nil, err
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	db := client.Database(dbName)

	// Run collStats command
	var result bson.M
	err = db.RunCommand(ctx, bson.D{{Key: "collStats", Value: collName}}).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("failed to get collection stats: %w", err)
	}

	stats := &types.CollectionStats{
		Namespace: fmt.Sprintf("%s.%s", dbName, collName),
	}

	// Parse count
	switch v := result["count"].(type) {
	case int32:
		stats.Count = int64(v)
	case int64:
		stats.Count = v
	case float64:
		stats.Count = int64(v)
	}

	// Parse size
	switch v := result["size"].(type) {
	case int32:
		stats.Size = int64(v)
	case int64:
		stats.Size = v
	case float64:
		stats.Size = int64(v)
	}

	// Parse storageSize
	switch v := result["storageSize"].(type) {
	case int32:
		stats.StorageSize = int64(v)
	case int64:
		stats.StorageSize = v
	case float64:
		stats.StorageSize = int64(v)
	}

	// Parse avgObjSize
	switch v := result["avgObjSize"].(type) {
	case int32:
		stats.AvgObjSize = int64(v)
	case int64:
		stats.AvgObjSize = v
	case float64:
		stats.AvgObjSize = int64(v)
	}

	// Parse nindexes
	switch v := result["nindexes"].(type) {
	case int32:
		stats.IndexCount = int(v)
	case int64:
		stats.IndexCount = int(v)
	case float64:
		stats.IndexCount = int(v)
	}

	// Parse totalIndexSize
	switch v := result["totalIndexSize"].(type) {
	case int32:
		stats.TotalIndexSize = int64(v)
	case int64:
		stats.TotalIndexSize = v
	case float64:
		stats.TotalIndexSize = int64(v)
	}

	// Parse capped
	if capped, ok := result["capped"].(bool); ok {
		stats.Capped = capped
	}

	return stats, nil
}
