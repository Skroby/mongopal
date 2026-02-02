package export

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/peternagy/mongopal/internal/types"
)

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
	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
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
		runtime.EventsEmit(s.state.Ctx, "export:cancelled")
		return nil
	}

	// Ensure .csv extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".csv") {
		filePath += ".csv"
	}

	// Create cancellable context
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportCancel)
	defer s.state.ClearExportCancel()

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

	// Get estimated count for progress
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
	cancel()

	// Emit initial progress
	s.state.EmitEvent("export:progress", types.ExportProgress{
		Phase:      "exporting",
		Database:   dbName,
		Collection: collName,
		Current:    0,
		Total:      estimatedCount,
	})

	// First pass: collect all field names
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return fmt.Errorf("failed to query collection: %w", err)
	}

	allFields := make(map[string]bool)
	var documents []bson.M

	var docCount int64
	for cursor.Next(ctx) {
		// Check for cancellation
		if docCount%100 == 0 {
			select {
			case <-exportCtx.Done():
				cursor.Close(ctx)
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", nil)
				return fmt.Errorf("export cancelled")
			default:
			}

			s.state.EmitEvent("export:progress", types.ExportProgress{
				Phase:      "analyzing",
				Database:   dbName,
				Collection: collName,
				Current:    docCount,
				Total:      estimatedCount,
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
		documents = append(documents, doc)
		docCount++
	}
	cursor.Close(ctx)

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

	// Write documents
	for i, doc := range documents {
		// Check for cancellation
		if i%100 == 0 {
			select {
			case <-exportCtx.Done():
				writer.Flush()
				file.Close()
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", nil)
				return fmt.Errorf("export cancelled")
			default:
			}

			s.state.EmitEvent("export:progress", types.ExportProgress{
				Phase:      "exporting",
				Database:   dbName,
				Collection: collName,
				Current:    int64(i),
				Total:      int64(len(documents)),
			})
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
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return fmt.Errorf("failed to write CSV: %w", err)
	}

	s.state.EmitEvent("export:complete", nil)
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
