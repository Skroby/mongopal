package importer

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// PreviewImportFile opens a file dialog and returns info about the databases in the zip.
func (s *Service) PreviewImportFile() (*types.ImportPreview, error) {
	// Open file dialog
	filePath, err := runtime.OpenFileDialog(s.state.Ctx, runtime.OpenDialogOptions{
		Title: "Select Import File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open file dialog: %w", err)
	}
	if filePath == "" {
		return nil, nil // User cancelled
	}

	// Open zip file
	zipReader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest types.ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	if len(manifest.Databases) == 0 {
		return nil, fmt.Errorf("no databases found in archive")
	}

	// Build preview
	preview := &types.ImportPreview{
		FilePath:   filePath,
		ExportedAt: manifest.ExportedAt.Format("2006-01-02 15:04:05"),
		Databases:  make([]types.ImportPreviewDatabase, 0, len(manifest.Databases)),
	}

	for _, db := range manifest.Databases {
		var docCount int64
		for _, coll := range db.Collections {
			docCount += coll.DocCount
		}
		preview.Databases = append(preview.Databases, types.ImportPreviewDatabase{
			Name:            db.Name,
			CollectionCount: len(db.Collections),
			DocumentCount:   docCount,
		})
	}

	return preview, nil
}

// DryRunImport previews what an import would do without making changes.
func (s *Service) DryRunImport(connID string, opts types.ImportOptions) (*types.ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	// Open zip file
	zipReader, err := zip.OpenReader(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest types.ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	// Build selected databases set
	selectedDbs := make(map[string]bool)
	for _, db := range opts.Databases {
		selectedDbs[db] = true
	}

	// Filter manifest databases
	var databasesToCheck []types.ExportManifestDatabase
	for _, db := range manifest.Databases {
		if len(selectedDbs) == 0 || selectedDbs[db.Name] {
			databasesToCheck = append(databasesToCheck, db)
		}
	}

	if len(databasesToCheck) == 0 {
		return nil, fmt.Errorf("no databases selected for import")
	}

	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
		Errors:    []string{},
	}

	// Build a map for quick file lookup
	fileMap := make(map[string]*zip.File)
	for _, f := range zipReader.File {
		fileMap[f.Name] = f
	}

	totalDatabases := len(databasesToCheck)

	// Check each database
	for dbIdx, dbManifest := range databasesToCheck {
		dbName := dbManifest.Name
		db := client.Database(dbName)

		dbResult := types.DatabaseImportResult{
			Name:        dbName,
			Collections: []types.CollectionImportResult{},
		}

		// Emit progress
		s.state.EmitEvent("dryrun:progress", types.ExportProgress{
			Phase:         "analyzing",
			Database:      dbName,
			DatabaseIndex: dbIdx + 1,
			DatabaseTotal: totalDatabases,
		})

		// Override mode: count what currently exists (will be dropped)
		if opts.Mode == "override" {
			// Get list of collections currently in this database
			ctx, cancel := core.ContextWithTimeout()
			collNames, err := db.ListCollectionNames(ctx, bson.M{})
			cancel()
			if err != nil {
				collNames = []string{}
			}

			// Count documents in each current collection
			var dbCurrentTotal int64
			for _, collName := range collNames {
				// Skip system collections
				if strings.HasPrefix(collName, "system.") {
					continue
				}
				ctx, cancel := core.ContextWithTimeout()
				count, err := db.Collection(collName).CountDocuments(ctx, bson.M{})
				cancel()
				if err == nil {
					dbCurrentTotal += count
				}
			}
			dbResult.CurrentCount = dbCurrentTotal
			result.DocumentsDropped += dbCurrentTotal

			// Now add the collections from the archive (what will be inserted)
			for _, collManifest := range dbManifest.Collections {
				// Check if this collection currently exists and get its count
				var currentCount int64
				for _, existingColl := range collNames {
					if existingColl == collManifest.Name {
						ctx, cancel := core.ContextWithTimeout()
						count, err := db.Collection(collManifest.Name).CountDocuments(ctx, bson.M{})
						cancel()
						if err == nil {
							currentCount = count
						}
						break
					}
				}

				collResult := types.CollectionImportResult{
					Name:              collManifest.Name,
					DocumentsInserted: collManifest.DocCount,
					DocumentsSkipped:  0,
					CurrentCount:      currentCount,
				}
				dbResult.Collections = append(dbResult.Collections, collResult)
				result.DocumentsInserted += collManifest.DocCount
			}
			result.Databases = append(result.Databases, dbResult)
			continue
		}

		// Skip mode: check which documents exist
		for _, collManifest := range dbManifest.Collections {
			collName := collManifest.Name
			coll := db.Collection(collName)

			collResult := types.CollectionImportResult{
				Name: collName,
			}

			s.state.EmitEvent("dryrun:progress", types.ExportProgress{
				Phase:         "analyzing",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         collManifest.DocCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
			})

			// Read documents from NDJSON
			ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
			ndjsonFile := fileMap[ndjsonPath]
			if ndjsonFile == nil {
				result.Errors = append(result.Errors, fmt.Sprintf("missing documents file for %s.%s", dbName, collName))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			rc, err := ndjsonFile.Open()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to open documents for %s.%s: %v", dbName, collName, err))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			scanner := bufio.NewScanner(rc)
			const maxScanTokenSize = 16 * 1024 * 1024
			buf := make([]byte, maxScanTokenSize)
			scanner.Buffer(buf, maxScanTokenSize)

			// Collect IDs in batches to check existence
			var ids []interface{}
			var current int64
			const batchSize = 500

			for scanner.Scan() {
				line := scanner.Bytes()
				if len(line) == 0 {
					continue
				}

				var doc bson.M
				if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
					collResult.DocumentsParseError++
					continue
				}

				if id, ok := doc["_id"]; ok {
					ids = append(ids, id)
				}

				current++

				// Check batch
				if len(ids) >= batchSize {
					existing := countExistingIds(coll, ids)
					collResult.DocumentsSkipped += existing
					collResult.DocumentsInserted += int64(len(ids)) - existing
					ids = ids[:0]
				}

				if current%1000 == 0 {
					s.state.EmitEvent("dryrun:progress", types.ExportProgress{
						Phase:         "analyzing",
						Database:      dbName,
						Collection:    collName,
						Current:       current,
						Total:         collManifest.DocCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
					})
				}
			}
			rc.Close()

			// Check remaining IDs
			if len(ids) > 0 {
				existing := countExistingIds(coll, ids)
				collResult.DocumentsSkipped += existing
				collResult.DocumentsInserted += int64(len(ids)) - existing
			}

			result.DocumentsInserted += collResult.DocumentsInserted
			result.DocumentsSkipped += collResult.DocumentsSkipped
			dbResult.Collections = append(dbResult.Collections, collResult)
		}

		result.Databases = append(result.Databases, dbResult)
	}

	s.state.EmitEvent("dryrun:complete", result)
	return result, nil
}

// ImportDatabases imports selected databases from a zip file.
func (s *Service) ImportDatabases(connID string, opts types.ImportOptions) (*types.ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	// Open zip file
	zipReader, err := zip.OpenReader(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest types.ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	// Create cancellable context for the import operation
	importCtx, importCancel := context.WithCancel(context.Background())
	s.state.SetImportCancel(importCancel)
	defer s.state.ClearImportCancel()

	// Filter databases if specified
	selectedDbs := make(map[string]bool)
	if len(opts.Databases) > 0 {
		for _, db := range opts.Databases {
			selectedDbs[db] = true
		}
	}

	// Filter manifest databases
	var databasesToImport []types.ExportManifestDatabase
	for _, db := range manifest.Databases {
		if len(selectedDbs) == 0 || selectedDbs[db.Name] {
			databasesToImport = append(databasesToImport, db)
		}
	}

	if len(databasesToImport) == 0 {
		return nil, fmt.Errorf("no databases selected for import")
	}

	// Calculate total docs for ETA
	var totalDocs int64
	for _, db := range databasesToImport {
		for _, coll := range db.Collections {
			totalDocs += coll.DocCount
		}
	}
	var processedDocs int64

	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
		Errors:    []string{},
	}

	// Build a map for quick file lookup
	fileMap := make(map[string]*zip.File)
	for _, f := range zipReader.File {
		fileMap[f.Name] = f
	}

	totalDatabases := len(databasesToImport)

	// Helper to emit error event with partial results
	emitError := func(errMsg string, failedDb string, failedColl string, dbIdx int) {
		var remaining []string
		for i := dbIdx; i < len(databasesToImport); i++ {
			remaining = append(remaining, databasesToImport[i].Name)
		}
		s.state.EmitEvent("import:error", types.ImportErrorResult{
			Error:              errMsg,
			PartialResult:      *result,
			FailedDatabase:     failedDb,
			FailedCollection:   failedColl,
			RemainingDatabases: remaining,
		})
	}

	// Import each database
	for dbIdx, dbManifest := range databasesToImport {
		// Check for cancellation
		select {
		case <-importCtx.Done():
			s.state.EmitEvent("import:cancelled", result)
			return result, nil
		default:
		}

		dbName := dbManifest.Name
		db := client.Database(dbName)

		// Track per-database results
		dbResult := types.DatabaseImportResult{
			Name:        dbName,
			Collections: []types.CollectionImportResult{},
		}

		// Override mode: drop the database first
		if opts.Mode == "override" {
			s.state.EmitEvent("import:progress", types.ExportProgress{
				Phase:         "dropping",
				Database:      dbName,
				Collection:    "",
				Current:       0,
				Total:         0,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
				ProcessedDocs: processedDocs,
				TotalDocs:     totalDocs,
			})
			ctx, cancel := core.ContextWithTimeout()
			if err := db.Drop(ctx); err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to drop database %s: %v", dbName, err))
			}
			cancel()
		}

		for _, collManifest := range dbManifest.Collections {
			collName := collManifest.Name
			coll := db.Collection(collName)

			// Track per-collection results
			collResult := types.CollectionImportResult{
				Name: collName,
			}

			// Emit progress
			s.state.EmitEvent("import:progress", types.ExportProgress{
				Phase:         "importing",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         collManifest.DocCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
				ProcessedDocs: processedDocs,
				TotalDocs:     totalDocs,
			})

			// Import documents
			ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
			ndjsonFile := fileMap[ndjsonPath]
			if ndjsonFile == nil {
				result.Errors = append(result.Errors, fmt.Sprintf("missing documents file for %s.%s", dbName, collName))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			rc, err := ndjsonFile.Open()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to open documents for %s.%s: %v", dbName, collName, err))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			// Process documents in batches using bufio.Scanner for NDJSON
			scanner := bufio.NewScanner(rc)
			// Increase buffer size for large documents
			const maxScanTokenSize = 16 * 1024 * 1024 // 16MB
			buf := make([]byte, maxScanTokenSize)
			scanner.Buffer(buf, maxScanTokenSize)

			var batch []interface{}
			var current int64
			const batchSize = 100

			cancelled := false
			for scanner.Scan() {
				// Check for cancellation periodically
				if current%100 == 0 {
					select {
					case <-importCtx.Done():
						cancelled = true
					default:
					}
				}
				if cancelled {
					break
				}

				line := scanner.Bytes()
				if len(line) == 0 {
					continue
				}

				var doc bson.M
				if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
					collResult.DocumentsParseError++
					result.DocumentsParseError++
					continue
				}

				// Both modes now just batch insert (override already dropped db, skip uses unordered insert)
				batch = append(batch, doc)
				if len(batch) >= batchSize {
					inserted, skipped, insertErr := insertBatchSkipDuplicates(coll, batch)
					if insertErr != nil {
						// Fatal error - save partial results and emit error event
						collResult.DocumentsInserted += inserted
						collResult.DocumentsSkipped += skipped
						result.DocumentsInserted += inserted
						result.DocumentsSkipped += skipped
						dbResult.Collections = append(dbResult.Collections, collResult)
						result.Databases = append(result.Databases, dbResult)
						emitError(insertErr.Error(), dbName, collName, dbIdx+1)
						return result, insertErr
					}
					collResult.DocumentsInserted += inserted
					collResult.DocumentsSkipped += skipped
					result.DocumentsInserted += inserted
					result.DocumentsSkipped += skipped
					batch = batch[:0]
				}

				current++
				if current%1000 == 0 {
					s.state.EmitEvent("import:progress", types.ExportProgress{
						Phase:         "importing",
						Database:      dbName,
						Collection:    collName,
						Current:       current,
						Total:         collManifest.DocCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
						ProcessedDocs: processedDocs + current,
						TotalDocs:     totalDocs,
					})
				}
			}
			rc.Close()

			// Check if we were cancelled
			if cancelled {
				// Save partial collection result
				dbResult.Collections = append(dbResult.Collections, collResult)
				result.Databases = append(result.Databases, dbResult)
				s.state.EmitEvent("import:cancelled", result)
				return result, nil
			}

			// Insert remaining batch
			if len(batch) > 0 {
				inserted, skipped, insertErr := insertBatchSkipDuplicates(coll, batch)
				if insertErr != nil {
					// Fatal error - save partial results and emit error event
					collResult.DocumentsInserted += inserted
					collResult.DocumentsSkipped += skipped
					result.DocumentsInserted += inserted
					result.DocumentsSkipped += skipped
					dbResult.Collections = append(dbResult.Collections, collResult)
					result.Databases = append(result.Databases, dbResult)
					emitError(insertErr.Error(), dbName, collName, dbIdx+1)
					return result, insertErr
				}
				collResult.DocumentsInserted += inserted
				collResult.DocumentsSkipped += skipped
				result.DocumentsInserted += inserted
				result.DocumentsSkipped += skipped
			}

			// Update cumulative processed count
			processedDocs += current

			dbResult.Collections = append(dbResult.Collections, collResult)

			// Import indexes
			indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
			indexFile := fileMap[indexPath]
			if indexFile != nil {
				rc, err := indexFile.Open()
				if err == nil {
					var indexes []bson.M
					if err := json.NewDecoder(rc).Decode(&indexes); err == nil {
						for _, idx := range indexes {
							// Extract keys and options
							keys, ok := idx["key"].(map[string]interface{})
							if !ok {
								continue
							}

							keyDoc := bson.D{}
							for k, v := range keys {
								// JSON numbers decode as float64, MongoDB expects int32 for sort direction
								if f, ok := v.(float64); ok {
									keyDoc = append(keyDoc, bson.E{Key: k, Value: int32(f)})
								} else {
									keyDoc = append(keyDoc, bson.E{Key: k, Value: v})
								}
							}

							indexOpts := options.Index()
							indexName := ""
							if name, ok := idx["name"].(string); ok {
								indexName = name
								indexOpts.SetName(name)
							}
							if unique, ok := idx["unique"].(bool); ok && unique {
								indexOpts.SetUnique(true)
							}
							if sparse, ok := idx["sparse"].(bool); ok && sparse {
								indexOpts.SetSparse(true)
							}

							ctx, cancel := core.ContextWithTimeout()
							_, indexErr := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
								Keys:    keyDoc,
								Options: indexOpts,
							})
							cancel()
							if indexErr != nil {
								// Track index creation errors instead of silently ignoring
								errMsg := fmt.Sprintf("Failed to create index '%s': %v", indexName, indexErr)
								collResult.IndexErrors = append(collResult.IndexErrors, errMsg)
								result.Errors = append(result.Errors, fmt.Sprintf("[%s.%s] %s", dbName, collName, errMsg))
							}
						}
					}
					rc.Close()
				}
			}
		}

		result.Databases = append(result.Databases, dbResult)
	}

	// Add summary error if there were parse failures
	if result.DocumentsParseError > 0 {
		result.Errors = append(result.Errors, fmt.Sprintf("%d document(s) failed to parse and were skipped", result.DocumentsParseError))
	}

	s.state.EmitEvent("import:complete", result)
	return result, nil
}

// CancelImport cancels an ongoing import operation.
func (s *Service) CancelImport() {
	cancel := s.state.GetImportCancel()
	if cancel != nil {
		cancel()
	}
}
