package credential

import (
	"encoding/json"
	"testing"

	"github.com/peternagy/mongopal/internal/types"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	data := map[string]interface{}{
		"name":     "Test Connection",
		"host":     "localhost",
		"port":     27017,
		"password": "s3cr3t!@#$%",
	}

	plaintext, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	bundleJSON, key, err := EncryptForSharing(plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if bundleJSON == "" || key == "" {
		t.Fatal("expected non-empty bundle and key")
	}

	// Key should be 43 chars (256 bits in base64url without padding)
	if len(key) != 43 {
		t.Errorf("expected key length 43, got %d", len(key))
	}

	// Bundle should be valid JSON with expected fields
	var bundle types.ConnectionShareBundle
	if err := json.Unmarshal([]byte(bundleJSON), &bundle); err != nil {
		t.Fatalf("bundle is not valid JSON: %v", err)
	}
	if bundle.Version != 1 {
		t.Errorf("expected version 1, got %d", bundle.Version)
	}
	if bundle.App != "mongopal" {
		t.Errorf("expected app 'mongopal', got %q", bundle.App)
	}

	// Decrypt
	decrypted, err := DecryptFromSharing(bundleJSON, key)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(decrypted, &result); err != nil {
		t.Fatalf("unmarshal decrypted: %v", err)
	}

	if result["name"] != "Test Connection" {
		t.Errorf("expected name 'Test Connection', got %v", result["name"])
	}
	if result["password"] != "s3cr3t!@#$%" {
		t.Errorf("password mismatch")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	plaintext := []byte(`{"test": true}`)

	bundleJSON, _, err := EncryptForSharing(plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	// Use a different key
	_, wrongKey, err := EncryptForSharing([]byte("other"))
	if err != nil {
		t.Fatalf("encrypt other: %v", err)
	}

	_, err = DecryptFromSharing(bundleJSON, wrongKey)
	if err == nil {
		t.Fatal("expected error with wrong key")
	}
}

func TestDecryptInvalidBundle(t *testing.T) {
	_, err := DecryptFromSharing("not json", "somekey")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestDecryptInvalidKey(t *testing.T) {
	plaintext := []byte(`{"test": true}`)
	bundleJSON, _, err := EncryptForSharing(plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	_, err = DecryptFromSharing(bundleJSON, "tooshort")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}
