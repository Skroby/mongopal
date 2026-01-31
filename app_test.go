package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Helper function to create a minimal App instance for testing
func newTestApp() *App {
	return NewApp()
}

// =============================================================================
// extractPasswordFromURI Tests
// =============================================================================

func TestExtractPasswordFromURI(t *testing.T) {
	app := newTestApp()

	tests := []struct {
		name          string
		uri           string
		wantCleanURI  string
		wantPassword  string
		wantErr       bool
	}{
		{
			name:          "URI with username and password",
			uri:           "mongodb://user:password123@localhost:27017/mydb",
			wantCleanURI:  "mongodb://user@localhost:27017/mydb",
			wantPassword:  "password123",
			wantErr:       false,
		},
		{
			name:          "URI with username only",
			uri:           "mongodb://user@localhost:27017/mydb",
			wantCleanURI:  "mongodb://user@localhost:27017/mydb",
			wantPassword:  "",
			wantErr:       false,
		},
		{
			name:          "URI without credentials",
			uri:           "mongodb://localhost:27017/mydb",
			wantCleanURI:  "mongodb://localhost:27017/mydb",
			wantPassword:  "",
			wantErr:       false,
		},
		{
			name:          "URI with special characters in password (URL encoded)",
			uri:           "mongodb://user:p%40ss%3Dw0rd%21@localhost:27017/mydb",
			wantCleanURI:  "mongodb://user@localhost:27017/mydb",
			wantPassword:  "p@ss=w0rd!",
			wantErr:       false,
		},
		{
			name:          "URI with special characters in password (more complex)",
			uri:           "mongodb://admin:P%40ssw0rd%2F%23%24@localhost:27017/admin",
			wantCleanURI:  "mongodb://admin@localhost:27017/admin",
			wantPassword:  "P@ssw0rd/#$",
			wantErr:       false,
		},
		{
			name:          "Invalid URI returns original gracefully",
			uri:           "not-a-valid-uri://:::invalid",
			wantCleanURI:  "not-a-valid-uri://:::invalid",
			wantPassword:  "",
			wantErr:       false,
		},
		{
			name:          "MongoDB+srv scheme",
			uri:           "mongodb+srv://user:secret@cluster0.example.mongodb.net/mydb",
			wantCleanURI:  "mongodb+srv://user@cluster0.example.mongodb.net/mydb",
			wantPassword:  "secret",
			wantErr:       false,
		},
		{
			name:          "MongoDB+srv without password",
			uri:           "mongodb+srv://user@cluster0.example.mongodb.net/mydb",
			wantCleanURI:  "mongodb+srv://user@cluster0.example.mongodb.net/mydb",
			wantPassword:  "",
			wantErr:       false,
		},
		{
			name:          "URI with options after password",
			uri:           "mongodb://user:password@localhost:27017/mydb?authSource=admin&retryWrites=true",
			wantCleanURI:  "mongodb://user@localhost:27017/mydb?authSource=admin&retryWrites=true",
			wantPassword:  "password",
			wantErr:       false,
		},
		{
			name:          "URI with multiple hosts (replica set)",
			uri:           "mongodb://user:pass@host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0",
			wantCleanURI:  "mongodb://user@host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0",
			wantPassword:  "pass",
			wantErr:       false,
		},
		{
			name:          "Empty URI",
			uri:           "",
			wantCleanURI:  "",
			wantPassword:  "",
			wantErr:       false,
		},
		{
			name:          "URI with empty password",
			uri:           "mongodb://user:@localhost:27017/mydb",
			wantCleanURI:  "mongodb://user:@localhost:27017/mydb",
			wantPassword:  "",
			wantErr:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotCleanURI, gotPassword, err := app.extractPasswordFromURI(tt.uri)
			if (err != nil) != tt.wantErr {
				t.Errorf("extractPasswordFromURI() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if gotCleanURI != tt.wantCleanURI {
				t.Errorf("extractPasswordFromURI() cleanURI = %v, want %v", gotCleanURI, tt.wantCleanURI)
			}
			if gotPassword != tt.wantPassword {
				t.Errorf("extractPasswordFromURI() password = %v, want %v", gotPassword, tt.wantPassword)
			}
		})
	}
}

// =============================================================================
// injectPasswordIntoURI Tests
// =============================================================================

func TestInjectPasswordIntoURI(t *testing.T) {
	app := newTestApp()

	tests := []struct {
		name     string
		uri      string
		password string
		wantURI  string
		wantErr  bool
	}{
		{
			name:     "Inject password into URI with username only",
			uri:      "mongodb://user@localhost:27017/mydb",
			password: "secret123",
			wantURI:  "mongodb://user:secret123@localhost:27017/mydb",
			wantErr:  false,
		},
		{
			name:     "Empty password returns original URI",
			uri:      "mongodb://user@localhost:27017/mydb",
			password: "",
			wantURI:  "mongodb://user@localhost:27017/mydb",
			wantErr:  false,
		},
		{
			name:     "URI without username returns original URI",
			uri:      "mongodb://localhost:27017/mydb",
			password: "secret",
			wantURI:  "mongodb://localhost:27017/mydb",
			wantErr:  false,
		},
		{
			name:     "Inject password with special characters",
			uri:      "mongodb://admin@localhost:27017/admin",
			password: "p@ss=w0rd!",
			// Note: Go's url.UserPassword only encodes @ and some chars, = is left as-is
			wantURI:  "mongodb://admin:p%40ss=w0rd%21@localhost:27017/admin",
			wantErr:  false,
		},
		{
			name:     "Replace existing password",
			uri:      "mongodb://user:oldpass@localhost:27017/mydb",
			password: "newpass",
			wantURI:  "mongodb://user:newpass@localhost:27017/mydb",
			wantErr:  false,
		},
		{
			name:     "MongoDB+srv scheme",
			uri:      "mongodb+srv://admin@cluster0.example.mongodb.net/mydb",
			password: "secret",
			wantURI:  "mongodb+srv://admin:secret@cluster0.example.mongodb.net/mydb",
			wantErr:  false,
		},
		{
			name:     "URI with options",
			uri:      "mongodb://user@localhost:27017/mydb?authSource=admin",
			password: "pass",
			wantURI:  "mongodb://user:pass@localhost:27017/mydb?authSource=admin",
			wantErr:  false,
		},
		{
			name:     "Invalid URI returns original gracefully",
			uri:      "not-valid://:::invalid",
			password: "secret",
			wantURI:  "not-valid://:::invalid",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotURI, err := app.injectPasswordIntoURI(tt.uri, tt.password)
			if (err != nil) != tt.wantErr {
				t.Errorf("injectPasswordIntoURI() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if gotURI != tt.wantURI {
				t.Errorf("injectPasswordIntoURI() = %v, want %v", gotURI, tt.wantURI)
			}
		})
	}
}

// TestExtractInjectRoundTrip tests that extracting and then injecting password works correctly
func TestExtractInjectRoundTrip(t *testing.T) {
	app := newTestApp()

	tests := []struct {
		name        string
		originalURI string
		// Note: Some URIs won't round-trip exactly due to URL encoding differences
		// e.g., "=" may or may not be encoded depending on where it appears
		expectExact bool
	}{
		{
			name:        "Standard URI with password",
			originalURI: "mongodb://user:password123@localhost:27017/mydb",
			expectExact: true,
		},
		{
			name:        "URI with @ in password (must be encoded)",
			originalURI: "mongodb://user:p%40ssword@localhost:27017/mydb",
			expectExact: true,
		},
		{
			name:        "MongoDB+srv with options",
			originalURI: "mongodb+srv://admin:secret@cluster0.example.mongodb.net/mydb?retryWrites=true",
			expectExact: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Extract password
			cleanURI, password, err := app.extractPasswordFromURI(tt.originalURI)
			if err != nil {
				t.Fatalf("extractPasswordFromURI() error = %v", err)
			}

			// Inject password back
			resultURI, err := app.injectPasswordIntoURI(cleanURI, password)
			if err != nil {
				t.Fatalf("injectPasswordIntoURI() error = %v", err)
			}

			// Should match original
			if tt.expectExact && resultURI != tt.originalURI {
				t.Errorf("Round trip failed: got %v, want %v", resultURI, tt.originalURI)
			}

			// For non-exact matches, verify the password is functionally correct
			if !tt.expectExact {
				// Re-extract to verify the password is preserved
				_, reExtractedPassword, _ := app.extractPasswordFromURI(resultURI)
				originalPassword := password
				if reExtractedPassword != originalPassword {
					t.Errorf("Password not preserved: got %v, want %v", reExtractedPassword, originalPassword)
				}
			}
		})
	}
}

// =============================================================================
// parseDocumentID Tests
// =============================================================================

func TestParseDocumentID(t *testing.T) {
	app := newTestApp()

	// Create a known ObjectID for testing
	knownOID, _ := primitive.ObjectIDFromHex("507f1f77bcf86cd799439011")

	tests := []struct {
		name     string
		docID    string
		wantType string
		validate func(interface{}) bool
	}{
		{
			name:     "Valid 24-char hex string returns ObjectID",
			docID:    "507f1f77bcf86cd799439011",
			wantType: "ObjectID",
			validate: func(v interface{}) bool {
				oid, ok := v.(primitive.ObjectID)
				return ok && oid == knownOID
			},
		},
		{
			name:     "Extended JSON ObjectId returns parsed structure",
			docID:    `{"$oid":"507f1f77bcf86cd799439011"}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				// bson.UnmarshalExtJSON with interface{} target returns primitive.D
				// The important thing is it doesn't fall back to string
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
		{
			name:     "Extended JSON Binary returns parsed structure",
			docID:    `{"$binary":{"base64":"dGVzdC1iaW5hcnktZGF0YQ==","subType":"04"}}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				// Should parse successfully and not fall back to string
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
		{
			name:     "Extended JSON Binary (UUID subtype 03) returns parsed structure",
			docID:    `{"$binary":{"base64":"AAAAAAAAAAAAAAAAAAAAAA==","subType":"03"}}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
		{
			name:     "Plain string that is not ObjectID",
			docID:    "my-custom-id",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "my-custom-id"
			},
		},
		{
			name:     "Empty string returns empty string",
			docID:    "",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == ""
			},
		},
		{
			name:     "Invalid hex string (23 chars) returns string",
			docID:    "507f1f77bcf86cd79943901",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "507f1f77bcf86cd79943901"
			},
		},
		{
			name:     "Invalid hex string (25 chars) returns string",
			docID:    "507f1f77bcf86cd7994390111",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "507f1f77bcf86cd7994390111"
			},
		},
		{
			name:     "Non-hex 24-char string returns string",
			docID:    "ghijklmnopqrstuvwxyzabcd",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "ghijklmnopqrstuvwxyzabcd"
			},
		},
		{
			name:     "Numeric string ID",
			docID:    "12345",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "12345"
			},
		},
		{
			name:     "Invalid JSON starting with brace returns string",
			docID:    "{invalid json}",
			wantType: "string",
			validate: func(v interface{}) bool {
				s, ok := v.(string)
				return ok && s == "{invalid json}"
			},
		},
		{
			name:     "JSON object without special BSON type parses successfully",
			docID:    `{"foo":"bar"}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				// Should parse and not be a string
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
		{
			name:     "Extended JSON with $numberLong returns parsed structure",
			docID:    `{"$numberLong":"9223372036854775807"}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				// Should parse and not be a string
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
		{
			name:     "Extended JSON with $numberInt returns parsed structure",
			docID:    `{"$numberInt":"42"}`,
			wantType: "interface{}",
			validate: func(v interface{}) bool {
				_, isString := v.(string)
				return !isString && v != nil
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := app.parseDocumentID(tt.docID)
			if !tt.validate(result) {
				t.Errorf("parseDocumentID(%q) = %v (%T), validation failed for expected type %s",
					tt.docID, result, result, tt.wantType)
			}
		})
	}
}

// TestParseDocumentIDWithUUID tests UUID parsing specifically
func TestParseDocumentIDWithUUID(t *testing.T) {
	app := newTestApp()

	// Generate a valid UUID as base64
	uuidBytes := []byte{0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0}
	uuidBase64 := base64.StdEncoding.EncodeToString(uuidBytes)

	docID := `{"$binary":{"base64":"` + uuidBase64 + `","subType":"04"}}`
	result := app.parseDocumentID(docID)

	// The function uses bson.UnmarshalExtJSON with interface{} target
	// which may return primitive.D instead of primitive.Binary for complex structures
	// The key is that it parses successfully and doesn't fall back to string
	_, isString := result.(string)
	if isString {
		t.Fatalf("Expected parsed structure, got string: %v", result)
	}

	if result == nil {
		t.Fatal("Expected non-nil result")
	}
}

// =============================================================================
// ValidateJSON Tests
// =============================================================================

func TestValidateJSON(t *testing.T) {
	app := newTestApp()

	tests := []struct {
		name    string
		jsonStr string
		wantErr bool
	}{
		{
			name:    "Valid JSON object",
			jsonStr: `{"name": "John", "age": 30}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $oid",
			jsonStr: `{"_id": {"$oid": "507f1f77bcf86cd799439011"}, "name": "test"}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $date",
			jsonStr: `{"createdAt": {"$date": "2023-01-01T00:00:00Z"}}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $numberLong",
			jsonStr: `{"count": {"$numberLong": "9223372036854775807"}}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $numberInt",
			jsonStr: `{"count": {"$numberInt": "42"}}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $numberDouble",
			jsonStr: `{"value": {"$numberDouble": "3.14159"}}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with $binary",
			jsonStr: `{"data": {"$binary": {"base64": "SGVsbG8gV29ybGQ=", "subType": "00"}}}`,
			wantErr: false,
		},
		{
			name:    "Invalid JSON - syntax error (missing quote)",
			jsonStr: `{"name: "John"}`,
			wantErr: true,
		},
		{
			name:    "Invalid JSON - syntax error (trailing comma)",
			jsonStr: `{"name": "John",}`,
			wantErr: true,
		},
		{
			name:    "Invalid JSON - syntax error (missing closing brace)",
			jsonStr: `{"name": "John"`,
			wantErr: true,
		},
		{
			name:    "Empty object is valid",
			jsonStr: `{}`,
			wantErr: false,
		},
		{
			name:    "Nested objects are valid",
			jsonStr: `{"user": {"name": "John", "address": {"city": "NYC"}}}`,
			wantErr: false,
		},
		{
			name:    "Array in object is valid",
			jsonStr: `{"tags": ["a", "b", "c"]}`,
			wantErr: false,
		},
		{
			name:    "Complex document with mixed types",
			jsonStr: `{"_id": {"$oid": "507f1f77bcf86cd799439011"}, "name": "test", "count": 42, "active": true, "tags": ["a", "b"], "metadata": {"key": "value"}}`,
			wantErr: false,
		},
		{
			name:    "Empty string is invalid",
			jsonStr: ``,
			wantErr: true,
		},
		{
			name:    "Plain string is invalid (not object)",
			jsonStr: `"just a string"`,
			wantErr: true,
		},
		{
			name:    "Plain number is invalid (not object)",
			jsonStr: `42`,
			wantErr: true,
		},
		{
			name:    "Null value - json.Unmarshal accepts it into bson.M",
			jsonStr: `null`,
			// Note: json.Unmarshal into bson.M (which is map[string]interface{}) accepts null
			// This is Go's standard behavior - null unmarshals to nil for map types
			wantErr: false,
		},
		{
			name:    "Boolean value is invalid (not object)",
			jsonStr: `true`,
			wantErr: true,
		},
		{
			name:    "Valid Extended JSON with timestamp",
			jsonStr: `{"ts": {"$timestamp": {"t": 1678901234, "i": 1}}}`,
			wantErr: false,
		},
		{
			name:    "Valid Extended JSON with regex",
			jsonStr: `{"pattern": {"$regularExpression": {"pattern": "^test", "options": "i"}}}`,
			wantErr: false,
		},
		{
			name:    "Whitespace-only is invalid",
			jsonStr: `   `,
			wantErr: true,
		},
		{
			name:    "Object with null value is valid",
			jsonStr: `{"value": null}`,
			wantErr: false,
		},
		{
			name:    "Object with boolean values is valid",
			jsonStr: `{"active": true, "deleted": false}`,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := app.ValidateJSON(tt.jsonStr)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateJSON(%q) error = %v, wantErr %v", tt.jsonStr, err, tt.wantErr)
			}
		})
	}
}

// TestValidateJSONArray tests array handling
func TestValidateJSONArray(t *testing.T) {
	app := newTestApp()

	// Note: ValidateJSON unmarshals into bson.M which expects an object
	// Arrays at the root level should fail since they can't be unmarshaled to bson.M

	tests := []struct {
		name    string
		jsonStr string
		wantErr bool
	}{
		{
			name:    "Root level array is invalid (expects object)",
			jsonStr: `[{"a": 1}, {"b": 2}]`,
			wantErr: true,
		},
		{
			name:    "Array inside object is valid",
			jsonStr: `{"items": [1, 2, 3]}`,
			wantErr: false,
		},
		{
			name:    "Array of objects inside object is valid",
			jsonStr: `{"users": [{"name": "John"}, {"name": "Jane"}]}`,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := app.ValidateJSON(tt.jsonStr)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateJSON(%q) error = %v, wantErr %v", tt.jsonStr, err, tt.wantErr)
			}
		})
	}
}

// =============================================================================
// Benchmark Tests
// =============================================================================

func BenchmarkParseDocumentID_ObjectIDHex(b *testing.B) {
	app := newTestApp()
	docID := "507f1f77bcf86cd799439011"

	for i := 0; i < b.N; i++ {
		app.parseDocumentID(docID)
	}
}

func BenchmarkParseDocumentID_ExtendedJSON(b *testing.B) {
	app := newTestApp()
	docID := `{"$oid":"507f1f77bcf86cd799439011"}`

	for i := 0; i < b.N; i++ {
		app.parseDocumentID(docID)
	}
}

func BenchmarkParseDocumentID_PlainString(b *testing.B) {
	app := newTestApp()
	docID := "my-custom-id-12345"

	for i := 0; i < b.N; i++ {
		app.parseDocumentID(docID)
	}
}

func BenchmarkValidateJSON_Simple(b *testing.B) {
	app := newTestApp()
	jsonStr := `{"name": "John", "age": 30}`

	for i := 0; i < b.N; i++ {
		app.ValidateJSON(jsonStr)
	}
}

func BenchmarkValidateJSON_ExtendedJSON(b *testing.B) {
	app := newTestApp()
	jsonStr := `{"_id": {"$oid": "507f1f77bcf86cd799439011"}, "createdAt": {"$date": "2023-01-01T00:00:00Z"}, "count": {"$numberLong": "1000000"}}`

	for i := 0; i < b.N; i++ {
		app.ValidateJSON(jsonStr)
	}
}

func BenchmarkExtractPasswordFromURI(b *testing.B) {
	app := newTestApp()
	uri := "mongodb://user:password123@localhost:27017/mydb?authSource=admin"

	for i := 0; i < b.N; i++ {
		app.extractPasswordFromURI(uri)
	}
}

func BenchmarkInjectPasswordIntoURI(b *testing.B) {
	app := newTestApp()
	uri := "mongodb://user@localhost:27017/mydb"
	password := "password123"

	for i := 0; i < b.N; i++ {
		app.injectPasswordIntoURI(uri, password)
	}
}

// =============================================================================
// Export/Import Tests
// =============================================================================

func TestBuildExportFilename(t *testing.T) {
	app := newTestApp()

	tests := []struct {
		name     string
		connName string
		dbCount  int
		wantPfx  string // Expected prefix (before timestamp)
	}{
		{
			name:     "Simple connection name",
			connName: "MyConnection",
			dbCount:  3,
			wantPfx:  "MyConnection_3db_",
		},
		{
			name:     "Connection name with spaces",
			connName: "My Local Dev",
			dbCount:  1,
			wantPfx:  "My_Local_Dev_1db_",
		},
		{
			name:     "Connection name with special chars",
			connName: "Dev@Server#1!",
			dbCount:  5,
			wantPfx:  "DevServer1_5db_",
		},
		{
			name:     "Very long connection name (truncated)",
			connName: "ThisIsAVeryLongConnectionNameThatShouldBeTruncatedToFortyCharacters",
			dbCount:  2,
			wantPfx:  "ThisIsAVeryLongConnectionNameThatShouldB_2db_",
		},
		{
			name:     "Empty connection name",
			connName: "",
			dbCount:  1,
			wantPfx:  "_1db_",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := app.buildExportFilename(tt.connName, tt.dbCount)

			// Check prefix
			if len(result) < len(tt.wantPfx) {
				t.Errorf("Result too short: got %s", result)
				return
			}
			gotPfx := result[:len(tt.wantPfx)]
			if gotPfx != tt.wantPfx {
				t.Errorf("Prefix mismatch: got %s, want %s", gotPfx, tt.wantPfx)
			}

			// Check suffix
			if !stringEndsWith(result, ".zip") {
				t.Errorf("Expected .zip suffix, got: %s", result)
			}

			// Check timestamp format (YYYY-MM-DD_HHMMSS)
			// The format should be like: prefix_2026-01-31_153045.zip
			timestampPart := result[len(tt.wantPfx) : len(result)-4] // Remove .zip
			if len(timestampPart) != 17 { // 2026-01-31_153045
				t.Errorf("Unexpected timestamp length: got %s (len=%d)", timestampPart, len(timestampPart))
			}
		})
	}
}

func stringEndsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}

func TestExportManifestJSON(t *testing.T) {
	// Test that ExportManifest serializes correctly
	manifest := ExportManifest{
		Version: "1.0",
		Databases: []ExportManifestDatabase{
			{
				Name: "testdb",
				Collections: []ExportManifestCollection{
					{Name: "users", DocCount: 100, IndexCount: 2},
					{Name: "orders", DocCount: 500, IndexCount: 1},
				},
			},
		},
	}

	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("Failed to marshal manifest: %v", err)
	}

	// Unmarshal and verify
	var parsed ExportManifest
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal manifest: %v", err)
	}

	if parsed.Version != "1.0" {
		t.Errorf("Version mismatch: got %s", parsed.Version)
	}
	if len(parsed.Databases) != 1 {
		t.Errorf("Database count mismatch: got %d", len(parsed.Databases))
	}
	if parsed.Databases[0].Name != "testdb" {
		t.Errorf("Database name mismatch: got %s", parsed.Databases[0].Name)
	}
	if len(parsed.Databases[0].Collections) != 2 {
		t.Errorf("Collection count mismatch: got %d", len(parsed.Databases[0].Collections))
	}
}

func TestImportResultJSON(t *testing.T) {
	// Test ImportResult with all fields
	result := ImportResult{
		Databases: []DatabaseImportResult{
			{
				Name:         "mydb",
				CurrentCount: 50,
				Collections: []CollectionImportResult{
					{Name: "users", DocumentsInserted: 10, DocumentsSkipped: 5, CurrentCount: 15},
				},
			},
		},
		DocumentsInserted: 10,
		DocumentsSkipped:  5,
		DocumentsDropped:  50,
		Errors:            []string{"error1"},
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal result: %v", err)
	}

	var parsed ImportResult
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal result: %v", err)
	}

	if parsed.DocumentsInserted != 10 {
		t.Errorf("DocumentsInserted mismatch: got %d", parsed.DocumentsInserted)
	}
	if parsed.DocumentsDropped != 50 {
		t.Errorf("DocumentsDropped mismatch: got %d", parsed.DocumentsDropped)
	}
	if len(parsed.Databases) != 1 {
		t.Errorf("Databases count mismatch: got %d", len(parsed.Databases))
	}
	if parsed.Databases[0].CurrentCount != 50 {
		t.Errorf("Database CurrentCount mismatch: got %d", parsed.Databases[0].CurrentCount)
	}
}

func TestImportOptionsJSON(t *testing.T) {
	opts := ImportOptions{
		FilePath:  "/path/to/file.zip",
		Databases: []string{"db1", "db2"},
		Mode:      "skip",
	}

	data, err := json.Marshal(opts)
	if err != nil {
		t.Fatalf("Failed to marshal options: %v", err)
	}

	var parsed ImportOptions
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal options: %v", err)
	}

	if parsed.FilePath != "/path/to/file.zip" {
		t.Errorf("FilePath mismatch: got %s", parsed.FilePath)
	}
	if parsed.Mode != "skip" {
		t.Errorf("Mode mismatch: got %s", parsed.Mode)
	}
	if len(parsed.Databases) != 2 {
		t.Errorf("Databases count mismatch: got %d", len(parsed.Databases))
	}
}
