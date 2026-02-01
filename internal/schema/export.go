package schema

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ExportSchemaAsJSON exports a schema result as a JSON Schema file using native save dialog.
func ExportSchemaAsJSON(ctx context.Context, jsonContent, defaultFilename string) error {
	// Open native save dialog
	filePath, err := runtime.SaveFileDialog(ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export JSON Schema",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		// User cancelled
		return nil
	}

	// Ensure .json extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		filePath += ".json"
	}

	// Write file
	if err := os.WriteFile(filePath, []byte(jsonContent), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}
