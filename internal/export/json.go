package export

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"go.mongodb.org/mongo-driver/bson"

	"github.com/peternagy/mongopal/internal/types"
)

// GetJSONSavePath opens a save dialog and returns the selected file path.
func (s *Service) GetJSONSavePath(defaultFilename string) (string, error) {
	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Save JSON File",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return "", nil // User cancelled
	}
	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		filePath += ".json"
	}
	return filePath, nil
}

// ExportCollectionAsJSON exports a collection to a JSON file (NDJSON or JSON array).
func (s *Service) ExportCollectionAsJSON(connID, dbName, collName, defaultFilename string, opts types.JSONExportOptions) error {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return err
	}

	// Use pre-selected file path or open save dialog
	filePath := opts.FilePath
	if filePath == "" {
		if defaultFilename == "" {
			safeName := sanitizeFilename(collName)
			if len(safeName) > 30 {
				safeName = safeName[:30]
			}
			timestamp := time.Now().Format("2006-01-02")
			defaultFilename = fmt.Sprintf("%s_%s.json", safeName, timestamp)
		}

		var err error
		filePath, err = runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
			DefaultFilename: defaultFilename,
			Title:           "Export Collection as JSON",
			Filters: []runtime.FileFilter{
				{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
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

	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		filePath += ".json"
	}

	// Create cancellable context
	exportID := fmt.Sprintf("json-%s-%s-%d", dbName, collName, time.Now().UnixNano())
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportID, exportCancel)
	s.state.ResetExportPause()
	defer s.state.ClearExportCancel(exportID)
	defer s.state.ResetExportPause()

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
	if estimatedCount == 0 {
		estimatedCount = 100
	}

	const totalProgress int64 = 10000 // 100.00%

	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "downloading",
		Database:      dbName,
		Collection:    collName,
		Current:       0,
		Total:         totalProgress,
		ProcessedDocs: 0,
	})

	// Query documents
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cursor, err := coll.Find(ctx, filter)
	if err != nil {
		return fmt.Errorf("failed to query collection: %w", err)
	}
	defer cursor.Close(ctx)

	writer := bufio.NewWriter(file)
	defer writer.Flush()

	indent := ""
	if opts.Pretty {
		indent = "  "
	}

	if opts.Array {
		writer.WriteString("[\n")
	}

	var docCount int64
	var skipCount int64
	for cursor.Next(ctx) {
		// Check for pause/cancellation
		if docCount%100 == 0 {
			if !s.state.WaitIfExportPaused(exportCtx) {
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			}
			select {
			case <-exportCtx.Done():
				os.Remove(filePath)
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID, "database": dbName, "collection": collName})
				return fmt.Errorf("export cancelled")
			default:
			}

			pct := (docCount * 9500) / estimatedCount
			if pct > 9500 {
				pct = 9500
			}
			s.state.EmitEvent("export:progress", types.ExportProgress{
				ExportID:      exportID,
				Phase:         "downloading",
				Database:      dbName,
				Collection:    collName,
				Current:       pct,
				Total:         totalProgress,
				ProcessedDocs: docCount,
			})
		}

		var raw bson.Raw
		if err := cursor.Decode(&raw); err != nil {
			skipCount++
			continue
		}

		// Convert to canonical Extended JSON
		jsonBytes, err := bson.MarshalExtJSON(raw, true, false)
		if err != nil {
			skipCount++
			continue
		}

		if opts.Array && docCount > 0 {
			writer.WriteString(",\n")
		}

		if opts.Pretty {
			// Pretty-print: indent the JSON
			prettyJSON := indentJSON(jsonBytes, indent)
			if opts.Array {
				// Indent each line by one level within array
				lines := strings.Split(string(prettyJSON), "\n")
				for i, line := range lines {
					writer.WriteString(indent)
					writer.WriteString(line)
					if i < len(lines)-1 {
						writer.WriteByte('\n')
					}
				}
			} else {
				writer.Write(prettyJSON)
				writer.WriteByte('\n')
			}
		} else {
			if opts.Array {
				writer.WriteString("  ")
			}
			writer.Write(jsonBytes)
			if !opts.Array {
				writer.WriteByte('\n')
			}
		}

		docCount++
	}

	if opts.Array {
		writer.WriteString("\n]\n")
	}

	if skipCount > 0 {
		s.state.EmitEvent("export:warning", map[string]interface{}{
			"exportId": exportID,
			"message":  fmt.Sprintf("%d documents skipped due to decode errors", skipCount),
		})
	}

	// Emit 100% progress
	s.state.EmitEvent("export:progress", types.ExportProgress{
		ExportID:      exportID,
		Phase:         "writing",
		Database:      dbName,
		Collection:    collName,
		Current:       totalProgress,
		Total:         totalProgress,
		ProcessedDocs: docCount,
	})

	s.state.EmitEvent("export:complete", map[string]interface{}{
		"exportId":   exportID,
		"filePath":   filePath,
		"database":   dbName,
		"collection": collName,
	})
	return nil
}

// indentJSON formats compact JSON with the given indent string.
func indentJSON(data []byte, indent string) []byte {
	var buf strings.Builder
	level := 0
	inString := false
	escaped := false

	for i := 0; i < len(data); i++ {
		c := data[i]

		if escaped {
			buf.WriteByte(c)
			escaped = false
			continue
		}

		if c == '\\' && inString {
			buf.WriteByte(c)
			escaped = true
			continue
		}

		if c == '"' {
			inString = !inString
			buf.WriteByte(c)
			continue
		}

		if inString {
			buf.WriteByte(c)
			continue
		}

		switch c {
		case '{', '[':
			buf.WriteByte(c)
			level++
			buf.WriteByte('\n')
			for j := 0; j < level; j++ {
				buf.WriteString(indent)
			}
		case '}', ']':
			level--
			buf.WriteByte('\n')
			for j := 0; j < level; j++ {
				buf.WriteString(indent)
			}
			buf.WriteByte(c)
		case ',':
			buf.WriteByte(c)
			buf.WriteByte('\n')
			for j := 0; j < level; j++ {
				buf.WriteString(indent)
			}
		case ':':
			buf.WriteByte(c)
			buf.WriteByte(' ')
		case ' ', '\t', '\n', '\r':
			// skip whitespace
		default:
			buf.WriteByte(c)
		}
	}

	return []byte(buf.String())
}
