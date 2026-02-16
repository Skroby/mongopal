package database

import (
	"fmt"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/bsonutil"
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

	stats.Count = bsonutil.ToInt64(result["count"])
	stats.Size = bsonutil.ToInt64(result["size"])
	stats.StorageSize = bsonutil.ToInt64(result["storageSize"])
	stats.AvgObjSize = bsonutil.ToInt64(result["avgObjSize"])
	stats.IndexCount = bsonutil.ToInt(result["nindexes"])
	stats.TotalIndexSize = bsonutil.ToInt64(result["totalIndexSize"])
	stats.Capped = bsonutil.ToBool(result["capped"])

	return stats, nil
}
