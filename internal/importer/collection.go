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

// PreviewCollectionsImportFile opens a file dialog and reads the export manifest.
func (s *Service) PreviewCollectionsImportFile() (*types.CollectionsImportPreview, error) {
	// Open file dialog
	filePath, err := runtime.OpenFileDialog(s.state.Ctx, runtime.OpenDialogOptions{
		Title: "Select Export File to Import",
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
	for _, file := range zipReader.File {
		if file.Name == "manifest.json" {
			rc, err := file.Open()
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

	// Build preview with databases and their collections
	preview := &types.CollectionsImportPreview{
		FilePath:   filePath,
		ExportedAt: manifest.ExportedAt.Format("2006-01-02 15:04:05"),
		Databases:  []types.CollectionsImportPreviewDatabase{},
	}

	for _, db := range manifest.Databases {
		dbPreview := types.CollectionsImportPreviewDatabase{
			Name:        db.Name,
			Collections: []types.CollectionsImportPreviewItem{},
		}
		for _, coll := range db.Collections {
			dbPreview.Collections = append(dbPreview.Collections, types.CollectionsImportPreviewItem{
				Name:     coll.Name,
				DocCount: coll.DocCount,
			})
		}
		preview.Databases = append(preview.Databases, dbPreview)
	}

	return preview, nil
}

// DryRunImportCollections previews what an import would do to a single database.
func (s *Service) DryRunImportCollections(connID, dbName string, opts types.ImportOptions) (*types.ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}
	if opts.SourceDatabase == "" {
		return nil, fmt.Errorf("no source database specified")
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

	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
	}

	db := client.Database(dbName)
	dbResult := types.DatabaseImportResult{
		Name:        dbName,
		Collections: []types.CollectionImportResult{},
	}

	// Build set of selected collections for filtering
	selectedColls := make(map[string]bool)
	for _, c := range opts.Collections {
		selectedColls[c] = true
	}

	// Build map of files in zip by collection (only from source database)
	collectionFiles := make(map[string]*zip.File)
	for _, file := range zipReader.File {
		if strings.HasSuffix(file.Name, "/documents.ndjson") {
			parts := strings.Split(file.Name, "/")
			// Path format: dbName/collName/documents.ndjson
			if len(parts) >= 3 {
				sourceDb := parts[0]
				collName := parts[len(parts)-2]
				// Filter by source database
				if sourceDb != opts.SourceDatabase {
					continue
				}
				// Filter by selected collections if specified
				if len(selectedColls) > 0 && !selectedColls[collName] {
					continue
				}
				collectionFiles[collName] = file
			}
		}
	}

	totalCollections := len(collectionFiles)
	collIdx := 0

	for collName, file := range collectionFiles {
		collIdx++
		s.state.EmitEvent("import:progress", types.ImportProgress{
			Phase:           "previewing",
			Database:        dbName,
			Collection:      collName,
			CollectionIndex: collIdx,
			CollectionTotal: totalCollections,
		})

		collResult := types.CollectionImportResult{
			Name: collName,
		}

		coll := db.Collection(collName)

		// Get current document count for override mode
		if opts.Mode == "override" {
			ctx, cancel := core.ContextWithTimeout()
			currentCount, _ := coll.EstimatedDocumentCount(ctx)
			cancel()
			collResult.CurrentCount = currentCount
			dbResult.CurrentCount += currentCount
		}

		// Count documents in the export file and check for existing IDs
		rc, err := file.Open()
		if err != nil {
			continue
		}

		var allIDs []interface{}
		scanner := bufio.NewScanner(rc)
		scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)

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
				allIDs = append(allIDs, id)
			}
		}
		rc.Close()

		// For skip mode, check how many already exist
		if opts.Mode == "skip" {
			existingCount := countExistingIds(coll, allIDs)
			collResult.DocumentsSkipped = existingCount
			collResult.DocumentsInserted = int64(len(allIDs)) - existingCount
		} else {
			// Override mode: all documents will be inserted after drop
			collResult.DocumentsInserted = int64(len(allIDs))
		}

		result.DocumentsInserted += collResult.DocumentsInserted
		result.DocumentsSkipped += collResult.DocumentsSkipped

		dbResult.Collections = append(dbResult.Collections, collResult)
	}

	// Calculate dropped count for override mode
	if opts.Mode == "override" {
		result.DocumentsDropped = dbResult.CurrentCount
	}

	result.Databases = append(result.Databases, dbResult)
	return result, nil
}

// ImportCollections imports collections from a zip file into a single database.
func (s *Service) ImportCollections(connID, dbName string, opts types.ImportOptions) (*types.ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}
	if opts.SourceDatabase == "" {
		return nil, fmt.Errorf("no source database specified")
	}

	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	filePath := opts.FilePath

	// Open zip file
	zipReader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Create cancellable context
	importCtx, importCancel := context.WithCancel(context.Background())
	s.state.SetImportCancel(importCancel)
	defer s.state.ClearImportCancel()

	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
	}

	db := client.Database(dbName)
	dbResult := types.DatabaseImportResult{
		Name:        dbName,
		Collections: []types.CollectionImportResult{},
	}

	// Build set of selected collections for filtering
	selectedColls := make(map[string]bool)
	for _, c := range opts.Collections {
		selectedColls[c] = true
	}

	// Build map of files in zip by collection
	type collFiles struct {
		docs    *zip.File
		indexes *zip.File
	}
	collections := make(map[string]*collFiles)

	for _, file := range zipReader.File {
		parts := strings.Split(file.Name, "/")
		if len(parts) >= 2 {
			collName := parts[len(parts)-2]
			// Filter by selected collections if specified
			if len(selectedColls) > 0 && !selectedColls[collName] {
				continue
			}
			if collections[collName] == nil {
				collections[collName] = &collFiles{}
			}
			if strings.HasSuffix(file.Name, "/documents.ndjson") {
				collections[collName].docs = file
			} else if strings.HasSuffix(file.Name, "/indexes.json") {
				collections[collName].indexes = file
			}
		}
	}

	totalCollections := len(collections)
	collIdx := 0
	cancelled := false

	for collName, files := range collections {
		// Check for cancellation
		select {
		case <-importCtx.Done():
			cancelled = true
		default:
		}
		if cancelled {
			break
		}

		collIdx++
		collResult := types.CollectionImportResult{
			Name: collName,
		}

		coll := db.Collection(collName)

		// For override mode, drop the collection first
		if opts.Mode == "override" {
			ctx, cancel := core.ContextWithTimeout()
			coll.Drop(ctx)
			cancel()
		}

		// Import documents
		if files.docs != nil {
			s.state.EmitEvent("import:progress", types.ImportProgress{
				Phase:           "importing",
				Database:        dbName,
				Collection:      collName,
				CollectionIndex: collIdx,
				CollectionTotal: totalCollections,
			})

			rc, err := files.docs.Open()
			if err != nil {
				continue
			}

			scanner := bufio.NewScanner(rc)
			scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)

			var batch []interface{}
			const batchSize = 1000
			var docCount int64

			for scanner.Scan() {
				// Check for cancellation
				if docCount%100 == 0 {
					select {
					case <-importCtx.Done():
						cancelled = true
					default:
					}
					if cancelled {
						break
					}
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
				batch = append(batch, doc)
				docCount++

				if len(batch) >= batchSize {
					if opts.Mode == "skip" {
						inserted, skipped := insertBatchSkipDuplicates(coll, batch)
						collResult.DocumentsInserted += inserted
						collResult.DocumentsSkipped += skipped
					} else {
						ctx, cancel := core.ContextWithTimeout()
						res, err := coll.InsertMany(ctx, batch, options.InsertMany().SetOrdered(false))
						cancel()
						if err == nil && res != nil {
							collResult.DocumentsInserted += int64(len(res.InsertedIDs))
						}
					}
					batch = batch[:0]

					s.state.EmitEvent("import:progress", types.ImportProgress{
						Phase:           "importing",
						Database:        dbName,
						Collection:      collName,
						Current:         docCount,
						CollectionIndex: collIdx,
						CollectionTotal: totalCollections,
					})
				}
			}
			rc.Close()

			// Insert remaining batch
			if len(batch) > 0 && !cancelled {
				if opts.Mode == "skip" {
					inserted, skipped := insertBatchSkipDuplicates(coll, batch)
					collResult.DocumentsInserted += inserted
					collResult.DocumentsSkipped += skipped
				} else {
					ctx, cancel := core.ContextWithTimeout()
					res, err := coll.InsertMany(ctx, batch, options.InsertMany().SetOrdered(false))
					cancel()
					if err == nil && res != nil {
						collResult.DocumentsInserted += int64(len(res.InsertedIDs))
					}
				}
			}
		}

		// Import indexes
		if files.indexes != nil && !cancelled {
			rc, err := files.indexes.Open()
			if err == nil {
				var indexes []bson.M
				json.NewDecoder(rc).Decode(&indexes)
				rc.Close()

				for _, idx := range indexes {
					keys, ok := idx["key"].(map[string]interface{})
					if !ok {
						continue
					}
					// Convert keys to bson.D with proper int32 values
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
					// Add options if present
					if name, ok := idx["name"].(string); ok {
						indexOpts.SetName(name)
					}
					if unique, ok := idx["unique"].(bool); ok && unique {
						indexOpts.SetUnique(true)
					}
					if sparse, ok := idx["sparse"].(bool); ok && sparse {
						indexOpts.SetSparse(true)
					}
					ctx, cancel := core.ContextWithTimeout()
					coll.Indexes().CreateOne(ctx, mongo.IndexModel{
						Keys:    keyDoc,
						Options: indexOpts,
					})
					cancel()
				}
			}
		}

		result.DocumentsInserted += collResult.DocumentsInserted
		result.DocumentsSkipped += collResult.DocumentsSkipped
		dbResult.Collections = append(dbResult.Collections, collResult)
	}

	result.Databases = append(result.Databases, dbResult)

	// Add summary error if there were parse failures
	if result.DocumentsParseError > 0 {
		result.Errors = append(result.Errors, fmt.Sprintf("%d document(s) failed to parse and were skipped", result.DocumentsParseError))
	}

	if cancelled {
		s.state.EmitEvent("import:cancelled", result)
		return result, fmt.Errorf("import cancelled")
	}

	s.state.EmitEvent("import:complete", result)
	return result, nil
}
