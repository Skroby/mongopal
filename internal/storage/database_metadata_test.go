package storage

import (
	"testing"
	"time"
)

func TestDatabaseMetadataService(t *testing.T) {
	tmpDir := t.TempDir()
	svc := NewDatabaseMetadataService(tmpDir)

	t.Run("UpdateAndGetDatabaseAccessed", func(t *testing.T) {
		err := svc.UpdateDatabaseAccessed("conn1", "db1")
		if err != nil {
			t.Fatalf("UpdateDatabaseAccessed failed: %v", err)
		}

		lastAccessed := svc.GetDatabaseLastAccessed("conn1", "db1")
		if lastAccessed.IsZero() {
			t.Error("Expected non-zero last accessed time")
		}

		// Should be recent (within last second)
		if time.Since(lastAccessed) > time.Second {
			t.Error("Last accessed time should be recent")
		}
	})

	t.Run("GetDatabaseLastAccessed_NotFound", func(t *testing.T) {
		lastAccessed := svc.GetDatabaseLastAccessed("conn1", "nonexistent")
		if !lastAccessed.IsZero() {
			t.Error("Expected zero time for non-existent database")
		}
	})

	t.Run("GetAllDatabaseMetadata", func(t *testing.T) {
		// Add more databases
		svc.UpdateDatabaseAccessed("conn1", "db2")
		svc.UpdateDatabaseAccessed("conn1", "db3")
		svc.UpdateDatabaseAccessed("conn2", "db1") // Different connection

		metadata := svc.GetAllDatabaseMetadata("conn1")
		if len(metadata) != 3 {
			t.Errorf("Expected 3 databases for conn1, got %d", len(metadata))
		}

		if _, ok := metadata["db1"]; !ok {
			t.Error("Expected db1 in metadata")
		}
		if _, ok := metadata["db2"]; !ok {
			t.Error("Expected db2 in metadata")
		}
		if _, ok := metadata["db3"]; !ok {
			t.Error("Expected db3 in metadata")
		}

		// conn2 should only have db1
		metadata2 := svc.GetAllDatabaseMetadata("conn2")
		if len(metadata2) != 1 {
			t.Errorf("Expected 1 database for conn2, got %d", len(metadata2))
		}
	})

	t.Run("RemoveDatabaseMetadata", func(t *testing.T) {
		err := svc.RemoveDatabaseMetadata("conn1", "db2")
		if err != nil {
			t.Fatalf("RemoveDatabaseMetadata failed: %v", err)
		}

		lastAccessed := svc.GetDatabaseLastAccessed("conn1", "db2")
		if !lastAccessed.IsZero() {
			t.Error("Expected zero time after removal")
		}

		// Other databases should still exist
		metadata := svc.GetAllDatabaseMetadata("conn1")
		if len(metadata) != 2 {
			t.Errorf("Expected 2 databases after removal, got %d", len(metadata))
		}
	})

	t.Run("RemoveDatabaseMetadata_Idempotent", func(t *testing.T) {
		err := svc.RemoveDatabaseMetadata("conn1", "nonexistent")
		if err != nil {
			t.Fatalf("RemoveDatabaseMetadata (idempotent) failed: %v", err)
		}
	})

	t.Run("RemoveMetadataForConnection", func(t *testing.T) {
		err := svc.RemoveMetadataForConnection("conn1")
		if err != nil {
			t.Fatalf("RemoveMetadataForConnection failed: %v", err)
		}

		metadata := svc.GetAllDatabaseMetadata("conn1")
		if len(metadata) != 0 {
			t.Errorf("Expected 0 databases after connection removal, got %d", len(metadata))
		}

		// conn2 should still have its data
		metadata2 := svc.GetAllDatabaseMetadata("conn2")
		if len(metadata2) != 1 {
			t.Errorf("Expected 1 database for conn2 after conn1 removal, got %d", len(metadata2))
		}
	})

	t.Run("CleanupStaleDatabases", func(t *testing.T) {
		// Add some databases
		svc.UpdateDatabaseAccessed("conn3", "db1")
		svc.UpdateDatabaseAccessed("conn3", "db2")
		svc.UpdateDatabaseAccessed("conn3", "db3")
		svc.UpdateDatabaseAccessed("conn3", "db4")

		// Simulate that only db1 and db3 exist now
		currentDatabases := []string{"db1", "db3"}
		err := svc.CleanupStaleDatabases("conn3", currentDatabases)
		if err != nil {
			t.Fatalf("CleanupStaleDatabases failed: %v", err)
		}

		metadata := svc.GetAllDatabaseMetadata("conn3")
		if len(metadata) != 2 {
			t.Errorf("Expected 2 databases after cleanup, got %d", len(metadata))
		}

		if _, ok := metadata["db1"]; !ok {
			t.Error("Expected db1 to remain after cleanup")
		}
		if _, ok := metadata["db3"]; !ok {
			t.Error("Expected db3 to remain after cleanup")
		}
		if _, ok := metadata["db2"]; ok {
			t.Error("Expected db2 to be removed after cleanup")
		}
		if _, ok := metadata["db4"]; ok {
			t.Error("Expected db4 to be removed after cleanup")
		}
	})

	t.Run("Persistence", func(t *testing.T) {
		svc.UpdateDatabaseAccessed("conn4", "persistent_db")

		// Create new service with same config dir
		svc2 := NewDatabaseMetadataService(tmpDir)

		lastAccessed := svc2.GetDatabaseLastAccessed("conn4", "persistent_db")
		if lastAccessed.IsZero() {
			t.Error("Expected database metadata to persist across service instances")
		}
	})
}

func TestMakeDbMetaKey(t *testing.T) {
	key := makeDbMetaKey("conn1", "db1")
	expected := "conn1:db1"
	if key != expected {
		t.Errorf("Expected key %q, got %q", expected, key)
	}
}
