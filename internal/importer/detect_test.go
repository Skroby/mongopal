package importer

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTestFile(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	return path
}

func TestDetectFileFormat_ZIP(t *testing.T) {
	// ZIP magic bytes: PK\x03\x04
	path := writeTestFile(t, "test.zip", "PK\x03\x04rest of zip data")
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "zip" {
		t.Errorf("expected zip, got %s", format)
	}
}

func TestDetectFileFormat_JSONArray(t *testing.T) {
	content := `[
  {"_id": "1", "name": "Alice"},
  {"_id": "2", "name": "Bob"}
]`
	path := writeTestFile(t, "test.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", format)
	}
}

func TestDetectFileFormat_JSONArrayWithWhitespace(t *testing.T) {
	content := "  \n  [\n{\"name\": \"test\"}\n]"
	path := writeTestFile(t, "test.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", format)
	}
}

func TestDetectFileFormat_NDJSON(t *testing.T) {
	content := `{"_id": "1", "name": "Alice"}
{"_id": "2", "name": "Bob"}
{"_id": "3", "name": "Charlie"}`
	path := writeTestFile(t, "test.ndjson", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "ndjson" {
		t.Errorf("expected ndjson, got %s", format)
	}
}

func TestDetectFileFormat_SingleJSONObject(t *testing.T) {
	content := `{"_id": "1", "name": "Alice", "nested": {"key": "value"}}`
	path := writeTestFile(t, "test.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Single JSON object treated as jsonarray
	if format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", format)
	}
}

func TestDetectFileFormat_CSV(t *testing.T) {
	content := `name,age,city
Alice,30,NYC
Bob,25,LA
Charlie,35,Chicago`
	path := writeTestFile(t, "test.csv", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "csv" {
		t.Errorf("expected csv, got %s", format)
	}
}

func TestDetectFileFormat_CSVTabDelimited(t *testing.T) {
	content := "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA"
	path := writeTestFile(t, "test.tsv", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "csv" {
		t.Errorf("expected csv, got %s", format)
	}
}

func TestDetectFileFormat_CSVSemicolon(t *testing.T) {
	content := "name;age;city\nAlice;30;NYC\nBob;25;LA"
	path := writeTestFile(t, "test.csv", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "csv" {
		t.Errorf("expected csv, got %s", format)
	}
}

func TestDetectFileFormat_BOM(t *testing.T) {
	// UTF-8 BOM + JSON array
	content := "\xEF\xBB\xBF[{\"name\": \"test\"}]"
	path := writeTestFile(t, "test.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", format)
	}
}

func TestDetectFileFormat_EmptyFile(t *testing.T) {
	path := writeTestFile(t, "empty.txt", "")
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "unknown" {
		t.Errorf("expected unknown, got %s", format)
	}
}

func TestDetectFileFormat_Unknown(t *testing.T) {
	content := "just some random text with no structure"
	path := writeTestFile(t, "random.txt", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "unknown" {
		t.Errorf("expected unknown, got %s", format)
	}
}

func TestDetectFileFormat_NonexistentFile(t *testing.T) {
	_, err := DetectFileFormat("/nonexistent/file.json")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestDetectFileFormat_SmallFile(t *testing.T) {
	// A small JSON file (less than 8KB) should be detected correctly
	// even though f.Read may return io.EOF along with the data.
	content := `[{"_id":"1"}]`
	path := writeTestFile(t, "small.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "jsonarray" {
		t.Errorf("expected jsonarray for small file, got %s", format)
	}
}

func TestDetectFileFormat_SmallSingleObject(t *testing.T) {
	// A very small single JSON object (well under 8KB) should not return "unknown"
	content := `{"name":"test"}`
	path := writeTestFile(t, "tiny.json", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format == "unknown" {
		t.Error("small valid JSON object should not be detected as unknown")
	}
	if format != "jsonarray" {
		t.Errorf("expected jsonarray, got %s", format)
	}
}

func TestDetectFileFormat_NDJSONWithBlankLines(t *testing.T) {
	content := `{"_id": "1", "name": "Alice"}

{"_id": "2", "name": "Bob"}

{"_id": "3", "name": "Charlie"}`
	path := writeTestFile(t, "test.ndjson", content)
	format, err := DetectFileFormat(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if format != "ndjson" {
		t.Errorf("expected ndjson, got %s", format)
	}
}
