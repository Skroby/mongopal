// Package importer handles MongoDB data import operations.
package importer

import (
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/wailsapp/wails/v2/pkg/runtime"

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

// GetImportFilePath opens a file dialog for selecting import files and returns the chosen path.
func (s *Service) GetImportFilePath() (string, error) {
	filePath, err := runtime.OpenFileDialog(s.state.Ctx, runtime.OpenDialogOptions{
		Title: "Select file to import",
		Filters: []runtime.FileFilter{
			{DisplayName: "Supported Files (*.json, *.ndjson, *.csv, *.tsv, *.zip, *.archive)", Pattern: "*.json;*.ndjson;*.csv;*.tsv;*.zip;*.archive"},
			{DisplayName: "JSON Files (*.json, *.ndjson)", Pattern: "*.json;*.ndjson"},
			{DisplayName: "CSV Files (*.csv, *.tsv)", Pattern: "*.csv;*.tsv"},
			{DisplayName: "ZIP Archives (*.zip)", Pattern: "*.zip"},
			{DisplayName: "MongoDB Archive (*.archive)", Pattern: "*.archive"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open file dialog: %w", err)
	}
	return filePath, nil
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
// Returns inserted count, skipped count, and any fatal error (e.g., connection failure).
func insertBatchSkipDuplicates(coll *mongo.Collection, batch []interface{}) (inserted, skipped int64, err error) {
	if len(batch) == 0 {
		return 0, 0, nil
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	opts := options.InsertMany().SetOrdered(false)
	result, insertErr := coll.InsertMany(ctx, batch, opts)
	if insertErr != nil {
		// Check for bulk write errors (duplicate key errors) - these are recoverable
		if bwe, ok := insertErr.(mongo.BulkWriteException); ok {
			inserted = int64(len(batch) - len(bwe.WriteErrors))
			skipped = int64(len(bwe.WriteErrors))
			return inserted, skipped, nil
		}
		// Other errors are fatal (connection issues, auth failures, etc.)
		return 0, 0, insertErr
	}

	return int64(len(result.InsertedIDs)), 0, nil
}
