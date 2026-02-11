package importer

import (
	"bufio"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/peternagy/mongopal/internal/types"
)

const csvImportBatchSize = 500

// detectDelimiter reads the first few lines of a file and determines the most
// likely field delimiter by parsing with csv.NewReader for each candidate
// delimiter and picking the one that gives the most consistent field count.
func detectDelimiter(filePath string) (rune, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return ',', fmt.Errorf("failed to open file for delimiter detection: %w", err)
	}
	defer f.Close()

	// Read up to 10 non-empty lines for analysis
	reader := skipBOM(f)
	scanner := bufio.NewScanner(reader)
	var sampleLines []string
	for len(sampleLines) < 10 && scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		sampleLines = append(sampleLines, line)
	}

	if len(sampleLines) == 0 {
		return ',', nil
	}

	candidates := []rune{',', '\t', ';'}
	bestDelim := ','
	bestScore := -1

	for _, c := range candidates {
		// Parse each sample line with csv.NewReader using this delimiter
		var fieldCounts []int
		for _, line := range sampleLines {
			r := csv.NewReader(strings.NewReader(line))
			r.Comma = c
			r.LazyQuotes = true
			fields, err := r.Read()
			if err != nil {
				continue
			}
			fieldCounts = append(fieldCounts, len(fields))
		}

		if len(fieldCounts) == 0 {
			continue
		}

		firstCount := fieldCounts[0]
		// A single field means this delimiter doesn't split the data
		if firstCount <= 1 {
			continue
		}

		consistent := true
		for _, fc := range fieldCounts[1:] {
			if fc != firstCount {
				consistent = false
				break
			}
		}

		score := firstCount
		if !consistent {
			score = score / 2
		}
		if score > bestScore {
			bestScore = score
			bestDelim = c
		}
	}

	return bestDelim, nil
}

// inferType converts a string value to its most likely Go type.
func inferType(value string) interface{} {
	if value == "" {
		return nil
	}

	// Boolean
	lower := strings.ToLower(value)
	if lower == "true" {
		return true
	}
	if lower == "false" {
		return false
	}

	// Integer
	if i, err := strconv.ParseInt(value, 10, 64); err == nil {
		return i
	}

	// Float
	if f, err := strconv.ParseFloat(value, 64); err == nil {
		return f
	}

	// Date/time formats
	dateFormats := []string{
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04:05",
		"2006-01-02",
	}
	for _, layout := range dateFormats {
		if t, err := time.Parse(layout, value); err == nil {
			return primitive.NewDateTimeFromTime(t)
		}
	}

	return value
}

// unflattenDocument converts a flat map with dot-notation keys into a nested bson.M.
// For example, {"address.city": "NY", "name": "John"} becomes
// {"address": {"city": "NY"}, "name": "John"}.
func unflattenDocument(flat map[string]interface{}) bson.M {
	result := bson.M{}
	for key, val := range flat {
		parts := strings.Split(key, ".")
		if len(parts) == 1 {
			result[key] = val
			continue
		}
		// Walk into nested maps, creating intermediate bson.M as needed
		current := result
		for i := 0; i < len(parts)-1; i++ {
			part := parts[i]
			if existing, ok := current[part]; ok {
				if m, ok2 := existing.(bson.M); ok2 {
					current = m
				} else {
					// Conflict: a non-map value already exists at this path.
					// Overwrite with a new map (last writer wins).
					m := bson.M{}
					current[part] = m
					current = m
				}
			} else {
				m := bson.M{}
				current[part] = m
				current = m
			}
		}
		current[parts[len(parts)-1]] = val
	}
	return result
}

// skipBOM returns a reader that skips a UTF-8 BOM (0xEF, 0xBB, 0xBF) if present.
func skipBOM(r io.Reader) io.Reader {
	buf := make([]byte, 3)
	n, err := io.ReadFull(r, buf)
	if err != nil || n < 3 {
		// File shorter than 3 bytes or read error — prepend what we got
		return io.MultiReader(strings.NewReader(string(buf[:n])), r)
	}
	if buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF {
		// BOM found — skip it
		return r
	}
	// Not a BOM — put the bytes back
	return io.MultiReader(strings.NewReader(string(buf[:n])), r)
}

// PreviewCSVFile reads a CSV file and returns header, sample rows, and metadata.
func (s *Service) PreviewCSVFile(opts types.CSVImportPreviewOptions) (*types.CSVImportPreview, error) {
	info, err := os.Stat(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to stat file: %w", err)
	}

	// Detect delimiter
	var delim rune
	if opts.Delimiter != "" {
		delim, _ = utf8.DecodeRuneInString(opts.Delimiter)
		if delim == utf8.RuneError {
			delim = ','
		}
	} else {
		delim, err = detectDelimiter(opts.FilePath)
		if err != nil {
			return nil, err
		}
	}

	maxRows := opts.MaxRows
	if maxRows <= 0 {
		maxRows = 10
	}

	// Open file for reading headers + sample rows
	f, err := os.Open(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(skipBOM(f))
	reader.Comma = delim
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1 // Allow variable field counts

	// Read headers (first row)
	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV headers: %w", err)
	}

	// Read sample rows
	var sampleRows [][]string
	for i := 0; i < maxRows; i++ {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		sampleRows = append(sampleRows, row)
	}

	// Count remaining rows
	var totalRows int64 = int64(len(sampleRows))
	for {
		_, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		totalRows++
	}

	delimStr := string(delim)

	return &types.CSVImportPreview{
		FilePath:   opts.FilePath,
		Headers:    headers,
		SampleRows: sampleRows,
		TotalRows:  totalRows,
		FileSize:   info.Size(),
		Delimiter:  delimStr,
	}, nil
}

// ImportCSV imports a CSV file into a collection.
func (s *Service) ImportCSV(connID, dbName, collName string, opts types.CSVImportOptions) (*types.ImportResult, error) {
	return s.importCSVInternal(connID, dbName, collName, opts, false)
}

// DryRunImportCSV previews what a CSV import would do without modifying data.
func (s *Service) DryRunImportCSV(connID, dbName, collName string, opts types.CSVImportOptions) (*types.ImportResult, error) {
	return s.importCSVInternal(connID, dbName, collName, opts, true)
}

func (s *Service) importCSVInternal(connID, dbName, collName string, opts types.CSVImportOptions, dryRun bool) (*types.ImportResult, error) {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return nil, err
	}

	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
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

	// Detect delimiter
	var delim rune
	if opts.Delimiter != "" {
		delim, _ = utf8.DecodeRuneInString(opts.Delimiter)
		if delim == utf8.RuneError {
			delim = ','
		}
	} else {
		delim, err = detectDelimiter(opts.FilePath)
		if err != nil {
			return nil, err
		}
	}

	// In override mode, drop collection first (unless dry-run)
	if opts.Mode == "override" {
		if dryRun {
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

	// First pass: count total rows for progress reporting
	totalRows, err := countCSVRows(opts.FilePath, delim, opts.HasHeaders)
	if err != nil {
		return nil, err
	}

	if totalRows == 0 {
		collResult.DocumentsInserted = 0
		result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
		return result, nil
	}

	// Re-open file for import
	f, err := os.Open(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(skipBOM(f))
	reader.Comma = delim
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1

	// Determine headers/field names
	var headers []string
	if opts.HasHeaders {
		headers, err = reader.Read()
		if err != nil {
			return nil, fmt.Errorf("failed to read CSV headers: %w", err)
		}
	}
	// FieldNames override takes precedence
	if len(opts.FieldNames) > 0 {
		headers = opts.FieldNames
	}
	// If still no headers, generate field_0, field_1, ...
	// We'll determine the count from the first data row if needed
	generateHeaders := len(headers) == 0

	phase := "importing"
	if dryRun {
		phase = "previewing"
	}

	s.state.EmitEvent("import:progress", types.ImportProgress{
		Phase:           phase,
		Database:        dbName,
		Collection:      collName,
		Current:         0,
		Total:           totalRows,
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

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			collResult.DocumentsParseError++
			processedDocs++
			continue
		}

		// Check for cancellation
		select {
		case <-importCtx.Done():
			_ = flushBatch()
			result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
			result.DocumentsInserted = collResult.DocumentsInserted
			result.DocumentsSkipped = collResult.DocumentsSkipped
			result.DocumentsParseError = collResult.DocumentsParseError
			result.Errors = append(result.Errors, "Import was cancelled")
			return result, fmt.Errorf("import cancelled")
		default:
		}

		if processedDocs%50 == 0 {
			if !s.state.WaitIfImportPaused(importCtx) {
				_ = flushBatch()
				result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
				result.DocumentsInserted = collResult.DocumentsInserted
				result.DocumentsSkipped = collResult.DocumentsSkipped
				result.DocumentsParseError = collResult.DocumentsParseError
				result.Errors = append(result.Errors, "Import was cancelled")
				return result, fmt.Errorf("import cancelled")
			}
		}

		// Generate headers from first data row if needed
		if generateHeaders {
			headers = make([]string, len(record))
			for i := range record {
				headers[i] = fmt.Sprintf("field_%d", i)
			}
			generateHeaders = false
		}

		// Build document from row
		flat := make(map[string]interface{}, len(headers))
		for i, header := range headers {
			var val interface{}
			if i < len(record) {
				if opts.TypeInference {
					val = inferType(record[i])
				} else {
					val = record[i]
				}
			} else {
				val = nil
			}
			flat[header] = val
		}

		doc := unflattenDocument(flat)
		batch = append(batch, doc)
		processedDocs++

		if len(batch) >= csvImportBatchSize {
			if err := flushBatch(); err != nil {
				result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
				result.DocumentsInserted = collResult.DocumentsInserted
				result.DocumentsSkipped = collResult.DocumentsSkipped
				result.DocumentsParseError = collResult.DocumentsParseError
				result.Errors = append(result.Errors, err.Error())
				return result, err
			}
		}

		// Emit progress
		if processedDocs%100 == 0 {
			s.state.EmitEvent("import:progress", types.ImportProgress{
				Phase:           phase,
				Database:        dbName,
				Collection:      collName,
				Current:         processedDocs,
				Total:           totalRows,
				CollectionIndex: 1,
				CollectionTotal: 1,
			})
		}
	}

	// Flush remaining batch
	if err := flushBatch(); err != nil {
		result.Errors = append(result.Errors, err.Error())
	}

	result.Databases[0].Collections = append(result.Databases[0].Collections, collResult)
	result.DocumentsInserted = collResult.DocumentsInserted
	result.DocumentsSkipped = collResult.DocumentsSkipped
	result.DocumentsParseError = collResult.DocumentsParseError

	// Emit completion
	s.state.EmitEvent("import:progress", types.ImportProgress{
		Phase:           phase,
		Database:        dbName,
		Collection:      collName,
		Current:         totalRows,
		Total:           totalRows,
		CollectionIndex: 1,
		CollectionTotal: 1,
	})

	if !dryRun {
		s.state.EmitEvent("import:complete", result)
	}

	return result, nil
}

// countCSVRows counts data rows in a CSV file (excluding the header row if applicable).
func countCSVRows(filePath string, delim rune, hasHeaders bool) (int64, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return 0, fmt.Errorf("failed to open file for row count: %w", err)
	}
	defer f.Close()

	reader := csv.NewReader(skipBOM(f))
	reader.Comma = delim
	reader.LazyQuotes = true
	reader.FieldsPerRecord = -1

	var count int64
	first := true
	for {
		_, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Count malformed rows too (they'll be parse errors)
			count++
			continue
		}
		if first && hasHeaders {
			first = false
			continue // skip header row
		}
		first = false
		count++
	}

	return count, nil
}
