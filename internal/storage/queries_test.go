package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/peternagy/mongopal/internal/types"
)

func TestQueryService_SaveAndGet(t *testing.T) {
	// Create temp directory for test
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Test saving a new query
	query := types.SavedQuery{
		Name:         "Test Query",
		Description:  "A test query",
		ConnectionID: "conn-123",
		Database:     "testdb",
		Collection:   "users",
		Query:        `{"active": true}`,
	}

	saved, err := svc.SaveQuery(query)
	if err != nil {
		t.Fatalf("SaveQuery failed: %v", err)
	}

	if saved.ID == "" {
		t.Error("Expected saved query to have an ID")
	}
	if saved.Name != "Test Query" {
		t.Errorf("Expected name 'Test Query', got '%s'", saved.Name)
	}
	if saved.CreatedAt.IsZero() {
		t.Error("Expected CreatedAt to be set")
	}
	if saved.UpdatedAt.IsZero() {
		t.Error("Expected UpdatedAt to be set")
	}

	// Test getting the saved query
	retrieved, err := svc.GetQuery(saved.ID)
	if err != nil {
		t.Fatalf("GetQuery failed: %v", err)
	}
	if retrieved.Name != saved.Name {
		t.Errorf("Expected name '%s', got '%s'", saved.Name, retrieved.Name)
	}
}

func TestQueryService_UpdateQuery(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Save initial query
	query := types.SavedQuery{
		Name:         "Original Name",
		ConnectionID: "conn-123",
		Database:     "testdb",
		Collection:   "users",
		Query:        `{"active": true}`,
	}

	saved, err := svc.SaveQuery(query)
	if err != nil {
		t.Fatalf("SaveQuery failed: %v", err)
	}

	// Update the query
	saved.Name = "Updated Name"
	saved.Description = "Now with description"

	updated, err := svc.SaveQuery(saved)
	if err != nil {
		t.Fatalf("Update SaveQuery failed: %v", err)
	}

	if updated.Name != "Updated Name" {
		t.Errorf("Expected name 'Updated Name', got '%s'", updated.Name)
	}
	if updated.Description != "Now with description" {
		t.Errorf("Expected description 'Now with description', got '%s'", updated.Description)
	}
	if updated.CreatedAt != saved.CreatedAt {
		t.Error("CreatedAt should not change on update")
	}
	if !updated.UpdatedAt.After(saved.CreatedAt) {
		t.Error("UpdatedAt should be after CreatedAt")
	}
}

func TestQueryService_ListQueries(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Save multiple queries
	queries := []types.SavedQuery{
		{Name: "Query 1", ConnectionID: "conn-1", Database: "db1", Collection: "coll1", Query: "{}"},
		{Name: "Query 2", ConnectionID: "conn-1", Database: "db1", Collection: "coll2", Query: "{}"},
		{Name: "Query 3", ConnectionID: "conn-2", Database: "db2", Collection: "coll1", Query: "{}"},
	}

	for _, q := range queries {
		if _, err := svc.SaveQuery(q); err != nil {
			t.Fatalf("SaveQuery failed: %v", err)
		}
	}

	// Test list all
	all, err := svc.ListQueries("", "", "")
	if err != nil {
		t.Fatalf("ListQueries failed: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("Expected 3 queries, got %d", len(all))
	}

	// Test filter by connection
	byConn, err := svc.ListQueries("conn-1", "", "")
	if err != nil {
		t.Fatalf("ListQueries failed: %v", err)
	}
	if len(byConn) != 2 {
		t.Errorf("Expected 2 queries for conn-1, got %d", len(byConn))
	}

	// Test filter by database
	byDb, err := svc.ListQueries("conn-1", "db1", "")
	if err != nil {
		t.Fatalf("ListQueries failed: %v", err)
	}
	if len(byDb) != 2 {
		t.Errorf("Expected 2 queries for db1, got %d", len(byDb))
	}

	// Test filter by collection
	byColl, err := svc.ListQueries("conn-1", "db1", "coll1")
	if err != nil {
		t.Fatalf("ListQueries failed: %v", err)
	}
	if len(byColl) != 1 {
		t.Errorf("Expected 1 query for coll1, got %d", len(byColl))
	}
}

func TestQueryService_DeleteQuery(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Save a query
	query := types.SavedQuery{
		Name:         "To Delete",
		ConnectionID: "conn-123",
		Database:     "testdb",
		Collection:   "users",
		Query:        `{}`,
	}

	saved, err := svc.SaveQuery(query)
	if err != nil {
		t.Fatalf("SaveQuery failed: %v", err)
	}

	// Delete it
	err = svc.DeleteQuery(saved.ID)
	if err != nil {
		t.Fatalf("DeleteQuery failed: %v", err)
	}

	// Verify it's gone
	_, err = svc.GetQuery(saved.ID)
	if err == nil {
		t.Error("Expected error when getting deleted query")
	}
	if _, ok := err.(*QueryNotFoundError); !ok {
		t.Errorf("Expected QueryNotFoundError, got %T", err)
	}
}

func TestQueryService_DeleteQueriesForConnection(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Save queries for different connections
	queries := []types.SavedQuery{
		{Name: "Query 1", ConnectionID: "conn-to-delete", Database: "db1", Collection: "coll1", Query: "{}"},
		{Name: "Query 2", ConnectionID: "conn-to-delete", Database: "db2", Collection: "coll2", Query: "{}"},
		{Name: "Query 3", ConnectionID: "conn-to-keep", Database: "db1", Collection: "coll1", Query: "{}"},
	}

	for _, q := range queries {
		if _, err := svc.SaveQuery(q); err != nil {
			t.Fatalf("SaveQuery failed: %v", err)
		}
	}

	// Delete queries for one connection
	err = svc.DeleteQueriesForConnection("conn-to-delete")
	if err != nil {
		t.Fatalf("DeleteQueriesForConnection failed: %v", err)
	}

	// Verify only the other connection's queries remain
	remaining, err := svc.ListQueries("", "", "")
	if err != nil {
		t.Fatalf("ListQueries failed: %v", err)
	}
	if len(remaining) != 1 {
		t.Errorf("Expected 1 remaining query, got %d", len(remaining))
	}
	if remaining[0].ConnectionID != "conn-to-keep" {
		t.Errorf("Wrong connection ID remaining: %s", remaining[0].ConnectionID)
	}
}

func TestQueryService_Persistence(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Save a query with first service instance
	svc1 := NewQueryService(tempDir)
	query := types.SavedQuery{
		Name:         "Persistent Query",
		ConnectionID: "conn-123",
		Database:     "testdb",
		Collection:   "users",
		Query:        `{"persistent": true}`,
	}

	saved, err := svc1.SaveQuery(query)
	if err != nil {
		t.Fatalf("SaveQuery failed: %v", err)
	}

	// Create new service instance and verify query is loaded
	svc2 := NewQueryService(tempDir)
	retrieved, err := svc2.GetQuery(saved.ID)
	if err != nil {
		t.Fatalf("GetQuery failed: %v", err)
	}
	if retrieved.Name != "Persistent Query" {
		t.Errorf("Expected name 'Persistent Query', got '%s'", retrieved.Name)
	}

	// Verify file exists
	queriesFile := filepath.Join(tempDir, "saved_queries.json")
	if _, err := os.Stat(queriesFile); os.IsNotExist(err) {
		t.Error("saved_queries.json file should exist")
	}
}

func TestQueryService_NotFoundError(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "mongopal_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	svc := NewQueryService(tempDir)

	// Try to get non-existent query
	_, err = svc.GetQuery("non-existent-id")
	if err == nil {
		t.Error("Expected error for non-existent query")
	}

	notFoundErr, ok := err.(*QueryNotFoundError)
	if !ok {
		t.Errorf("Expected QueryNotFoundError, got %T", err)
	}
	if notFoundErr.QueryID != "non-existent-id" {
		t.Errorf("Expected QueryID 'non-existent-id', got '%s'", notFoundErr.QueryID)
	}

	// Try to delete non-existent query
	err = svc.DeleteQuery("non-existent-id")
	if err == nil {
		t.Error("Expected error for deleting non-existent query")
	}
}
