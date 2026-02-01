// Package export handles MongoDB data export operations.
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

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/storage"
	"github.com/peternagy/mongopal/internal/types"
)

// Service handles export operations.
type Service struct {
	state     *core.AppState
	connStore *storage.ConnectionService
}

// NewService creates a new export service.
func NewService(state *core.AppState, connStore *storage.ConnectionService) *Service {
	return &Service{
		state:     state,
		connStore: connStore,
	}
}

// buildExportFilename creates a filename from connection name, db count and timestamp.
func buildExportFilename(connName string, dbCount int) string {
	// Sanitize connection name for use in filename
	var sanitized strings.Builder
	for _, r := range connName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		} else if r == ' ' {
			sanitized.WriteRune('_')
		}
	}
	name := sanitized.String()

	// Truncate if too long
	if len(name) > 40 {
		name = name[:40]
	}

	// Add timestamp: YYYY-MM-DD_HHMMSS
	timestamp := time.Now().Format("2006-01-02_150405")

	return fmt.Sprintf("%s_%ddb_%s.zip", name, dbCount, timestamp)
}

// ExportDatabases exports selected databases to a zip file.
func (s *Service) ExportDatabases(connID string, dbNames []string) error {
	if len(dbNames) == 0 {
		return fmt.Errorf("no databases selected for export")
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

	// Build default filename with connection name, db count and timestamp
	defaultFilename := buildExportFilename(connName, len(dbNames))
	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Databases",
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
		Databases:  []types.ExportManifestDatabase{},
	}

	totalDatabases := len(dbNames)

	// Pre-scan to get total document count for ETA calculation
	var totalDocs int64
	dbCollections := make(map[string][]string) // dbName -> collection names
	for _, dbName := range dbNames {
		ctx, cancel := core.ContextWithTimeout()
		db := client.Database(dbName)
		cursor, err := db.ListCollections(ctx, bson.D{})
		if err != nil {
			cancel()
			continue
		}
		var collInfos []struct {
			Name string `bson:"name"`
			Type string `bson:"type"`
		}
		if err := cursor.All(ctx, &collInfos); err != nil {
			cursor.Close(ctx)
			cancel()
			continue
		}
		cursor.Close(ctx)

		var collNames []string
		for _, collInfo := range collInfos {
			if collInfo.Type == "view" {
				continue
			}
			collNames = append(collNames, collInfo.Name)
			coll := db.Collection(collInfo.Name)
			count, _ := coll.EstimatedDocumentCount(ctx)
			totalDocs += count
		}
		dbCollections[dbName] = collNames
		cancel()
	}

	var processedDocs int64

	// Export each database
	for dbIdx, dbName := range dbNames {
		// Check for cancellation
		select {
		case <-exportCtx.Done():
			s.state.EmitEvent("export:cancelled", nil)
			// Clean up partial file
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		default:
		}
		dbManifest := types.ExportManifestDatabase{
			Name:        dbName,
			Collections: []types.ExportManifestCollection{},
		}

		// Use pre-scanned collection list
		db := client.Database(dbName)
		collNames := dbCollections[dbName]

		for _, collName := range collNames {
			coll := db.Collection(collName)

			// Get estimated document count for progress
			ctx, cancel := core.ContextWithTimeout()
			estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
			cancel()

			// Emit progress
			s.state.EmitEvent("export:progress", types.ExportProgress{
				Phase:         "exporting",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         estimatedCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
				ProcessedDocs: processedDocs,
				TotalDocs:     totalDocs,
			})

			// Export documents as NDJSON
			ctx, cancel = context.WithTimeout(context.Background(), 5*time.Minute)
			docCursor, err := coll.Find(ctx, bson.D{})
			if err != nil {
				cancel()
				s.state.EmitEvent("export:warning", map[string]interface{}{
					"database":   dbName,
					"collection": collName,
					"error":      fmt.Sprintf("failed to query documents: %v", err),
				})
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
			var skippedDocs int64
			cancelled := false
			for docCursor.Next(ctx) {
				// Check for cancellation periodically
				if docCount%100 == 0 {
					select {
					case <-exportCtx.Done():
						cancelled = true
					default:
					}
				}
				if cancelled {
					break
				}

				var doc bson.M
				if err := docCursor.Decode(&doc); err != nil {
					skippedDocs++
					continue
				}
				jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
				if err != nil {
					skippedDocs++
					continue
				}
				ndjsonWriter.Write(jsonBytes)
				ndjsonWriter.Write([]byte("\n"))
				docCount++

				// Emit progress periodically
				if docCount%1000 == 0 {
					s.state.EmitEvent("export:progress", types.ExportProgress{
						Phase:         "exporting",
						Database:      dbName,
						Collection:    collName,
						Current:       docCount,
						Total:         estimatedCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
						ProcessedDocs: processedDocs + docCount,
						TotalDocs:     totalDocs,
					})
				}
			}

			// Update cumulative processed count
			processedDocs += docCount

			// Emit warning if documents were skipped
			if skippedDocs > 0 {
				s.state.EmitEvent("export:warning", map[string]interface{}{
					"database":   dbName,
					"collection": collName,
					"skipped":    skippedDocs,
					"error":      fmt.Sprintf("%d document(s) could not be exported", skippedDocs),
				})
			}
			if cancelled {
				docCursor.Close(ctx)
				cancel()
				s.state.EmitEvent("export:cancelled", nil)
				zipWriter.Close()
				zipFile.Close()
				os.Remove(filePath)
				return fmt.Errorf("export cancelled")
			}
			docCursor.Close(ctx)
			cancel()

			// Export indexes
			var indexes []bson.M
			ctx2, cancel2 := core.ContextWithTimeout()
			indexCursor, err := coll.Indexes().List(ctx2)
			if err != nil {
				s.state.EmitEvent("export:warning", map[string]interface{}{
					"database":   dbName,
					"collection": collName,
					"error":      fmt.Sprintf("failed to list indexes: %v", err),
				})
			} else {
				for indexCursor.Next(ctx2) {
					var idx bson.M
					if err := indexCursor.Decode(&idx); err != nil {
						continue
					}
					// Skip the _id index (auto-created)
					if name, ok := idx["name"].(string); ok && name == "_id_" {
						continue
					}
					indexes = append(indexes, idx)
				}
				indexCursor.Close(ctx2)
			}
			cancel2()

			// Write indexes.json (even if empty)
			indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
			indexWriter, err := zipWriter.Create(indexPath)
			if err == nil {
				indexData, _ := json.MarshalIndent(indexes, "", "  ")
				indexWriter.Write(indexData)
			}

			dbManifest.Collections = append(dbManifest.Collections, types.ExportManifestCollection{
				Name:       collName,
				DocCount:   docCount,
				IndexCount: len(indexes),
			})
		}

		manifest.Databases = append(manifest.Databases, dbManifest)
	}

	// Write manifest
	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("failed to create manifest: %w", err)
	}
	manifestData, _ := json.MarshalIndent(manifest, "", "  ")
	manifestWriter.Write(manifestData)

	s.state.EmitEvent("export:complete", nil)
	return nil
}

// CancelExport cancels an ongoing export operation.
func (s *Service) CancelExport() {
	cancel := s.state.GetExportCancel()
	if cancel != nil {
		cancel()
	}
}
