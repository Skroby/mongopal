package importer

import (
	"io"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

func TestInferType(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  interface{}
	}{
		{name: "empty string", input: "", want: nil},
		{name: "true lowercase", input: "true", want: true},
		{name: "True mixed case", input: "True", want: true},
		{name: "TRUE uppercase", input: "TRUE", want: true},
		{name: "false lowercase", input: "false", want: false},
		{name: "False mixed case", input: "False", want: false},
		{name: "positive int", input: "42", want: int64(42)},
		{name: "zero", input: "0", want: int64(0)},
		{name: "negative int", input: "-7", want: int64(-7)},
		{name: "positive float", input: "3.14", want: float64(3.14)},
		{name: "negative float", input: "-0.5", want: float64(-0.5)},
		{name: "date only", input: "2023-01-15", want: "time"},
		{name: "full ISO datetime", input: "2023-01-15T10:30:00Z", want: "time"},
		{name: "datetime with timezone", input: "2023-01-15T10:30:00+05:00", want: "time"},
		{name: "plain string", input: "hello", want: "hello"},
		{name: "mixed alphanumeric", input: "123abc", want: "123abc"},
		{name: "whitespace is not empty", input: " ", want: " "},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := inferType(tt.input)

			// Special handling for time values: verify the type is primitive.DateTime
			if tt.want == "time" {
				if _, ok := got.(primitive.DateTime); !ok {
					t.Errorf("inferType(%q) = %v (%T), want primitive.DateTime", tt.input, got, got)
				}
				return
			}

			// For nil comparison
			if tt.want == nil {
				if got != nil {
					t.Errorf("inferType(%q) = %v (%T), want nil", tt.input, got, got)
				}
				return
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("inferType(%q) = %v (%T), want %v (%T)", tt.input, got, got, tt.want, tt.want)
			}
		})
	}
}

func TestInferType_DateValues(t *testing.T) {
	// Verify actual parsed date values
	tests := []struct {
		input    string
		wantYear int
		wantDay  int
	}{
		{input: "2023-01-15", wantYear: 2023, wantDay: 15},
		{input: "2023-01-15T10:30:00Z", wantYear: 2023, wantDay: 15},
		{input: "2023-01-15T10:30:00+05:00", wantYear: 2023, wantDay: 15},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := inferType(tt.input)
			dt, ok := got.(primitive.DateTime)
			if !ok {
				t.Fatalf("inferType(%q) = %T, want primitive.DateTime", tt.input, got)
			}
			parsed := dt.Time()
			if parsed.Year() != tt.wantYear {
				t.Errorf("year = %d, want %d", parsed.Year(), tt.wantYear)
			}
			if parsed.Day() != tt.wantDay {
				t.Errorf("day = %d, want %d", parsed.Day(), tt.wantDay)
			}
		})
	}
}

func TestUnflattenDocument(t *testing.T) {
	tests := []struct {
		name string
		input map[string]interface{}
		want  bson.M
	}{
		{
			name:  "simple flat keys",
			input: map[string]interface{}{"name": "John", "age": 30},
			want:  bson.M{"name": "John", "age": 30},
		},
		{
			name:  "dot notation",
			input: map[string]interface{}{"address.city": "NY", "address.zip": "10001"},
			want:  bson.M{"address": bson.M{"city": "NY", "zip": "10001"}},
		},
		{
			name:  "deep nesting",
			input: map[string]interface{}{"a.b.c": "deep"},
			want:  bson.M{"a": bson.M{"b": bson.M{"c": "deep"}}},
		},
		{
			name:  "mixed flat and nested",
			input: map[string]interface{}{"name": "John", "address.city": "NY"},
			want:  bson.M{"name": "John", "address": bson.M{"city": "NY"}},
		},
		{
			name:  "empty map",
			input: map[string]interface{}{},
			want:  bson.M{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := unflattenDocument(tt.input)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("unflattenDocument(%v) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestDetectDelimiter(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		wantDelim rune
	}{
		{
			name:      "comma delimited",
			content:   "name,age,city\nAlice,30,NYC\nBob,25,LA\n",
			wantDelim: ',',
		},
		{
			name:      "tab delimited",
			content:   "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA\n",
			wantDelim: '\t',
		},
		{
			name:      "semicolon delimited",
			content:   "name;age;city\nAlice;30;NYC\nBob;25;LA\n",
			wantDelim: ';',
		},
		{
			name:      "single column defaults to comma",
			content:   "name\nAlice\nBob\n",
			wantDelim: ',',
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "test.csv")
			if err := os.WriteFile(path, []byte(tt.content), 0644); err != nil {
				t.Fatalf("failed to write test file: %v", err)
			}
			got, err := detectDelimiter(path)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.wantDelim {
				t.Errorf("detectDelimiter() = %q, want %q", got, tt.wantDelim)
			}
		})
	}
}

func TestDetectDelimiter_QuotedFields(t *testing.T) {
	// Quoted fields with commas inside should not confuse delimiter detection
	content := `name,age,city
"Smith, John",30,"New York, NY"
"Doe, Jane",25,"Los Angeles, CA"
`
	path := filepath.Join(t.TempDir(), "quoted.csv")
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	got, err := detectDelimiter(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != ',' {
		t.Errorf("detectDelimiter() = %q, want ','", got)
	}
}

func TestSkipBOM(t *testing.T) {
	t.Run("file with UTF-8 BOM", func(t *testing.T) {
		// BOM bytes followed by content
		content := []byte{0xEF, 0xBB, 0xBF}
		content = append(content, []byte("name,age\nAlice,30\n")...)
		path := filepath.Join(t.TempDir(), "bom.csv")
		if err := os.WriteFile(path, content, 0644); err != nil {
			t.Fatalf("failed to write test file: %v", err)
		}

		f, err := os.Open(path)
		if err != nil {
			t.Fatalf("failed to open file: %v", err)
		}
		defer f.Close()

		reader := skipBOM(f)
		buf := make([]byte, 256)
		n, _ := reader.Read(buf)
		result := string(buf[:n])

		if result[:4] != "name" {
			t.Errorf("expected content to start with 'name', got %q", result[:4])
		}
	})

	t.Run("file without BOM", func(t *testing.T) {
		content := "name,age\nAlice,30\n"
		path := filepath.Join(t.TempDir(), "nobom.csv")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write test file: %v", err)
		}

		f, err := os.Open(path)
		if err != nil {
			t.Fatalf("failed to open file: %v", err)
		}
		defer f.Close()

		reader := skipBOM(f)
		// Read all bytes (MultiReader may return partial reads)
		allBytes, err := io.ReadAll(reader)
		if err != nil {
			t.Fatalf("failed to read: %v", err)
		}
		result := string(allBytes)

		if result != content {
			t.Errorf("expected %q, got %q", content, result)
		}
	})
}

func TestPreviewCSVFile(t *testing.T) {
	state := core.NewAppState()
	state.DisableEvents = true
	svc := &Service{state: state}

	t.Run("normal CSV with headers and data", func(t *testing.T) {
		content := "name,age,city\nAlice,30,NYC\nBob,25,LA\nCharlie,35,Chicago\n"
		path := filepath.Join(t.TempDir(), "test.csv")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write test file: %v", err)
		}

		preview, err := svc.PreviewCSVFile(types.CSVImportPreviewOptions{FilePath: path, MaxRows: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(preview.Headers) != 3 {
			t.Errorf("expected 3 headers, got %d", len(preview.Headers))
		}
		if preview.Headers[0] != "name" || preview.Headers[1] != "age" || preview.Headers[2] != "city" {
			t.Errorf("unexpected headers: %v", preview.Headers)
		}
		if preview.TotalRows != 3 {
			t.Errorf("expected 3 total rows, got %d", preview.TotalRows)
		}
		if len(preview.SampleRows) != 3 {
			t.Errorf("expected 3 sample rows, got %d", len(preview.SampleRows))
		}
		if preview.FileSize == 0 {
			t.Error("expected non-zero file size")
		}
	})

	t.Run("CSV with tab delimiter", func(t *testing.T) {
		content := "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA\n"
		path := filepath.Join(t.TempDir(), "test.tsv")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write test file: %v", err)
		}

		preview, err := svc.PreviewCSVFile(types.CSVImportPreviewOptions{FilePath: path, MaxRows: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if preview.Delimiter != "\t" {
			t.Errorf("expected tab delimiter, got %q", preview.Delimiter)
		}
		if len(preview.Headers) != 3 {
			t.Errorf("expected 3 headers, got %d", len(preview.Headers))
		}
		if preview.TotalRows != 2 {
			t.Errorf("expected 2 total rows, got %d", preview.TotalRows)
		}
	})

	t.Run("empty CSV with just headers", func(t *testing.T) {
		content := "name,age,city\n"
		path := filepath.Join(t.TempDir(), "empty.csv")
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			t.Fatalf("failed to write test file: %v", err)
		}

		preview, err := svc.PreviewCSVFile(types.CSVImportPreviewOptions{FilePath: path, MaxRows: 10})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if preview.TotalRows != 0 {
			t.Errorf("expected 0 total rows, got %d", preview.TotalRows)
		}
		if len(preview.Headers) != 3 {
			t.Errorf("expected 3 headers, got %d", len(preview.Headers))
		}
		if len(preview.SampleRows) != 0 {
			t.Errorf("expected 0 sample rows, got %d", len(preview.SampleRows))
		}
	})
}
