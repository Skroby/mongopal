package storage

import (
	"encoding/json"
	"strings"
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

func TestDuplicateConnection_ClonesAllSettingsWithNewIDAndName(t *testing.T) {
	svc := setupTestConnectionService(t)

	fd := `{"id":"conn-fd","name":"Original","connectionType":"standalone","hosts":[{"host":"db.example.com","port":27017}],"username":"admin","authMechanism":"scram-sha-256","authDatabase":"admin","tlsEnabled":true,"maxPoolSize":50,"retryWrites":true,"readPreference":"secondary","appName":"myapp","connectTimeout":10}`
	conn := types.ExtendedConnection{
		ID:                     "conn-fd",
		Name:                   "Original",
		FolderID:               "folder-1",
		Color:                  "#FF0000",
		ReadOnly:               true,
		MongoURI:               "mongodb://admin:secret@db.example.com:27017/?authSource=admin",
		SSHEnabled:             true,
		SSHHost:                "bastion.example.com",
		SSHPort:                2222,
		SSHUser:                "deploy",
		SSHPassword:            "sshpass",
		SSHPrivateKey:          "-----BEGIN RSA-----",
		SSHPassphrase:          "keypass",
		TLSEnabled:             true,
		TLSInsecure:            true,
		TLSCAFile:              "ca-cert-content",
		TLSCertFile:            "client-cert-content",
		TLSKeyFile:             "client-key-content",
		TLSKeyPassword:         "tlspass",
		RequireDeleteConfirmation: true,
		FormData:               fd,
	}
	svc.SaveExtendedConnection(conn)

	dup, err := svc.DuplicateConnection("conn-fd", "Original (copy)")
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}

	// ID must be new
	if dup.ID == "conn-fd" {
		t.Error("duplicate must have a new ID")
	}
	if dup.Name != "Original (copy)" {
		t.Errorf("expected name 'Original (copy)', got %q", dup.Name)
	}

	// Load the full extended connection to verify all fields
	dupExt, err := svc.GetExtendedConnection(dup.ID)
	if err != nil {
		t.Fatalf("load dup: %v", err)
	}

	// Verify new ID and name
	if dupExt.ID == "conn-fd" {
		t.Error("extended dup must have a new ID")
	}
	if dupExt.Name != "Original (copy)" {
		t.Errorf("expected name 'Original (copy)', got %q", dupExt.Name)
	}

	// Verify all other fields are cloned from original
	if dupExt.FolderID != "folder-1" {
		t.Errorf("FolderID: expected 'folder-1', got %q", dupExt.FolderID)
	}
	if dupExt.Color != "#FF0000" {
		t.Errorf("Color: expected '#FF0000', got %q", dupExt.Color)
	}
	if !dupExt.ReadOnly {
		t.Error("ReadOnly should be true")
	}
	if dupExt.MongoURI != "mongodb://admin:secret@db.example.com:27017/?authSource=admin" {
		t.Errorf("MongoURI not cloned: got %q", dupExt.MongoURI)
	}
	if !dupExt.SSHEnabled || dupExt.SSHHost != "bastion.example.com" || dupExt.SSHPort != 2222 || dupExt.SSHUser != "deploy" {
		t.Errorf("SSH settings not cloned: enabled=%v host=%q port=%d user=%q", dupExt.SSHEnabled, dupExt.SSHHost, dupExt.SSHPort, dupExt.SSHUser)
	}
	if dupExt.SSHPassword != "sshpass" || dupExt.SSHPrivateKey != "-----BEGIN RSA-----" || dupExt.SSHPassphrase != "keypass" {
		t.Error("SSH credentials not cloned")
	}
	if !dupExt.TLSEnabled || !dupExt.TLSInsecure {
		t.Error("TLS settings not cloned")
	}
	if dupExt.TLSCAFile != "ca-cert-content" || dupExt.TLSCertFile != "client-cert-content" || dupExt.TLSKeyFile != "client-key-content" || dupExt.TLSKeyPassword != "tlspass" {
		t.Error("TLS credentials not cloned")
	}
	if !dupExt.RequireDeleteConfirmation {
		t.Error("RequireDeleteConfirmation should be true")
	}

	// Verify FormData has new id/name but preserves everything else
	var parsed map[string]any
	if err := json.Unmarshal([]byte(dupExt.FormData), &parsed); err != nil {
		t.Fatalf("parse FormData: %v", err)
	}
	if parsed["id"] != dup.ID {
		t.Errorf("FormData id: expected %q, got %v", dup.ID, parsed["id"])
	}
	if parsed["name"] != "Original (copy)" {
		t.Errorf("FormData name: expected 'Original (copy)', got %v", parsed["name"])
	}
	// All other FormData fields preserved
	if parsed["connectionType"] != "standalone" {
		t.Errorf("FormData connectionType not preserved: got %v", parsed["connectionType"])
	}
	if parsed["username"] != "admin" {
		t.Errorf("FormData username not preserved: got %v", parsed["username"])
	}
	if parsed["authMechanism"] != "scram-sha-256" {
		t.Errorf("FormData authMechanism not preserved: got %v", parsed["authMechanism"])
	}
	if parsed["tlsEnabled"] != true {
		t.Errorf("FormData tlsEnabled not preserved: got %v", parsed["tlsEnabled"])
	}
	if parsed["retryWrites"] != true {
		t.Errorf("FormData retryWrites not preserved: got %v", parsed["retryWrites"])
	}
	if parsed["readPreference"] != "secondary" {
		t.Errorf("FormData readPreference not preserved: got %v", parsed["readPreference"])
	}
	if parsed["appName"] != "myapp" {
		t.Errorf("FormData appName not preserved: got %v", parsed["appName"])
	}
}

// =============================================================================
// GetConnectionURI — FormData-based URI building
// =============================================================================

func TestGetConnectionURI_FromFormData(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Build FormData JSON for a standalone connection
	fd := types.ConnectionFormData{
		ConnectionType: "standalone",
		Hosts:          []types.HostPort{{Host: "k8s-internal.example.com", Port: 27017}},
		Username:       "admin",
		AuthMechanism:  "none",
		RetryWrites:    true,
	}
	fdJSON, _ := json.Marshal(fd)

	conn := types.ExtendedConnection{
		ID:       "conn-form",
		Name:     "Standalone K8s",
		MongoURI: "mongodb://admin:s3cret@k8s-internal.example.com:27017/",
		FormData: string(fdJSON),
	}

	if err := svc.SaveExtendedConnection(conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	uri, err := svc.GetConnectionURI("conn-form")
	if err != nil {
		t.Fatalf("get uri: %v", err)
	}

	// Must include directConnection=true (the whole reason for this change)
	if !strings.Contains(uri, "directConnection=true") {
		t.Errorf("expected directConnection=true in URI, got %s", uri)
	}

	// Must include credentials
	if !strings.Contains(uri, "admin:s3cret@") {
		t.Errorf("expected credentials in URI, got %s", uri)
	}

	// Must NOT contain mongopal.* params
	if strings.Contains(uri, "mongopal.") {
		t.Errorf("expected no mongopal.* params in URI, got %s", uri)
	}
}

func TestGetConnectionURI_LegacyFallback(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Legacy connection: no FormData, just MongoURI
	conn := types.ExtendedConnection{
		ID:       "conn-legacy",
		Name:     "Legacy",
		MongoURI: "mongodb://user:pass@localhost:27017/mydb?authSource=admin",
	}

	if err := svc.SaveExtendedConnection(conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	uri, err := svc.GetConnectionURI("conn-legacy")
	if err != nil {
		t.Fatalf("get uri: %v", err)
	}

	// Should return stored MongoURI (no FormData to build from)
	if uri != "mongodb://user:pass@localhost:27017/mydb?authSource=admin" {
		t.Errorf("expected legacy URI returned, got %s", uri)
	}
}

func TestGetConnectionURI_StripsVendorParamsLegacy(t *testing.T) {
	svc := setupTestConnectionService(t)

	// Legacy connection with vendor params in the URI
	conn := types.ExtendedConnection{
		ID:       "conn-vendor",
		Name:     "Vendor",
		MongoURI: "mongodb://localhost:27017/?directConnection=true&mongopal.ssh.enabled=true&mongopal.ssh.host=bastion",
	}

	if err := svc.SaveExtendedConnection(conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	uri, err := svc.GetConnectionURI("conn-vendor")
	if err != nil {
		t.Fatalf("get uri: %v", err)
	}

	// Vendor params should be stripped
	if strings.Contains(uri, "mongopal.") {
		t.Errorf("expected vendor params stripped, got %s", uri)
	}

	// Non-vendor params should be preserved
	if !strings.Contains(uri, "directConnection=true") {
		t.Errorf("expected directConnection=true preserved, got %s", uri)
	}
}

func TestGetConnectionURI_FormDataWithReplicaSet(t *testing.T) {
	svc := setupTestConnectionService(t)

	fd := types.ConnectionFormData{
		ConnectionType: "replicaset",
		Hosts: []types.HostPort{
			{Host: "host1", Port: 27017},
			{Host: "host2", Port: 27018},
		},
		ReplicaSetName: "rs0",
		Username:       "admin",
		AuthMechanism:  "scram-sha-256",
		AuthDatabase:   "admin",
		RetryWrites:    true,
	}
	fdJSON, _ := json.Marshal(fd)

	conn := types.ExtendedConnection{
		ID:       "conn-rs",
		Name:     "ReplicaSet",
		MongoURI: "mongodb://admin:pass@host1:27017,host2:27018/?replicaSet=rs0",
		FormData: string(fdJSON),
	}

	if err := svc.SaveExtendedConnection(conn); err != nil {
		t.Fatalf("save: %v", err)
	}

	uri, err := svc.GetConnectionURI("conn-rs")
	if err != nil {
		t.Fatalf("get uri: %v", err)
	}

	// Should have replica set params
	if !strings.Contains(uri, "replicaSet=rs0") {
		t.Errorf("expected replicaSet=rs0 in URI, got %s", uri)
	}
	if !strings.Contains(uri, "authMechanism=SCRAM-SHA-256") {
		t.Errorf("expected authMechanism in URI, got %s", uri)
	}
	// Should NOT have directConnection
	if strings.Contains(uri, "directConnection") {
		t.Errorf("replicaset should not have directConnection, got %s", uri)
	}
}
