package storage

import (
	"testing"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/credential"
	"github.com/peternagy/mongopal/internal/types"
)

func setupTestConnectionService(t *testing.T) *ConnectionService {
	t.Helper()
	tmpDir := t.TempDir()
	state := core.NewAppState()
	state.DisableEvents = true

	encStorage, err := credential.NewEncryptedStorage(tmpDir)
	if err != nil {
		t.Fatalf("failed to create encrypted storage: %v", err)
	}

	return NewConnectionService(state, nil, encStorage)
}

// =============================================================================
// SaveExtendedConnection — password preservation
// =============================================================================

func TestSaveExtendedConnection_NewConnection(t *testing.T) {
	svc := setupTestConnectionService(t)

	conn := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:pass123@localhost:27017/",
	}

	if err := svc.SaveExtendedConnection(conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	// Verify stored URI retains password
	uri, err := svc.GetConnectionURI("conn-1")
	if err != nil {
		t.Fatalf("get uri: %v", err)
	}
	if uri != "mongodb://user:pass123@localhost:27017/" {
		t.Errorf("expected password in stored URI, got %s", uri)
	}

	// Verify in-memory URI has password stripped
	conns, _ := svc.ListSavedConnections()
	if len(conns) != 1 {
		t.Fatalf("expected 1 connection, got %d", len(conns))
	}
	if conns[0].URI != "mongodb://user@localhost:27017/" {
		t.Errorf("expected password stripped from in-memory URI, got %s", conns[0].URI)
	}
}

func TestSaveExtendedConnection_PreservesMongoPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Save initial connection with password
	initial := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:originalpass@localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(initial); err != nil {
		t.Fatalf("initial save: %v", err)
	}

	// Save again WITHOUT password (simulates form save without reveal)
	updated := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test Updated",
		MongoURI: "mongodb://user@localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(updated); err != nil {
		t.Fatalf("update save: %v", err)
	}

	// Verify original password is preserved
	uri, _ := svc.GetConnectionURI("conn-1")
	if uri != "mongodb://user:originalpass@localhost:27017/" {
		t.Errorf("expected original password preserved, got %s", uri)
	}

	// Verify name was updated
	conns, _ := svc.ListSavedConnections()
	if conns[0].Name != "Test Updated" {
		t.Errorf("expected name updated, got %s", conns[0].Name)
	}
}

func TestSaveExtendedConnection_UpdatesMongoPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Save initial
	initial := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:oldpass@localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(initial); err != nil {
		t.Fatalf("initial save: %v", err)
	}

	// Update with new password (user revealed and changed it)
	updated := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:newpass@localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(updated); err != nil {
		t.Fatalf("update save: %v", err)
	}

	// Verify new password is stored
	uri, _ := svc.GetConnectionURI("conn-1")
	if uri != "mongodb://user:newpass@localhost:27017/" {
		t.Errorf("expected new password, got %s", uri)
	}
}

func TestSaveExtendedConnection_PreservesSSHPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	initial := types.ExtendedConnection{
		ID:            "conn-1",
		Name:          "Test",
		MongoURI:      "mongodb://localhost:27017/",
		SSHEnabled:    true,
		SSHPassword:   "ssh-secret",
		SSHPassphrase: "key-phrase",
	}
	if err := svc.SaveExtendedConnection(initial); err != nil {
		t.Fatalf("initial save: %v", err)
	}

	// Update without SSH passwords
	updated := types.ExtendedConnection{
		ID:         "conn-1",
		Name:       "Test",
		MongoURI:   "mongodb://localhost:27017/",
		SSHEnabled: true,
		SSHHost:    "bastion.example.com",
		// SSHPassword and SSHPassphrase empty (not revealed)
	}
	if err := svc.SaveExtendedConnection(updated); err != nil {
		t.Fatalf("update save: %v", err)
	}

	// Verify SSH credentials preserved
	var loaded types.ExtendedConnection
	if err := svc.encryptedStorage.LoadConnection("conn-1", &loaded); err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.SSHPassword != "ssh-secret" {
		t.Errorf("expected SSH password preserved, got %q", loaded.SSHPassword)
	}
	if loaded.SSHPassphrase != "key-phrase" {
		t.Errorf("expected SSH passphrase preserved, got %q", loaded.SSHPassphrase)
	}
	if loaded.SSHHost != "bastion.example.com" {
		t.Errorf("expected SSH host updated, got %q", loaded.SSHHost)
	}
}

func TestSaveExtendedConnection_PreservesSOCKS5Password(t *testing.T) {
	svc := setupTestConnectionService(t)

	initial := types.ExtendedConnection{
		ID:             "conn-1",
		Name:           "Test",
		MongoURI:       "mongodb://localhost:27017/",
		SOCKS5Password: "socks-secret",
	}
	if err := svc.SaveExtendedConnection(initial); err != nil {
		t.Fatalf("initial save: %v", err)
	}

	updated := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test Updated",
		MongoURI: "mongodb://localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(updated); err != nil {
		t.Fatalf("update save: %v", err)
	}

	var loaded types.ExtendedConnection
	svc.encryptedStorage.LoadConnection("conn-1", &loaded)
	if loaded.SOCKS5Password != "socks-secret" {
		t.Errorf("expected SOCKS5 password preserved, got %q", loaded.SOCKS5Password)
	}
}

func TestSaveExtendedConnection_PreservesTLSKeyPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	initial := types.ExtendedConnection{
		ID:             "conn-1",
		Name:           "Test",
		MongoURI:       "mongodb://localhost:27017/",
		TLSKeyPassword: "tls-key-secret",
	}
	if err := svc.SaveExtendedConnection(initial); err != nil {
		t.Fatalf("initial save: %v", err)
	}

	updated := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test Updated",
		MongoURI: "mongodb://localhost:27017/",
	}
	if err := svc.SaveExtendedConnection(updated); err != nil {
		t.Fatalf("update save: %v", err)
	}

	var loaded types.ExtendedConnection
	svc.encryptedStorage.LoadConnection("conn-1", &loaded)
	if loaded.TLSKeyPassword != "tls-key-secret" {
		t.Errorf("expected TLS key password preserved, got %q", loaded.TLSKeyPassword)
	}
}

// =============================================================================
// MergeStoredCredentials
// =============================================================================

func TestMergeStoredCredentials_InjectsStoredPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Save connection with password
	conn := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:storedpass@localhost:27017/",
	}
	svc.SaveExtendedConnection(conn)

	// Merge into URI without password
	result := svc.MergeStoredCredentials("conn-1", "mongodb://user@localhost:27017/?authMechanism=SCRAM-SHA-256")
	if result != "mongodb://user:storedpass@localhost:27017/?authMechanism=SCRAM-SHA-256" {
		t.Errorf("expected stored password injected, got %s", result)
	}
}

func TestMergeStoredCredentials_KeepsNewPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	conn := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://user:oldpass@localhost:27017/",
	}
	svc.SaveExtendedConnection(conn)

	// URI already has a password — should not override
	result := svc.MergeStoredCredentials("conn-1", "mongodb://user:newpass@localhost:27017/")
	if result != "mongodb://user:newpass@localhost:27017/" {
		t.Errorf("expected new password kept, got %s", result)
	}
}

func TestMergeStoredCredentials_NonexistentConnection(t *testing.T) {
	svc := setupTestConnectionService(t)

	uri := "mongodb://user@localhost:27017/"
	result := svc.MergeStoredCredentials("nonexistent", uri)
	if result != uri {
		t.Errorf("expected original URI returned, got %s", result)
	}
}

func TestMergeStoredCredentials_NoStoredPassword(t *testing.T) {
	svc := setupTestConnectionService(t)

	conn := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Test",
		MongoURI: "mongodb://localhost:27017/",
	}
	svc.SaveExtendedConnection(conn)

	uri := "mongodb://user@localhost:27017/"
	result := svc.MergeStoredCredentials("conn-1", uri)
	if result != uri {
		t.Errorf("expected original URI returned, got %s", result)
	}
}

// =============================================================================
// DuplicateConnection — password stripping in memory
// =============================================================================

func TestDuplicateConnection_StripsPasswordFromMemory(t *testing.T) {
	svc := setupTestConnectionService(t)

	conn := types.ExtendedConnection{
		ID:       "conn-1",
		Name:     "Original",
		MongoURI: "mongodb://user:secret@localhost:27017/",
	}
	svc.SaveExtendedConnection(conn)

	dup, err := svc.DuplicateConnection("conn-1", "Copy of Original")
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}

	// In-memory URI should be stripped
	if dup.URI != "mongodb://user@localhost:27017/" {
		t.Errorf("expected password stripped from duplicated in-memory URI, got %s", dup.URI)
	}

	// But stored URI should have password
	uri, _ := svc.GetConnectionURI(dup.ID)
	if uri != "mongodb://user:secret@localhost:27017/" {
		t.Errorf("expected password in stored duplicate URI, got %s", uri)
	}
}
