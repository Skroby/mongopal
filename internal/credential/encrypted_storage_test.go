package credential

import (
	"os"
	"path/filepath"
	"testing"
)

type testConnection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URI      string `json:"uri"`
	Password string `json:"password"`
	SSHKey   string `json:"sshKey"`
}

func TestEncryptedStorage_SaveAndLoad(t *testing.T) {
	// Create temp directory for test
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	// Test data
	conn := testConnection{
		ID:       "test-conn-123",
		Name:     "Test Connection",
		URI:      "mongodb://localhost:27017",
		Password: "super-secret-password",
		SSHKey:   "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
	}

	// Save
	if err := storage.SaveConnection(conn.ID, conn); err != nil {
		t.Fatalf("Failed to save connection: %v", err)
	}

	// Verify encrypted file exists
	if !storage.ConnectionExists(conn.ID) {
		t.Fatal("Encrypted file should exist after save")
	}

	// Load
	var loaded testConnection
	if err := storage.LoadConnection(conn.ID, &loaded); err != nil {
		t.Fatalf("Failed to load connection: %v", err)
	}

	// Verify data matches
	if loaded.ID != conn.ID {
		t.Errorf("ID mismatch: got %s, want %s", loaded.ID, conn.ID)
	}
	if loaded.Password != conn.Password {
		t.Errorf("Password mismatch: got %s, want %s", loaded.Password, conn.Password)
	}
	if loaded.SSHKey != conn.SSHKey {
		t.Errorf("SSH key mismatch")
	}
}

func TestEncryptedStorage_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	conn := testConnection{
		ID:   "delete-me",
		Name: "Delete Test",
		URI:  "mongodb://localhost:27017",
	}

	// Save
	if err := storage.SaveConnection(conn.ID, conn); err != nil {
		t.Fatalf("Failed to save connection: %v", err)
	}

	// Delete
	if err := storage.DeleteConnection(conn.ID); err != nil {
		t.Fatalf("Failed to delete connection: %v", err)
	}

	// Verify file is gone
	if storage.ConnectionExists(conn.ID) {
		t.Fatal("Encrypted file should not exist after delete")
	}

	// Try to load (should fail)
	var loaded testConnection
	if err := storage.LoadConnection(conn.ID, &loaded); err == nil {
		t.Fatal("Loading deleted connection should fail")
	}
}

func TestEncryptedStorage_ListConnectionIDs(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	// Save multiple connections
	ids := []string{"conn-1", "conn-2", "conn-3"}
	for _, id := range ids {
		conn := testConnection{
			ID:   id,
			Name: "Test " + id,
			URI:  "mongodb://localhost:27017",
		}
		if err := storage.SaveConnection(id, conn); err != nil {
			t.Fatalf("Failed to save connection %s: %v", id, err)
		}
	}

	// List
	listedIDs, err := storage.ListConnectionIDs()
	if err != nil {
		t.Fatalf("Failed to list connections: %v", err)
	}

	if len(listedIDs) != len(ids) {
		t.Errorf("Expected %d connections, got %d", len(ids), len(listedIDs))
	}

	// Verify all IDs are present
	idMap := make(map[string]bool)
	for _, id := range listedIDs {
		idMap[id] = true
	}
	for _, id := range ids {
		if !idMap[id] {
			t.Errorf("Connection ID %s not found in list", id)
		}
	}
}

func TestEncryptedStorage_CorruptedData(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	connID := "corrupted-test"

	// Write corrupted data directly to file
	filePath := filepath.Join(tmpDir, connID+encryptedFileExt)
	if err := os.WriteFile(filePath, []byte("corrupted data"), 0600); err != nil {
		t.Fatalf("Failed to write corrupted file: %v", err)
	}

	// Try to load (should fail)
	var loaded testConnection
	if err := storage.LoadConnection(connID, &loaded); err == nil {
		t.Fatal("Loading corrupted data should fail")
	}
}

func TestEncryptedStorage_EmptyDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	// List should return empty slice, not error
	ids, err := storage.ListConnectionIDs()
	if err != nil {
		t.Fatalf("Listing empty directory should not fail: %v", err)
	}
	if len(ids) != 0 {
		t.Errorf("Expected 0 connections in empty directory, got %d", len(ids))
	}
}

func TestEncryptedStorage_FilePermissions(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	conn := testConnection{
		ID:       "perm-test",
		Name:     "Permission Test",
		Password: "secret",
	}

	if err := storage.SaveConnection(conn.ID, conn); err != nil {
		t.Fatalf("Failed to save connection: %v", err)
	}

	// Check file permissions (should be 0600)
	filePath := filepath.Join(tmpDir, conn.ID+encryptedFileExt)
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("Failed to stat encrypted file: %v", err)
	}

	mode := info.Mode().Perm()
	if mode != 0600 {
		t.Errorf("Expected file permissions 0600, got %o", mode)
	}
}

func TestEncryptedStorage_RoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	storage, err := NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create encrypted storage: %v", err)
	}

	// Test with complex data including special characters
	conn := testConnection{
		ID:       "roundtrip-test",
		Name:     "Test with special chars: @#$%^&*()",
		URI:      "mongodb://user:p@ss:w%rd@localhost:27017/db?authSource=admin",
		Password: "p@ss:w%rd with spaces and 特殊字符",
		SSHKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z0...
-----END RSA PRIVATE KEY-----`,
	}

	// Save and load multiple times
	for i := 0; i < 3; i++ {
		if err := storage.SaveConnection(conn.ID, conn); err != nil {
			t.Fatalf("Round %d: Failed to save: %v", i, err)
		}

		var loaded testConnection
		if err := storage.LoadConnection(conn.ID, &loaded); err != nil {
			t.Fatalf("Round %d: Failed to load: %v", i, err)
		}

		if loaded.Name != conn.Name || loaded.URI != conn.URI || loaded.Password != conn.Password {
			t.Fatalf("Round %d: Data corruption detected", i)
		}
	}
}
