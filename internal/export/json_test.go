package export

import (
	"strings"
	"testing"
)

func TestIndentJSON_Simple(t *testing.T) {
	input := []byte(`{"name":"Alice","age":30}`)
	result := string(indentJSON(input, "  "))

	if !strings.Contains(result, "\"name\":") {
		t.Errorf("expected indented output, got: %s", result)
	}
	if !strings.Contains(result, "\n") {
		t.Errorf("expected newlines in pretty output, got: %s", result)
	}
}

func TestIndentJSON_Nested(t *testing.T) {
	input := []byte(`{"user":{"name":"Alice","address":{"city":"NYC"}}}`)
	result := string(indentJSON(input, "  "))

	lines := strings.Split(result, "\n")
	if len(lines) < 5 {
		t.Errorf("expected multiple lines for nested object, got %d lines", len(lines))
	}
}

func TestIndentJSON_Array(t *testing.T) {
	input := []byte(`{"tags":["go","mongodb"]}`)
	result := string(indentJSON(input, "  "))

	if !strings.Contains(result, "\"go\"") {
		t.Errorf("expected array elements, got: %s", result)
	}
}

func TestIndentJSON_StringsWithSpecialChars(t *testing.T) {
	input := []byte(`{"msg":"hello \"world\"","path":"c:\\temp"}`)
	result := string(indentJSON(input, "  "))

	if !strings.Contains(result, `"hello \"world\""`) {
		t.Errorf("expected escaped quotes preserved, got: %s", result)
	}
	if !strings.Contains(result, `"c:\\temp"`) {
		t.Errorf("expected escaped backslash preserved, got: %s", result)
	}
}

func TestIndentJSON_ExtendedJSON(t *testing.T) {
	input := []byte(`{"_id":{"$oid":"507f1f77bcf86cd799439011"},"date":{"$date":"2023-01-01T00:00:00Z"}}`)
	result := string(indentJSON(input, "  "))

	if !strings.Contains(result, "$oid") {
		t.Errorf("expected Extended JSON preserved, got: %s", result)
	}
	if !strings.Contains(result, "$date") {
		t.Errorf("expected Extended JSON date preserved, got: %s", result)
	}
}

func TestIndentJSON_Empty(t *testing.T) {
	input := []byte(`{}`)
	result := string(indentJSON(input, "  "))

	if !strings.Contains(result, "{") || !strings.Contains(result, "}") {
		t.Errorf("expected empty object, got: %s", result)
	}
}
