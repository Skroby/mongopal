package export

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/peternagy/mongopal/internal/types"
)

// ExportDocumentsAsZip exports multiple documents as a ZIP file.
func (s *Service) ExportDocumentsAsZip(entries []types.DocumentExportEntry, defaultFilename string) error {
	if len(entries) == 0 {
		return fmt.Errorf("no documents to export")
	}

	// Open native save dialog
	filePath, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Documents",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		// User cancelled
		return nil
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create zip file
	zipFile, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Track used filenames to avoid duplicates
	usedNames := make(map[string]int)

	// Add each document as JSON file
	for _, entry := range entries {
		// Generate unique filename
		baseName := fmt.Sprintf("%s_%s.json", entry.Collection, entry.DocID)
		// Sanitize filename (remove invalid characters)
		baseName = strings.Map(func(r rune) rune {
			if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
				return '_'
			}
			return r
		}, baseName)

		// Handle duplicate filenames
		filename := baseName
		if count, exists := usedNames[baseName]; exists {
			ext := filepath.Ext(baseName)
			name := strings.TrimSuffix(baseName, ext)
			filename = fmt.Sprintf("%s_%d%s", name, count+1, ext)
			usedNames[baseName] = count + 1
		} else {
			usedNames[baseName] = 1
		}

		// Create file in zip
		writer, err := zipWriter.Create(filename)
		if err != nil {
			continue // Skip failed entries
		}

		// Pretty print the JSON
		var prettyJSON []byte
		var raw interface{}
		if err := json.Unmarshal([]byte(entry.JSON), &raw); err == nil {
			prettyJSON, _ = json.MarshalIndent(raw, "", "  ")
		} else {
			prettyJSON = []byte(entry.JSON)
		}

		writer.Write(prettyJSON)
	}

	return nil
}
