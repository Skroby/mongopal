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
// If savePath is provided, it is used directly; otherwise a save dialog is shown.
func (s *Service) ExportDatabases(connID string, dbNames []string, savePath string) error {
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

	filePath := savePath
	if filePath == "" {
		// Build default filename with connection name, db count and timestamp
		defaultFilename := buildExportFilename(connName, len(dbNames))
		var dlgErr error
		filePath, dlgErr = runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
			DefaultFilename: defaultFilename,
			Title:           "Export Databases",
			Filters: []runtime.FileFilter{
				{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
			},
		})
		if dlgErr != nil {
			return fmt.Errorf("failed to open save dialog: %w", dlgErr)
		}
		if filePath == "" {
			// User cancelled the save dialog - notify frontend
			runtime.EventsEmit(s.state.Ctx, "export:cancelled")
			return nil
		}
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create cancellable context with unique export ID
	exportID := fmt.Sprintf("db-%s-%d", connID, time.Now().UnixNano())
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportID, exportCancel)
	s.state.ResetExportPause() // Reset pause state at start
	defer s.state.ClearExportCancel(exportID)
	defer s.state.ResetExportPause()

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
			s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
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
				ExportID:      exportID,
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
				// Check for pause/cancellation periodically
				if docCount%100 == 0 {
					// Wait if paused (also checks for cancellation)
					if !s.state.WaitIfExportPaused(exportCtx) {
						cancelled = true
						break
					}
					// Also check context directly
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
						ExportID:      exportID,
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

			// Emit final progress for this collection (ensures no jumps between collections)
			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
				Phase:         "exporting",
				Database:      dbName,
				Collection:    collName,
				Current:       docCount,
				Total:         estimatedCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
				ProcessedDocs: processedDocs,
				TotalDocs:     totalDocs,
			})

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
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
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

	// Emit 100% progress before complete
	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "finalizing",
		Database:      "",
		Collection:    "",
		Current:       processedDocs,
		Total:         totalDocs,
		DatabaseIndex: totalDatabases,
		DatabaseTotal: totalDatabases,
		ProcessedDocs: processedDocs,
		TotalDocs:     totalDocs,
	})

	s.state.EmitEvent("export:complete", map[string]interface{}{"exportId": exportID, "filePath": filePath})
	return nil
}

// ExportSelectiveDatabases exports selected collections per database to a zip file.
// dbCollections maps database names to their selected collection names.
func (s *Service) ExportSelectiveDatabases(connID string, dbCollections map[string][]string, savePath string) error {
	if len(dbCollections) == 0 {
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

	filePath := savePath
	if filePath == "" {
		defaultFilename := buildExportFilename(connName, len(dbCollections))
		var dlgErr error
		filePath, dlgErr = runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
			DefaultFilename: defaultFilename,
			Title:           "Export Databases",
			Filters: []runtime.FileFilter{
				{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
			},
		})
		if dlgErr != nil {
			return fmt.Errorf("failed to open save dialog: %w", dlgErr)
		}
		if filePath == "" {
			runtime.EventsEmit(s.state.Ctx, "export:cancelled")
			return nil
		}
	}

	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	exportID := fmt.Sprintf("db-%s-%d", connID, time.Now().UnixNano())
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportID, exportCancel)
	s.state.ResetExportPause()
	defer s.state.ClearExportCancel(exportID)
	defer s.state.ResetExportPause()

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

	// Build ordered list of database names
	var dbNames []string
	for dbName := range dbCollections {
		dbNames = append(dbNames, dbName)
	}
	totalDatabases := len(dbNames)

	// Pre-scan to get total document count for ETA
	var totalDocs int64
	for _, dbName := range dbNames {
		db := client.Database(dbName)
		for _, collName := range dbCollections[dbName] {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			count, _ := db.Collection(collName).EstimatedDocumentCount(ctx)
			totalDocs += count
			cancel()
		}
	}

	var processedDocs int64

	for dbIdx, dbName := range dbNames {
		select {
		case <-exportCtx.Done():
			s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
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

		db := client.Database(dbName)

		for _, collName := range dbCollections[dbName] {
			coll := db.Collection(collName)

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
			cancel()

			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
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
				if docCount%100 == 0 {
					if !s.state.WaitIfExportPaused(exportCtx) {
						cancelled = true
						break
					}
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

				if docCount%1000 == 0 {
					s.state.EmitEvent("export:progress", types.ExportProgress{
						ExportID:      exportID,
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

			processedDocs += docCount

			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
				Phase:         "exporting",
				Database:      dbName,
				Collection:    collName,
				Current:       docCount,
				Total:         estimatedCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
				ProcessedDocs: processedDocs,
				TotalDocs:     totalDocs,
			})

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
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
				zipWriter.Close()
				zipFile.Close()
				os.Remove(filePath)
				return fmt.Errorf("export cancelled")
			}
			docCursor.Close(ctx)
			cancel()

			// Export indexes
			var indexes []bson.M
			ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
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
					if name, ok := idx["name"].(string); ok && name == "_id_" {
						continue
					}
					indexes = append(indexes, idx)
				}
				indexCursor.Close(ctx2)
			}
			cancel2()

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

	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("failed to create manifest: %w", err)
	}
	manifestData, _ := json.MarshalIndent(manifest, "", "  ")
	manifestWriter.Write(manifestData)

	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "finalizing",
		Database:      "",
		Collection:    "",
		Current:       processedDocs,
		Total:         totalDocs,
		DatabaseIndex: totalDatabases,
		DatabaseTotal: totalDatabases,
		ProcessedDocs: processedDocs,
		TotalDocs:     totalDocs,
	})

	s.state.EmitEvent("export:complete", map[string]interface{}{"exportId": exportID, "filePath": filePath})
	return nil
}

// CancelExport cancels all ongoing export operations.
func (s *Service) CancelExport() {
	s.state.CancelExport("") // Empty string cancels all exports
}

// PauseExport pauses the current export operation.
func (s *Service) PauseExport() {
	s.state.PauseExport()
	s.state.EmitEvent("export:paused", nil)
}

// ResumeExport resumes a paused export operation.
func (s *Service) ResumeExport() {
	s.state.ResumeExport()
	s.state.EmitEvent("export:resumed", nil)
}

// IsExportPaused returns whether export is currently paused.
func (s *Service) IsExportPaused() bool {
	return s.state.IsExportPaused()
}
