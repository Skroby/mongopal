// Package importer handles MongoDB data import operations.
package importer

import (
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/storage"
)

// Service handles import operations.
type Service struct {
	state     *core.AppState
	connStore *storage.ConnectionService
}

// NewService creates a new import service.
func NewService(state *core.AppState, connStore *storage.ConnectionService) *Service {
	return &Service{
		state:     state,
		connStore: connStore,
	}
}

// countExistingIds counts how many of the given IDs exist in the collection.
func countExistingIds(coll *mongo.Collection, ids []interface{}) int64 {
	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	count, err := coll.CountDocuments(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return 0
	}
	return count
}

// insertBatchSkipDuplicates inserts documents, skipping duplicates.
func insertBatchSkipDuplicates(coll *mongo.Collection, batch []interface{}) (inserted, skipped int64) {
	if len(batch) == 0 {
		return 0, 0
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	opts := options.InsertMany().SetOrdered(false)
	result, err := coll.InsertMany(ctx, batch, opts)
	if err != nil {
		// Check for bulk write errors (duplicate key errors)
		if bwe, ok := err.(mongo.BulkWriteException); ok {
			inserted = int64(len(batch) - len(bwe.WriteErrors))
			skipped = int64(len(bwe.WriteErrors))
			return
		}
		// Other error, count all as skipped
		return 0, int64(len(batch))
	}

	return int64(len(result.InsertedIDs)), 0
}
