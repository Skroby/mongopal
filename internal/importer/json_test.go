package importer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProcessNDJSON(t *testing.T) {
	content := `{"_id": "1", "name": "Alice"}
{"_id": "2", "name": "Bob"}
{"_id": "3", "name": "Charlie"}`

	r := strings.NewReader(content)
	var docs []string
	err := processNDJSON(r, func(data []byte) error {
		docs = append(docs, string(data))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 3 {
		t.Errorf("expected 3 docs, got %d", len(docs))
	}
}

func TestProcessNDJSON_WithBlankLines(t *testing.T) {
	content := `{"_id": "1"}

{"_id": "2"}

`
	r := strings.NewReader(content)
	var count int
	err := processNDJSON(r, func(data []byte) error {
		count++
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 docs, got %d", count)
	}
}

func TestProcessJSONArray(t *testing.T) {
	content := `[
  {"_id": "1", "name": "Alice"},
  {"_id": "2", "name": "Bob"},
  {"_id": "3", "name": "Charlie"}
]`

	r := strings.NewReader(content)
	var docs []string
	err := processJSONArray(r, func(data []byte) error {
		docs = append(docs, string(data))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 3 {
		t.Errorf("expected 3 docs, got %d", len(docs))
	}
}

func TestProcessJSONArray_SingleElement(t *testing.T) {
	content := `[{"_id": "1", "name": "Alice"}]`

	r := strings.NewReader(content)
	var docs []string
	err := processJSONArray(r, func(data []byte) error {
		docs = append(docs, string(data))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("expected 1 doc, got %d", len(docs))
	}
}

func TestProcessJSONArray_Empty(t *testing.T) {
	content := `[]`

	r := strings.NewReader(content)
	var count int
	err := processJSONArray(r, func(data []byte) error {
		count++
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 docs, got %d", count)
	}
}

func TestCountJSONArrayDocs(t *testing.T) {
	content := `[{"_id":"1"},{"_id":"2"},{"_id":"3"}]`
	r := strings.NewReader(content)
	count, sample, err := countJSONArrayDocs(r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 3 {
		t.Errorf("expected 3, got %d", count)
	}
	if sample == "" {
		t.Error("expected non-empty sample")
	}
	// Verify sample is valid JSON
	var m map[string]interface{}
	if json.Unmarshal([]byte(sample), &m) != nil {
		t.Errorf("sample is not valid JSON: %s", sample)
	}
}

func TestCountJSONArrayDocs_SingleObject(t *testing.T) {
	content := `{"_id":"1","name":"Alice"}`
	r := strings.NewReader(content)
	count, sample, err := countJSONArrayDocs(r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1, got %d", count)
	}
	if sample == "" {
		t.Error("expected non-empty sample")
	}
}

func TestPrettyJSON(t *testing.T) {
	input := `{"name":"Alice","age":30}`
	result := prettyJSON(input)
	if !strings.Contains(result, "\n") {
		t.Errorf("expected pretty-printed output with newlines, got: %s", result)
	}
	if !strings.Contains(result, "  ") {
		t.Errorf("expected indentation, got: %s", result)
	}
}

func TestPrettyJSON_InvalidJSON(t *testing.T) {
	input := "not json"
	result := prettyJSON(input)
	if result != input {
		t.Errorf("expected original string returned for invalid JSON, got: %s", result)
	}
}

func TestPreviewJSONFile_NDJSON(t *testing.T) {
	content := `{"_id": "1", "name": "Alice"}
{"_id": "2", "name": "Bob"}
{"_id": "3", "name": "Charlie"}`

	path := filepath.Join(t.TempDir(), "test.json")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	svc := &Service{}
	preview, err := svc.PreviewJSONFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preview.Format != "ndjson" {
		t.Errorf("expected ndjson, got %s", preview.Format)
	}
	if preview.DocumentCount != 3 {
		t.Errorf("expected 3 docs, got %d", preview.DocumentCount)
	}
	if preview.SampleDoc == "" {
		t.Error("expected non-empty sample doc")
	}
	if preview.FileSize == 0 {
		t.Error("expected non-zero file size")
	}
}

func TestPreviewJSONFile_JSONArray(t *testing.T) {
	content := `[{"_id":"1"},{"_id":"2"}]`

	path := filepath.Join(t.TempDir(), "test.json")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	svc := &Service{}
	preview, err := svc.PreviewJSONFile(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if preview.Format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", preview.Format)
	}
	if preview.DocumentCount != 2 {
		t.Errorf("expected 2 docs, got %d", preview.DocumentCount)
	}
}

func TestPreviewJSONFile_UnsupportedFormat(t *testing.T) {
	content := "name,age\nAlice,30\nBob,25"
	path := filepath.Join(t.TempDir(), "test.csv")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	svc := &Service{}
	_, err := svc.PreviewJSONFile(path)
	if err == nil {
		t.Error("expected error for unsupported format")
	}
}

func TestProcessJSONArray_SingleObject(t *testing.T) {
	// A single JSON object (not wrapped in []) should be decoded as one document
	content := `{"_id": "1", "name": "Alice", "age": 30}`

	r := strings.NewReader(content)
	var docs []string
	err := processJSONArray(r, func(data []byte) error {
		docs = append(docs, string(data))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("expected 1 doc, got %d", len(docs))
	}
	if len(docs) > 0 && !strings.Contains(docs[0], "Alice") {
		t.Errorf("expected doc to contain 'Alice', got: %s", docs[0])
	}
}

func TestProcessNDJSON_ExtendedJSON(t *testing.T) {
	content := `{"_id":{"$oid":"507f1f77bcf86cd799439011"},"date":{"$date":"2023-01-01T00:00:00Z"}}`

	r := strings.NewReader(content)
	var docs []string
	err := processNDJSON(r, func(data []byte) error {
		docs = append(docs, string(data))
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 1 {
		t.Errorf("expected 1 doc, got %d", len(docs))
	}
	if !strings.Contains(docs[0], "$oid") {
		t.Error("expected Extended JSON $oid preserved")
	}
}
