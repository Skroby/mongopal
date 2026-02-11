package importer

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// DetectFileFormat reads the first bytes/structure of a file to determine its format.
// Returns: "ndjson", "jsonarray", "csv", "zip", "archive", "unknown"
func DetectFileFormat(filePath string) (string, error) {
	// Check extension for binary formats that can't be detected by content
	if strings.ToLower(filepath.Ext(filePath)) == ".archive" {
		return "archive", nil
	}

	f, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	// Read the first 8KB for analysis
	buf := make([]byte, 8192)
	n, err := f.Read(buf)
	if n == 0 {
		return "unknown", nil
	}
	if err != nil && err != io.EOF {
		return "", err
	}
	data := buf[:n]

	// Check for ZIP magic bytes (PK\x03\x04)
	if n >= 2 && data[0] == 0x50 && data[1] == 0x4B {
		return "zip", nil
	}

	// Skip BOM if present
	content := string(data)
	content = strings.TrimPrefix(content, "\xEF\xBB\xBF") // UTF-8 BOM

	// Skip leading whitespace
	trimmed := strings.TrimLeftFunc(content, unicode.IsSpace)
	if len(trimmed) == 0 {
		return "unknown", nil
	}

	firstChar := trimmed[0]

	// JSON array: starts with [
	if firstChar == '[' {
		return "jsonarray", nil
	}

	// Starts with { — could be NDJSON (multiple JSON objects, one per line) or single JSON object
	if firstChar == '{' {
		return detectJSONVariant(filePath)
	}

	// Heuristic for CSV: no leading { or [, check for consistent delimiters
	if isLikelyCSV(trimmed) {
		return "csv", nil
	}

	return "unknown", nil
}

// detectJSONVariant distinguishes between NDJSON and a single JSON object.
// NDJSON: multiple lines each starting with {
func detectJSONVariant(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	// Use a larger buffer for potentially large JSON lines
	scanBuf := make([]byte, 1024*1024) // 1MB
	scanner.Buffer(scanBuf, 1024*1024)

	lineCount := 0
	jsonLineCount := 0
	maxLines := 20 // Check first 20 lines

	for scanner.Scan() && lineCount < maxLines {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		lineCount++

		if len(line) > 0 && line[0] == '{' {
			jsonLineCount++
		}
	}

	// If we found 2+ lines starting with {, it's NDJSON
	if jsonLineCount >= 2 {
		return "ndjson", nil
	}

	// Single JSON object (or single-line NDJSON with 1 doc — treat as jsonarray for consistency)
	return "jsonarray", nil
}

// isLikelyCSV checks if content looks like CSV data.
// Heuristic: multiple lines with consistent comma/tab/semicolon delimiters, no { on first line.
func isLikelyCSV(content string) bool {
	lines := strings.SplitN(content, "\n", 6) // Check first 5 lines
	if len(lines) < 2 {
		return false
	}

	// Check that no line starts with { or [
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[') {
			return false
		}
	}

	// Count delimiters in first line to detect which one is used
	firstLine := lines[0]
	for _, delim := range []string{",", "\t", ";", "|"} {
		count := strings.Count(firstLine, delim)
		if count >= 1 {
			// Verify second line has similar delimiter count
			secondLine := strings.TrimSpace(lines[1])
			if secondLine != "" {
				count2 := strings.Count(secondLine, delim)
				if count2 >= 1 && abs(count-count2) <= 1 {
					return true
				}
			}
		}
	}

	return false
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
