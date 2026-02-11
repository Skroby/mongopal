package importer

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/types"
)

const jsonImportBatchSize = 500

// PreviewJSONFile reads file metadata and first document for preview.
func (s *Service) PreviewJSONFile(filePath string) (*types.JSONImportPreview, error) {
	format, err := DetectFileFormat(filePath)
	if err != nil {
		return nil, err
	}
	if format != "ndjson" && format != "jsonarray" {
		return nil, fmt.Errorf("unsupported format: %s (expected JSON or NDJSON)", format)
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	preview := &types.JSONImportPreview{
		FilePath: filePath,
		Format:   format,
		FileSize: info.Size(),
	}

	// Count documents and extract sample
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	if format == "ndjson" {
		scanner := bufio.NewScanner(f)
		scanBuf := make([]byte, 16*1024*1024) // 16MB
		scanner.Buffer(scanBuf, 16*1024*1024)

		var count int64
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			count++
			if count == 1 {
				// Pretty-print sample document
				preview.SampleDoc = prettyJSON(line)
			}
		}
		preview.DocumentCount = count
	} else {
		// JSON array: stream-count
		count, sample, err := countJSONArrayDocs(f)
		if err != nil {
			return nil, err
		}
		preview.DocumentCount = count
		if sample != "" {
			preview.SampleDoc = prettyJSON(sample)
		}
	}

	return preview, nil
}

// ImportJSON imports a JSON/NDJSON file into a collection.
func (s *Service) ImportJSON(connID, dbName, collName string, opts types.JSONImportOptions) (*types.ImportResult, error) {
	return s.importJSONInternal(connID, dbName, collName, opts, false)
}

// DryRunImportJSON previews what will be inserted/skipped without changes.
func (s *Service) DryRunImportJSON(connID, dbName, collName string, opts types.JSONImportOptions) (*types.ImportResult, error) {
	return s.importJSONInternal(connID, dbName, collName, opts, true)
}

func (s *Service) importJSONInternal(connID, dbName, collName string, opts types.JSONImportOptions, dryRun bool) (*types.ImportResult, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}

	format, err := DetectFileFormat(opts.FilePath)
	if err != nil {
		return nil, err
	}
	if format != "ndjson" && format != "jsonarray" {
		return nil, fmt.Errorf("unsupported format: %s (expected JSON or NDJSON)", format)
	}

	db := client.Database(dbName)
	coll := db.Collection(collName)

	// Set up cancellation
	importCtx, importCancel := context.WithCancel(context.Background())
	s.state.SetImportCancel(importCancel)
	defer s.state.ClearImportCancel()

	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{
			{
				Name:        dbName,
				Collections: []types.CollectionImportResult{},
			},
		},
	}

	collResult := types.CollectionImportResult{
		Name: collName,
	}

	// In override mode, drop collection first (unless dry-run)
	if opts.Mode == "override" {
		if dryRun {
			// Count existing docs for dry-run preview
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			count, _ := coll.EstimatedDocumentCount(ctx)
			cancel()
			collResult.CurrentCount = count
			result.DocumentsDropped = count
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			err := coll.Drop(ctx)
			cancel()
			if err != nil {
				return nil, fmt.Errorf("failed to drop collection: %w", err)
			}
		}
	}

	// Count total documents for progress
	f, err := os.Open(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}

	var totalDocs int64
	if format == "ndjson" {
		scanner := bufio.NewScanner(f)
		scanBuf := make([]byte, 16*1024*1024)
		scanner.Buffer(scanBuf, 16*1024*1024)
		for scanner.Scan() {
			if strings.TrimSpace(scanner.Text()) != "" {
				totalDocs++
			}
		}
	} else {
		totalDocs, _, err = countJSONArrayDocs(f)
		if err != nil {
			f.Close()
			return nil, err
		}
	}
	f.Close()

	if totalDocs == 0 {
		collResult.DocumentsInserted = 0
		result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
		return result, nil
	}

	// Re-open file for import
	f, err = os.Open(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	phase := "importing"
	if dryRun {
		phase = "previewing"
	}

	s.state.EmitEvent("import:progress", types.ImportProgress{
		Phase:           phase,
		Database:        dbName,
		Collection:      collName,
		Current:         0,
		Total:           totalDocs,
		CollectionIndex: 1,
		CollectionTotal: 1,
	})

	var processedDocs int64
	var batch []interface{}
	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}
		if dryRun {
			// In dry-run, count existing IDs for skip estimate
			ids := make([]interface{}, len(batch))
			for i, doc := range batch {
				if m, ok := doc.(bson.M); ok {
					ids[i] = m["_id"]
				}
			}
			existing := countExistingIds(coll, ids)
			collResult.DocumentsSkipped += existing
			collResult.DocumentsInserted += int64(len(batch)) - existing
		} else {
			inserted, skipped, err := insertBatchSkipDuplicates(coll, batch)
			if err != nil {
				return err
			}
			collResult.DocumentsInserted += inserted
			collResult.DocumentsSkipped += skipped
		}
		batch = batch[:0]
		return nil
	}

	processDoc := func(jsonBytes []byte) error {
		// Check for cancellation
		select {
		case <-importCtx.Done():
			return fmt.Errorf("import cancelled")
		default:
		}

		if processedDocs%50 == 0 {
			if !s.state.WaitIfImportPaused(importCtx) {
				return fmt.Errorf("import cancelled")
			}
		}

		var doc bson.M
		if err := bson.UnmarshalExtJSON(jsonBytes, true, &doc); err != nil {
			// Try standard JSON as fallback
			if err2 := json.Unmarshal(jsonBytes, &doc); err2 != nil {
				collResult.DocumentsParseError++
				processedDocs++
				return nil // skip malformed doc
			}
		}

		batch = append(batch, doc)
		processedDocs++

		if len(batch) >= jsonImportBatchSize {
			if err := flushBatch(); err != nil {
				return err
			}
		}

		// Emit progress
		if processedDocs%100 == 0 {
			s.state.EmitEvent("import:progress", types.ImportProgress{
				Phase:           phase,
				Database:        dbName,
				Collection:      collName,
				Current:         processedDocs,
				Total:           totalDocs,
				CollectionIndex: 1,
				CollectionTotal: 1,
			})
		}

		return nil
	}

	if format == "ndjson" {
		err = processNDJSON(f, processDoc)
	} else {
		err = processJSONArray(f, processDoc)
	}
	if err != nil {
		// Flush any remaining batch before returning
		_ = flushBatch()
		collResult.DocumentsInserted += 0 // already counted
		result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
		result.DocumentsInserted = collResult.DocumentsInserted
		result.DocumentsSkipped = collResult.DocumentsSkipped
		result.DocumentsParseError = collResult.DocumentsParseError
		if strings.Contains(err.Error(), "cancelled") {
			result.Errors = append(result.Errors, "Import was cancelled")
		} else {
			result.Errors = append(result.Errors, err.Error())
		}
		return result, err
	}

	// Flush remaining batch
	if err := flushBatch(); err != nil {
		result.Errors = append(result.Errors, err.Error())
	}

	collResult.DocumentsInserted += 0 // already counted
	result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
	result.DocumentsInserted = collResult.DocumentsInserted
	result.DocumentsSkipped = collResult.DocumentsSkipped
	result.DocumentsParseError = collResult.DocumentsParseError

	// Emit completion
	s.state.EmitEvent("import:progress", types.ImportProgress{
		Phase:           phase,
		Database:        dbName,
		Collection:      collName,
		Current:         totalDocs,
		Total:           totalDocs,
		CollectionIndex: 1,
		CollectionTotal: 1,
	})

	if !dryRun {
		s.state.EmitEvent("import:complete", result)
	}

	return result, nil
}

// processNDJSON reads NDJSON (one JSON object per line) and calls processDoc for each.
func processNDJSON(r io.Reader, processDoc func([]byte) error) error {
	scanner := bufio.NewScanner(r)
	scanBuf := make([]byte, 16*1024*1024) // 16MB
	scanner.Buffer(scanBuf, 16*1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if err := processDoc([]byte(line)); err != nil {
			return err
		}
	}
	return scanner.Err()
}

// processJSONArray streams a JSON array using json.Decoder's Token() method.
func processJSONArray(r io.Reader, processDoc func([]byte) error) error {
	decoder := json.NewDecoder(r)

	// Read opening token
	t, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("failed to read JSON: %w", err)
	}

	// If it starts with [, it's an array
	if delim, ok := t.(json.Delim); ok && delim == '[' {
		for decoder.More() {
			var raw json.RawMessage
			if err := decoder.Decode(&raw); err != nil {
				return fmt.Errorf("failed to decode JSON element: %w", err)
			}
			if err := processDoc([]byte(raw)); err != nil {
				return err
			}
		}
		// Read closing ]
		_, _ = decoder.Token()
	} else if tok, ok := t.(json.Delim); ok && tok == '{' {
		// Single JSON object — decode as one document
		// Re-seek to start and decode the whole file as one object
		seeker, ok := r.(io.ReadSeeker)
		if !ok {
			return fmt.Errorf("single JSON object requires a seekable reader")
		}
		if _, err := seeker.Seek(0, io.SeekStart); err != nil {
			return fmt.Errorf("failed to seek to start: %w", err)
		}
		var raw json.RawMessage
		dec2 := json.NewDecoder(r)
		if err := dec2.Decode(&raw); err != nil {
			return fmt.Errorf("failed to decode JSON object: %w", err)
		}
		if err := processDoc([]byte(raw)); err != nil {
			return err
		}
	} else {
		return fmt.Errorf("expected JSON array or object, got unexpected token")
	}

	return nil
}

// countJSONArrayDocs counts documents in a JSON array and returns the first doc as sample.
func countJSONArrayDocs(r io.ReadSeeker) (int64, string, error) {
	r.Seek(0, io.SeekStart)
	decoder := json.NewDecoder(r)

	t, err := decoder.Token()
	if err != nil {
		return 0, "", fmt.Errorf("failed to read JSON: %w", err)
	}

	var count int64
	var sample string

	if delim, ok := t.(json.Delim); ok && delim == '[' {
		for decoder.More() {
			var raw json.RawMessage
			if err := decoder.Decode(&raw); err != nil {
				break
			}
			count++
			if count == 1 {
				sample = string(raw)
			}
		}
	} else {
		// Single JSON object
		r.Seek(0, io.SeekStart)
		data, err := io.ReadAll(r)
		if err != nil {
			return 0, "", err
		}
		return 1, string(data), nil
	}

	return count, sample, nil
}

// prettyJSON formats a JSON string with indentation.
func prettyJSON(s string) string {
	var out json.RawMessage
	if json.Unmarshal([]byte(s), &out) != nil {
		return s
	}
	pretty, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return s
	}
	return string(pretty)
}
