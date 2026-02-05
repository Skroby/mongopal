package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestFavoriteService(t *testing.T) {
	// Create temp directory for test
	tmpDir := t.TempDir()

	// Create service
	svc := NewFavoriteService(tmpDir)

	// Test AddFavorite
	t.Run("AddFavorite", func(t *testing.T) {
		err := svc.AddFavorite("conn1", "db1", "coll1")
		if err != nil {
			t.Fatalf("AddFavorite failed: %v", err)
		}

		// Verify it was added
		if !svc.IsFavorite("conn1", "db1", "coll1") {
			t.Error("Expected collection to be favorite")
		}
	})

	// Test IsFavorite returns false for non-favorite
	t.Run("IsFavorite_NonFavorite", func(t *testing.T) {
		if svc.IsFavorite("conn1", "db1", "nonexistent") {
			t.Error("Expected non-favorite to return false")
		}
	})

	// Test ListFavorites
	t.Run("ListFavorites", func(t *testing.T) {
		// Add another favorite
		err := svc.AddFavorite("conn1", "db2", "coll2")
		if err != nil {
			t.Fatalf("AddFavorite failed: %v", err)
		}

		favorites := svc.ListFavorites()
		if len(favorites) != 2 {
			t.Errorf("Expected 2 favorites, got %d", len(favorites))
		}
	})

	// Test RemoveFavorite
	t.Run("RemoveFavorite", func(t *testing.T) {
		err := svc.RemoveFavorite("conn1", "db1", "coll1")
		if err != nil {
			t.Fatalf("RemoveFavorite failed: %v", err)
		}

		if svc.IsFavorite("conn1", "db1", "coll1") {
			t.Error("Expected collection to no longer be favorite")
		}
	})

	// Test idempotent add (adding same favorite twice)
	t.Run("AddFavorite_Idempotent", func(t *testing.T) {
		err := svc.AddFavorite("conn1", "db2", "coll2")
		if err != nil {
			t.Fatalf("AddFavorite (idempotent) failed: %v", err)
		}

		favorites := svc.ListFavorites()
		// Should still only have 1 favorite (coll2), since coll1 was removed
		if len(favorites) != 1 {
			t.Errorf("Expected 1 favorite after idempotent add, got %d", len(favorites))
		}
	})

	// Test idempotent remove (removing non-favorite)
	t.Run("RemoveFavorite_Idempotent", func(t *testing.T) {
		err := svc.RemoveFavorite("conn1", "db1", "nonexistent")
		if err != nil {
			t.Fatalf("RemoveFavorite (idempotent) failed: %v", err)
		}
	})

	// Test RemoveFavoritesForConnection
	t.Run("RemoveFavoritesForConnection", func(t *testing.T) {
		// Add some favorites for conn1
		svc.AddFavorite("conn1", "db1", "coll1")
		svc.AddFavorite("conn1", "db1", "coll2")
		// Add favorite for conn2
		svc.AddFavorite("conn2", "db1", "coll1")

		// Remove all for conn1
		err := svc.RemoveFavoritesForConnection("conn1")
		if err != nil {
			t.Fatalf("RemoveFavoritesForConnection failed: %v", err)
		}

		// conn1 favorites should be gone
		if svc.IsFavorite("conn1", "db1", "coll1") {
			t.Error("Expected conn1 favorite to be removed")
		}
		if svc.IsFavorite("conn1", "db1", "coll2") {
			t.Error("Expected conn1 favorite to be removed")
		}

		// conn2 favorite should still exist
		if !svc.IsFavorite("conn2", "db1", "coll1") {
			t.Error("Expected conn2 favorite to remain")
		}
	})

	// Test persistence
	t.Run("Persistence", func(t *testing.T) {
		// Add a favorite and create new service to test loading
		svc.AddFavorite("conn3", "db1", "persistent")

		// Create new service with same config dir
		svc2 := NewFavoriteService(tmpDir)

		// Should have loaded the favorite
		if !svc2.IsFavorite("conn3", "db1", "persistent") {
			t.Error("Expected favorite to persist across service instances")
		}
	})

	// Test file is created
	t.Run("FileCreated", func(t *testing.T) {
		filePath := filepath.Join(tmpDir, "favorites.json")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Error("Expected favorites.json file to be created")
		}
	})
}

func TestMakeKey(t *testing.T) {
	key := makeKey("conn1", "db1", "coll1")
	expected := "conn1:db1:coll1"
	if key != expected {
		t.Errorf("Expected key %q, got %q", expected, key)
	}
}

func TestMakeDatabaseKey(t *testing.T) {
	key := makeDatabaseKey("conn1", "db1")
	expected := "db:conn1:db1"
	if key != expected {
		t.Errorf("Expected key %q, got %q", expected, key)
	}
}

func TestDatabaseFavorites(t *testing.T) {
	// Create temp directory for test
	tmpDir := t.TempDir()

	// Create service
	svc := NewFavoriteService(tmpDir)

	// Test AddDatabaseFavorite
	t.Run("AddDatabaseFavorite", func(t *testing.T) {
		err := svc.AddDatabaseFavorite("conn1", "db1")
		if err != nil {
			t.Fatalf("AddDatabaseFavorite failed: %v", err)
		}

		// Verify it was added
		if !svc.IsDatabaseFavorite("conn1", "db1") {
			t.Error("Expected database to be favorite")
		}
	})

	// Test IsDatabaseFavorite returns false for non-favorite
	t.Run("IsDatabaseFavorite_NonFavorite", func(t *testing.T) {
		if svc.IsDatabaseFavorite("conn1", "nonexistent") {
			t.Error("Expected non-favorite to return false")
		}
	})

	// Test ListDatabaseFavorites preserves order
	t.Run("ListDatabaseFavorites_Order", func(t *testing.T) {
		// Add more database favorites
		svc.AddDatabaseFavorite("conn1", "db2")
		svc.AddDatabaseFavorite("conn1", "db3")

		favorites := svc.ListDatabaseFavorites()
		if len(favorites) != 3 {
			t.Fatalf("Expected 3 database favorites, got %d", len(favorites))
		}

		// Order should be preserved (db1, db2, db3)
		expected := []string{"db:conn1:db1", "db:conn1:db2", "db:conn1:db3"}
		for i, key := range expected {
			if favorites[i] != key {
				t.Errorf("Expected favorites[%d] = %q, got %q", i, key, favorites[i])
			}
		}
	})

	// Test RemoveDatabaseFavorite
	t.Run("RemoveDatabaseFavorite", func(t *testing.T) {
		err := svc.RemoveDatabaseFavorite("conn1", "db2")
		if err != nil {
			t.Fatalf("RemoveDatabaseFavorite failed: %v", err)
		}

		if svc.IsDatabaseFavorite("conn1", "db2") {
			t.Error("Expected database to no longer be favorite")
		}

		// Order should be maintained for remaining items
		favorites := svc.ListDatabaseFavorites()
		expected := []string{"db:conn1:db1", "db:conn1:db3"}
		if len(favorites) != len(expected) {
			t.Fatalf("Expected %d favorites, got %d", len(expected), len(favorites))
		}
		for i, key := range expected {
			if favorites[i] != key {
				t.Errorf("Expected favorites[%d] = %q, got %q", i, key, favorites[i])
			}
		}
	})

	// Test idempotent add (adding same favorite twice)
	t.Run("AddDatabaseFavorite_Idempotent", func(t *testing.T) {
		err := svc.AddDatabaseFavorite("conn1", "db1")
		if err != nil {
			t.Fatalf("AddDatabaseFavorite (idempotent) failed: %v", err)
		}

		favorites := svc.ListDatabaseFavorites()
		if len(favorites) != 2 {
			t.Errorf("Expected 2 database favorites after idempotent add, got %d", len(favorites))
		}
	})

	// Test idempotent remove (removing non-favorite)
	t.Run("RemoveDatabaseFavorite_Idempotent", func(t *testing.T) {
		err := svc.RemoveDatabaseFavorite("conn1", "nonexistent")
		if err != nil {
			t.Fatalf("RemoveDatabaseFavorite (idempotent) failed: %v", err)
		}
	})

	// Test database favorites don't interfere with collection favorites
	t.Run("DatabaseAndCollectionFavoritesIndependent", func(t *testing.T) {
		// Add collection favorite with same conn and db
		svc.AddFavorite("conn1", "db1", "coll1")

		// Database favorite should still exist
		if !svc.IsDatabaseFavorite("conn1", "db1") {
			t.Error("Database favorite should still exist")
		}

		// Collection favorite should also exist
		if !svc.IsFavorite("conn1", "db1", "coll1") {
			t.Error("Collection favorite should exist")
		}

		// List functions should return correct counts
		dbFavs := svc.ListDatabaseFavorites()
		collFavs := svc.ListFavorites()

		if len(dbFavs) != 2 {
			t.Errorf("Expected 2 database favorites, got %d", len(dbFavs))
		}
		foundCollFav := false
		for _, k := range collFavs {
			if k == "conn1:db1:coll1" {
				foundCollFav = true
				break
			}
		}
		if !foundCollFav {
			t.Error("Collection favorite not found in ListFavorites")
		}
	})
}

func TestRemoveFavoritesForConnection_IncludesDatabases(t *testing.T) {
	tmpDir := t.TempDir()
	svc := NewFavoriteService(tmpDir)

	// Add collection favorites for conn1
	svc.AddFavorite("conn1", "db1", "coll1")
	svc.AddFavorite("conn1", "db1", "coll2")

	// Add database favorites for conn1
	svc.AddDatabaseFavorite("conn1", "db1")
	svc.AddDatabaseFavorite("conn1", "db2")

	// Add favorites for conn2 (should be preserved)
	svc.AddFavorite("conn2", "db1", "coll1")
	svc.AddDatabaseFavorite("conn2", "db1")

	// Remove all for conn1
	err := svc.RemoveFavoritesForConnection("conn1")
	if err != nil {
		t.Fatalf("RemoveFavoritesForConnection failed: %v", err)
	}

	// conn1 collection favorites should be gone
	if svc.IsFavorite("conn1", "db1", "coll1") {
		t.Error("Expected conn1 collection favorite to be removed")
	}
	if svc.IsFavorite("conn1", "db1", "coll2") {
		t.Error("Expected conn1 collection favorite to be removed")
	}

	// conn1 database favorites should be gone
	if svc.IsDatabaseFavorite("conn1", "db1") {
		t.Error("Expected conn1 database favorite to be removed")
	}
	if svc.IsDatabaseFavorite("conn1", "db2") {
		t.Error("Expected conn1 database favorite to be removed")
	}

	// conn2 favorites should still exist
	if !svc.IsFavorite("conn2", "db1", "coll1") {
		t.Error("Expected conn2 collection favorite to remain")
	}
	if !svc.IsDatabaseFavorite("conn2", "db1") {
		t.Error("Expected conn2 database favorite to remain")
	}

	// conn2 database should be the only one in the order list
	dbFavs := svc.ListDatabaseFavorites()
	if len(dbFavs) != 1 || dbFavs[0] != "db:conn2:db1" {
		t.Errorf("Expected only conn2 database favorite to remain, got %v", dbFavs)
	}
}

func TestLegacyFormatMigration(t *testing.T) {
	tmpDir := t.TempDir()

	// Write legacy format file (plain array)
	legacyData := []string{
		"conn1:db1:coll1",
		"conn1:db1:coll2",
		"db:conn1:db1",
		"db:conn1:db2",
	}
	jsonData, _ := json.MarshalIndent(legacyData, "", "  ")
	os.WriteFile(filepath.Join(tmpDir, "favorites.json"), jsonData, 0600)

	// Load service
	svc := NewFavoriteService(tmpDir)

	// Collection favorites should be loaded
	if !svc.IsFavorite("conn1", "db1", "coll1") {
		t.Error("Expected collection favorite coll1 to be migrated")
	}
	if !svc.IsFavorite("conn1", "db1", "coll2") {
		t.Error("Expected collection favorite coll2 to be migrated")
	}

	// Database favorites should be loaded with order preserved
	if !svc.IsDatabaseFavorite("conn1", "db1") {
		t.Error("Expected database favorite db1 to be migrated")
	}
	if !svc.IsDatabaseFavorite("conn1", "db2") {
		t.Error("Expected database favorite db2 to be migrated")
	}

	dbFavs := svc.ListDatabaseFavorites()
	if len(dbFavs) != 2 {
		t.Fatalf("Expected 2 database favorites, got %d", len(dbFavs))
	}
	// Order should match legacy file order
	if dbFavs[0] != "db:conn1:db1" || dbFavs[1] != "db:conn1:db2" {
		t.Errorf("Expected db1, db2 order, got %v", dbFavs)
	}
}

func TestNewFormatPersistence(t *testing.T) {
	tmpDir := t.TempDir()
	svc := NewFavoriteService(tmpDir)

	// Add some favorites
	svc.AddFavorite("conn1", "db1", "coll1")
	svc.AddDatabaseFavorite("conn1", "db1")
	svc.AddDatabaseFavorite("conn1", "db2")

	// Read the file and verify format
	data, err := os.ReadFile(filepath.Join(tmpDir, "favorites.json"))
	if err != nil {
		t.Fatalf("Failed to read favorites file: %v", err)
	}

	var stored favoritesData
	if err := json.Unmarshal(data, &stored); err != nil {
		t.Fatalf("Failed to parse favorites file: %v", err)
	}

	if len(stored.Collections) != 1 {
		t.Errorf("Expected 1 collection favorite, got %d", len(stored.Collections))
	}
	if len(stored.DatabaseOrder) != 2 {
		t.Errorf("Expected 2 database favorites, got %d", len(stored.DatabaseOrder))
	}

	// Verify order is preserved
	if stored.DatabaseOrder[0] != "db:conn1:db1" || stored.DatabaseOrder[1] != "db:conn1:db2" {
		t.Errorf("Database order not preserved: %v", stored.DatabaseOrder)
	}
}
