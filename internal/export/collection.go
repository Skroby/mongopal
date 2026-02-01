package export

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/types"
)

// sanitizeFilename converts a string to a safe filename component.
func sanitizeFilename(name string) string {
	var sanitized strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		} else if r == ' ' {
			sanitized.WriteRune('_')
		}
	}
	return sanitized.String()
}

// ExportCollections exports selected collections from a single database to a zip file.
func (s *Service) ExportCollections(connID, dbName string, collNames []string) error {
	if len(collNames) == 0 {
		return fmt.Errorf("no collections selected for export")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	// Get connection name for filename
	connName := "export"
	if conn, err := s.connStore.GetSavedConnection(connID); err == nil {
		connName = conn.Name
	}

	// Build default filename
	safeName := sanitizeFilename(connName)
	if len(safeName) > 20 {
		safeName = safeName[:20]
	}
	safeDbName := sanitizeFilename(dbName)
	if len(safeDbName) > 20 {
		safeDbName = safeDbName[:20]
	}
	timestamp := time.Now().Format("2006-01-02")
	defaultFilename := fmt.Sprintf("%s-%s-%dc-%s.zip", safeName, safeDbName, len(collNames), timestamp)

	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Collections",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		// User cancelled the save dialog - notify frontend
		runtime.EventsEmit(s.state.Ctx, "export:cancelled")
		return nil
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create cancellable context for the export operation
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportCancel)
	defer s.state.ClearExportCancel()

	// Create zip file
	zipFile, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	manifest := types.ExportManifest{
		Version:    "1.0",
		ExportedAt: time.Now(),
		Databases: []types.ExportManifestDatabase{
			{
				Name:        dbName,
				Collections: []types.ExportManifestCollection{},
			},
		},
	}

	db := client.Database(dbName)
	totalCollections := len(collNames)

	// Pre-scan to get total document count for ETA calculation
	var totalDocs int64
	collEstimates := make(map[string]int64)
	for _, collName := range collNames {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		coll := db.Collection(collName)
		count, _ := coll.EstimatedDocumentCount(ctx)
		collEstimates[collName] = count
		totalDocs += count
		cancel()
	}

	var processedDocs int64

	// Export each collection
	for collIdx, collName := range collNames {
		// Check for cancellation
		select {
		case <-exportCtx.Done():
			s.state.EmitEvent("export:cancelled", nil)
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		default:
		}

		coll := db.Collection(collName)
		estimatedCount := collEstimates[collName]

		// Emit progress
		s.state.EmitEvent("export:progress", types.ExportProgress{
			Phase:           "exporting",
			Database:        dbName,
			Collection:      collName,
			Current:         0,
			Total:           estimatedCount,
			CollectionIndex: collIdx + 1,
			CollectionTotal: totalCollections,
			ProcessedDocs:   processedDocs,
			TotalDocs:       totalDocs,
		})

		// Export documents as NDJSON
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		docCursor, err := coll.Find(ctx, bson.D{})
		if err != nil {
			cancel()
			continue
		}

		ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
		ndjsonWriter, err := zipWriter.Create(ndjsonPath)
		if err != nil {
			docCursor.Close(ctx)
			cancel()
			continue
		}

		var docCount int64
		cancelled := false
		for docCursor.Next(ctx) {
			// Check for cancellation periodically
			if docCount%100 == 0 {
				select {
				case <-exportCtx.Done():
					cancelled = true
				default:
				}
				if cancelled {
					break
				}

				// Emit progress update
				s.state.EmitEvent("export:progress", types.ExportProgress{
					Phase:           "exporting",
					Database:        dbName,
					Collection:      collName,
					Current:         docCount,
					Total:           estimatedCount,
					CollectionIndex: collIdx + 1,
					CollectionTotal: totalCollections,
					ProcessedDocs:   processedDocs + docCount,
					TotalDocs:       totalDocs,
				})
			}

			var doc bson.M
			if err := docCursor.Decode(&doc); err != nil {
				continue
			}

			// Marshal as Extended JSON
			jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
			if err != nil {
				continue
			}
			ndjsonWriter.Write(jsonBytes)
			ndjsonWriter.Write([]byte("\n"))
			docCount++
		}
		docCursor.Close(ctx)
		cancel()

		// Update cumulative processed count
		processedDocs += docCount

		if cancelled {
			s.state.EmitEvent("export:cancelled", nil)
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		}

		// Export indexes
		ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
		indexCursor, err := coll.Indexes().List(ctx)
		if err == nil {
			var indexes []bson.M
			indexCursor.All(ctx, &indexes)

			// Filter out _id index
			var exportIndexes []bson.M
			for _, idx := range indexes {
				if name, ok := idx["name"].(string); ok && name != "_id_" {
					exportIndexes = append(exportIndexes, idx)
				}
			}

			if len(exportIndexes) > 0 {
				indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
				indexWriter, err := zipWriter.Create(indexPath)
				if err == nil {
					indexBytes, _ := json.MarshalIndent(exportIndexes, "", "  ")
					indexWriter.Write(indexBytes)
				}
			}
		}
		cancel()

		manifest.Databases[0].Collections = append(manifest.Databases[0].Collections, types.ExportManifestCollection{
			Name:     collName,
			DocCount: docCount,
		})
	}

	// Write manifest
	manifestWriter, err := zipWriter.Create("manifest.json")
	if err == nil {
		manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
		manifestWriter.Write(manifestBytes)
	}

	s.state.EmitEvent("export:complete", nil)
	return nil
}
