package export

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	goruntime "runtime"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/peternagy/mongopal/internal/types"
)

// GetCSVSavePath opens a save dialog and returns the selected file path.
func (s *Service) GetCSVSavePath(defaultFilename string) (string, error) {
	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Save CSV File",
		Filters: []runtime.FileFilter{
			{DisplayName: "CSV Files (*.csv)", Pattern: "*.csv"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return "", nil // User cancelled
	}
	// Ensure .csv extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".csv") {
		filePath += ".csv"
	}
	return filePath, nil
}

// RevealInFinder opens the OS file manager and selects the specified file.
func (s *Service) RevealInFinder(filePath string) error {
	if filePath == "" {
		return fmt.Errorf("file path is required")
	}

	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "darwin":
		// macOS: open Finder and select the file
		cmd = exec.Command("open", "-R", filePath)
	case "windows":
		// Windows: open Explorer and select the file
		cmd = exec.Command("explorer", "/select,", filePath)
	case "linux":
		// Linux: try to open the containing directory
		// Different file managers have different commands, fallback to xdg-open on directory
		dir := filePath
		if idx := strings.LastIndex(filePath, "/"); idx > 0 {
			dir = filePath[:idx]
		}
		cmd = exec.Command("xdg-open", dir)
	default:
		return fmt.Errorf("unsupported operating system: %s", goruntime.GOOS)
	}

	return cmd.Start()
}

// ExportCollectionAsCSV exports a collection to a CSV file.
func (s *Service) ExportCollectionAsCSV(connID, dbName, collName, defaultFilename string, opts types.CSVExportOptions) error {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	// Set defaults
	delimiter := opts.Delimiter
	if delimiter == "" {
		delimiter = ","
	}
	if len(delimiter) != 1 {
		return fmt.Errorf("delimiter must be a single character")
	}

	// Use pre-selected file path or open save dialog
	filePath := opts.FilePath
	if filePath == "" {
		// Build default filename if not provided
		if defaultFilename == "" {
			safeName := sanitizeFilename(collName)
			if len(safeName) > 30 {
				safeName = safeName[:30]
			}
			timestamp := time.Now().Format("2006-01-02")
			defaultFilename = fmt.Sprintf("%s_%s.csv", safeName, timestamp)
		}

		// Open save dialog
		var err error
		filePath, err = runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
			DefaultFilename: defaultFilename,
			Title:           "Export Collection as CSV",
			Filters: []runtime.FileFilter{
				{DisplayName: "CSV Files (*.csv)", Pattern: "*.csv"},
			},
		})
		if err != nil {
			return fmt.Errorf("failed to open save dialog: %w", err)
		}
		if filePath == "" {
			runtime.EventsEmit(s.state.Ctx, "export:cancelled", map[string]interface{}{"database": dbName, "collection": collName})
			return nil
		}
	}

	// Ensure .csv extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".csv") {
		filePath += ".csv"
	}

	// Create cancellable context with unique export ID
	exportID := fmt.Sprintf("csv-%s-%s-%d", dbName, collName, time.Now().UnixNano())
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportID, exportCancel)
	defer s.state.ClearExportCancel(exportID)

	// Create file
	file, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	// Parse filter
	var filter bson.M
	if opts.Filter == "" || opts.Filter == "{}" {
		filter = bson.M{}
	} else {
		if err := bson.UnmarshalExtJSON([]byte(opts.Filter), true, &filter); err != nil {
			return fmt.Errorf("invalid filter: %w", err)
		}
	}

	db := client.Database(dbName)
	coll := db.Collection(collName)

	// Get estimated count for progress (used only until we know actual count)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
	cancel()
	if estimatedCount == 0 {
		estimatedCount = 100 // Avoid division by zero, show indeterminate progress
	}

	// Use percentage-based progress: 0-80% download, 80-100% write
	// Send Current/Total as percentage * 100 to avoid floating point issues
	const totalProgress int64 = 10000 // 100.00%

	// Emit initial progress
	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "downloading",
		Database:      dbName,
		Collection:    collName,
		Current:       0,
		Total:         totalProgress,
		ProcessedDocs: 0,
	})

	// Create temp file for streaming - download from MongoDB once, then read locally for CSV
	tempDir := os.TempDir()
	tempFile, err := os.CreateTemp(tempDir, "mongopal-csv-*.ndjson")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath) // Clean up temp file when done

	// Single pass: stream MongoDB → temp file while collecting field names
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		tempFile.Close()
		return fmt.Errorf("failed to query collection: %w", err)
	}

	allFields := make(map[string]bool)
	tempWriter := bufio.NewWriter(tempFile)

	var docCount int64
	for cursor.Next(ctx) {
		// Check for pause/cancellation periodically
		if docCount%100 == 0 {
			// Wait if paused (also checks for cancellation)
			if !s.state.WaitIfExportPaused(exportCtx) {
				cursor.Close(ctx)
				tempWriter.Flush()
				tempFile.Close()
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			}
			// Also check context directly
			select {
			case <-exportCtx.Done():
				cursor.Close(ctx)
				tempWriter.Flush()
				tempFile.Close()
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			default:
			}

			// Progress: downloading is 0-80% of total
			// Calculate percentage: (docCount / estimatedCount) * 80%, capped at 80%
			downloadPct := (docCount * 8000) / estimatedCount // 0-8000 (0-80.00%)
			if downloadPct > 8000 {
				downloadPct = 8000
			}
			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
				Phase:         "downloading",
				Database:      dbName,
				Collection:    collName,
				Current:       downloadPct,
				Total:         totalProgress,
				ProcessedDocs: docCount, // Actual document count for display
			})
		}

		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}

		// Collect all fields (flattened)
		flatDoc := flattenDocument(doc, "")
		for field := range flatDoc {
			allFields[field] = true
		}

		// Write document to temp file as JSON line
		jsonBytes, err := json.Marshal(doc)
		if err != nil {
			continue
		}
		tempWriter.Write(jsonBytes)
		tempWriter.WriteByte('\n')

		docCount++
	}
	cursor.Close(ctx)
	tempWriter.Flush()
	tempFile.Close()
	totalDocs := docCount
	if totalDocs == 0 {
		totalDocs = 1 // Avoid division by zero for empty collections
	}

	// Emit 80% progress - download complete, starting CSV write
	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "writing",
		Database:      dbName,
		Collection:    collName,
		Current:       8000, // 80.00%
		Total:         totalProgress,
		ProcessedDocs: totalDocs, // All docs downloaded
	})

	// Sort fields for consistent output (_id first)
	fields := make([]string, 0, len(allFields))
	for field := range allFields {
		fields = append(fields, field)
	}
	sort.Slice(fields, func(i, j int) bool {
		// _id should be first
		if fields[i] == "_id" {
			return true
		}
		if fields[j] == "_id" {
			return false
		}
		return fields[i] < fields[j]
	})

	// Create CSV writer
	writer := csv.NewWriter(file)
	writer.Comma = rune(delimiter[0])

	// Write header
	if opts.IncludeHeaders {
		if err := writer.Write(fields); err != nil {
			return fmt.Errorf("failed to write header: %w", err)
		}
	}

	// Second pass: read from temp file (local disk) and write to CSV
	tempReadFile, err := os.Open(tempPath)
	if err != nil {
		return fmt.Errorf("failed to open temp file for reading: %w", err)
	}
	defer tempReadFile.Close()

	scanner := bufio.NewScanner(tempReadFile)
	// Increase buffer for large documents
	const maxScanTokenSize = 16 * 1024 * 1024 // 16MB
	buf := make([]byte, maxScanTokenSize)
	scanner.Buffer(buf, maxScanTokenSize)

	var exportedCount int64
	for scanner.Scan() {
		// Check for pause/cancellation periodically
		if exportedCount%100 == 0 {
			// Wait if paused (also checks for cancellation)
			if !s.state.WaitIfExportPaused(exportCtx) {
				writer.Flush()
				file.Close()
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			}
			// Also check context directly
			select {
			case <-exportCtx.Done():
				writer.Flush()
				file.Close()
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			default:
			}

			// Progress: writing is 80-100% of total (20% of work)
			// Calculate: 80% + (exportedCount / totalDocs) * 20%
			writePct := 8000 + (exportedCount*2000)/totalDocs // 8000-10000 (80-100%)
			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
				Phase:         "writing",
				Database:      dbName,
				Collection:    collName,
				Current:       writePct,
				Total:         totalProgress,
				ProcessedDocs: totalDocs, // Total docs (download complete, now writing)
			})
		}

		var doc bson.M
		if err := json.Unmarshal(scanner.Bytes(), &doc); err != nil {
			continue
		}

		flatDoc := flattenDocument(doc, "")
		row := make([]string, len(fields))

		for j, field := range fields {
			if val, ok := flatDoc[field]; ok {
				row[j] = formatCSVValue(val, opts.FlattenArrays)
			}
		}

		if err := writer.Write(row); err != nil {
			continue
		}
		exportedCount++
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return fmt.Errorf("failed to write CSV: %w", err)
	}

	// Emit 100% progress before complete
	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "writing",
		Database:      dbName,
		Collection:    collName,
		Current:       totalProgress, // 100.00%
		Total:         totalProgress,
		ProcessedDocs: totalDocs,
	})

	s.state.EmitEvent("export:complete", map[string]interface{}{
		"exportId":   exportID,
		"filePath":   filePath,
		"database":   dbName,
		"collection": collName,
	})
	return nil
}

// flattenDocument converts a nested document to a flat map with dot notation keys.
func flattenDocument(doc bson.M, prefix string) map[string]interface{} {
	result := make(map[string]interface{})

	for key, value := range doc {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		switch v := value.(type) {
		case bson.M:
			// Recursively flatten nested documents
			nested := flattenDocument(v, fullKey)
			for k, val := range nested {
				result[k] = val
			}
		default:
			result[fullKey] = value
		}
	}

	return result
}

// formatCSVValue converts a value to a CSV-safe string representation.
func formatCSVValue(value interface{}, flattenArrays bool) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return v
	case primitive.ObjectID:
		return v.Hex()
	case primitive.DateTime:
		return v.Time().Format(time.RFC3339)
	case time.Time:
		return v.Format(time.RFC3339)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case int, int32, int64, float32, float64:
		return fmt.Sprintf("%v", v)
	case primitive.Binary:
		// Return base64 representation
		return fmt.Sprintf("Binary(%02x)", v.Subtype)
	case bson.A:
		return formatArray(v, flattenArrays)
	case []interface{}:
		return formatArray(v, flattenArrays)
	default:
		// For complex types, return JSON representation
		bytes, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(bytes)
	}
}

// formatArray formats an array value for CSV.
func formatArray(arr interface{}, flatten bool) string {
	var items []string

	switch v := arr.(type) {
	case bson.A:
		for _, item := range v {
			items = append(items, formatCSVValue(item, flatten))
		}
	case []interface{}:
		for _, item := range v {
			items = append(items, formatCSVValue(item, flatten))
		}
	default:
		return fmt.Sprintf("%v", arr)
	}

	if flatten {
		return strings.Join(items, ";")
	}

	// Return as JSON array
	bytes, _ := json.Marshal(items)
	return string(bytes)
}
