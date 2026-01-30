// Integration tests that run against real MongoDB using testcontainers
//
// Run with: go test -v -tags=integration ./...
// Or: make test-integration-go
//
// These tests are slower but provide high confidence that the app
// works correctly with real MongoDB.

//go:build integration

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/mongodb"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// testContext holds shared test resources
type testContext struct {
	container *mongodb.MongoDBContainer
	uri       string
	client    *mongo.Client
	app       *App
	connID    string
}

// setupTestContainer starts a MongoDB container and returns the connection details
func setupTestContainer(t *testing.T) *testContext {
	ctx := context.Background()

	// Start MongoDB container
	container, err := mongodb.Run(ctx, "mongo:7")
	require.NoError(t, err, "Failed to start MongoDB container")

	// Get connection string
	uri, err := container.ConnectionString(ctx)
	require.NoError(t, err, "Failed to get connection string")

	// Connect directly for test setup
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	require.NoError(t, err, "Failed to connect to MongoDB")

	// Create app instance
	app := NewApp()
	app.ctx = ctx
	app.configDir = t.TempDir()

	// Save a test connection
	connID := "test-conn-1"
	app.savedConnections = []SavedConnection{
		{
			ID:        connID,
			Name:      "Test Connection",
			URI:       uri,
			CreatedAt: time.Now(),
		},
	}

	return &testContext{
		container: container,
		uri:       uri,
		client:    client,
		app:       app,
		connID:    connID,
	}
}

// teardown cleans up test resources
func (tc *testContext) teardown(t *testing.T) {
	ctx := context.Background()

	if tc.client != nil {
		tc.client.Disconnect(ctx)
	}

	if tc.app != nil {
		tc.app.shutdown(ctx)
	}

	if tc.container != nil {
		tc.container.Terminate(ctx)
	}
}

// seedTestData inserts test documents into a collection
func (tc *testContext) seedTestData(t *testing.T, dbName, collName string, docs []bson.M) {
	ctx := context.Background()
	coll := tc.client.Database(dbName).Collection(collName)

	var documents []interface{}
	for _, doc := range docs {
		documents = append(documents, doc)
	}

	_, err := coll.InsertMany(ctx, documents)
	require.NoError(t, err, "Failed to seed test data")
}

// =============================================================================
// Connection Tests
// =============================================================================

func TestIntegration_Connect(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Test connecting
	err := tc.app.Connect(tc.connID)
	assert.NoError(t, err, "Should connect successfully")

	// Verify connection status
	status := tc.app.GetConnectionStatus(tc.connID)
	assert.True(t, status.Connected, "Should be connected")

	// Test disconnecting
	err = tc.app.Disconnect(tc.connID)
	assert.NoError(t, err, "Should disconnect successfully")

	// Verify disconnected
	status = tc.app.GetConnectionStatus(tc.connID)
	assert.False(t, status.Connected, "Should be disconnected")
}

func TestIntegration_TestConnection(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Test with valid URI
	err := tc.app.TestConnection(tc.uri)
	assert.NoError(t, err, "Should succeed with valid URI")

	// Test with invalid URI
	err = tc.app.TestConnection("mongodb://invalid:27017")
	assert.Error(t, err, "Should fail with invalid URI")
}

// =============================================================================
// Database & Collection Listing Tests
// =============================================================================

func TestIntegration_ListDatabases(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed some data to create a database
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "Alice"},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// List databases
	databases, err := tc.app.ListDatabases(tc.connID)
	require.NoError(t, err)

	// Should include our test database
	var found bool
	for _, db := range databases {
		if db.Name == "testdb" {
			found = true
			break
		}
	}
	assert.True(t, found, "Should find testdb in database list")
}

func TestIntegration_ListCollections(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed data in multiple collections
	tc.seedTestData(t, "testdb", "users", []bson.M{{"name": "Alice"}})
	tc.seedTestData(t, "testdb", "orders", []bson.M{{"item": "Widget"}})
	tc.seedTestData(t, "testdb", "products", []bson.M{{"sku": "ABC123"}})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// List collections
	collections, err := tc.app.ListCollections(tc.connID, "testdb")
	require.NoError(t, err)

	// Should have all three collections
	assert.Len(t, collections, 3, "Should have 3 collections")

	names := make(map[string]bool)
	for _, c := range collections {
		names[c.Name] = true
	}
	assert.True(t, names["users"], "Should have users collection")
	assert.True(t, names["orders"], "Should have orders collection")
	assert.True(t, names["products"], "Should have products collection")
}

// =============================================================================
// Document CRUD Tests
// =============================================================================

func TestIntegration_FindDocuments(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "Alice", "age": 30, "active": true},
		{"name": "Bob", "age": 25, "active": false},
		{"name": "Charlie", "age": 35, "active": true},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Find all documents
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(3), result.Total, "Should find 3 documents")
	assert.Len(t, result.Documents, 3, "Should return 3 documents")

	// Find with filter
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "users", `{"active": true}`, QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(2), result.Total, "Should find 2 active users")

	// Find with pagination
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{Skip: 1, Limit: 1})
	require.NoError(t, err)

	assert.Len(t, result.Documents, 1, "Should return 1 document")
	assert.True(t, result.HasMore, "Should have more documents")
}

func TestIntegration_FindDocumentsWithProjection(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "Alice", "email": "alice@test.com", "password": "secret123"},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Find with projection (exclude password)
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{
		Limit:      10,
		Projection: `{"password": 0}`,
	})
	require.NoError(t, err)

	// Parse the result document
	var doc map[string]interface{}
	err = json.Unmarshal([]byte(result.Documents[0]), &doc)
	require.NoError(t, err)

	assert.Contains(t, doc, "name", "Should have name field")
	assert.Contains(t, doc, "email", "Should have email field")
	assert.NotContains(t, doc, "password", "Should NOT have password field")
}

func TestIntegration_InsertDocument(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Insert a document
	docJSON := `{"name": "NewUser", "email": "new@test.com"}`
	insertedID, err := tc.app.InsertDocument(tc.connID, "testdb", "users", docJSON)
	require.NoError(t, err)

	assert.NotEmpty(t, insertedID, "Should return inserted ID")

	// Verify it was inserted
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(1), result.Total, "Should have 1 document")
}

func TestIntegration_UpdateDocument(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "Alice", "age": 30},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Find the document to get its ID
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{Limit: 1})
	require.NoError(t, err)

	var doc map[string]interface{}
	err = json.Unmarshal([]byte(result.Documents[0]), &doc)
	require.NoError(t, err)

	// Extract ObjectId
	idMap := doc["_id"].(map[string]interface{})
	docID := idMap["$oid"].(string)

	// Update the document
	updatedJSON := `{"name": "Alice Updated", "age": 31}`
	err = tc.app.UpdateDocument(tc.connID, "testdb", "users", docID, updatedJSON)
	require.NoError(t, err)

	// Verify the update
	docJSON, err := tc.app.GetDocument(tc.connID, "testdb", "users", docID)
	require.NoError(t, err)

	var updated map[string]interface{}
	err = json.Unmarshal([]byte(docJSON), &updated)
	require.NoError(t, err)

	assert.Equal(t, "Alice Updated", updated["name"], "Name should be updated")
	// Extended JSON represents integers as {"$numberInt": "31"} or {"$numberLong": "31"}
	ageVal := updated["age"]
	switch age := ageVal.(type) {
	case float64:
		assert.Equal(t, float64(31), age, "Age should be updated")
	case map[string]interface{}:
		// Check for Extended JSON format
		if numInt, ok := age["$numberInt"]; ok {
			assert.Equal(t, "31", numInt, "Age should be updated")
		} else if numLong, ok := age["$numberLong"]; ok {
			assert.Equal(t, "31", numLong, "Age should be updated")
		} else {
			t.Errorf("Unexpected age format: %v", age)
		}
	default:
		t.Errorf("Unexpected age type: %T", ageVal)
	}
}

func TestIntegration_DeleteDocument(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "ToDelete"},
		{"name": "ToKeep"},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Find documents
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", `{"name": "ToDelete"}`, QueryOptions{Limit: 1})
	require.NoError(t, err)

	var doc map[string]interface{}
	err = json.Unmarshal([]byte(result.Documents[0]), &doc)
	require.NoError(t, err)

	idMap := doc["_id"].(map[string]interface{})
	docID := idMap["$oid"].(string)

	// Delete the document
	err = tc.app.DeleteDocument(tc.connID, "testdb", "users", docID)
	require.NoError(t, err)

	// Verify deletion
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "users", "{}", QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(1), result.Total, "Should have 1 document remaining")
}

// =============================================================================
// Document ID Type Tests
// =============================================================================

func TestIntegration_DocumentWithStringID(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Insert document with string ID directly
	ctx := context.Background()
	coll := tc.client.Database("testdb").Collection("users")
	_, err := coll.InsertOne(ctx, bson.M{"_id": "custom-string-id", "name": "StringID User"})
	require.NoError(t, err)

	// Connect via app
	err = tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Get the document by string ID
	docJSON, err := tc.app.GetDocument(tc.connID, "testdb", "users", "custom-string-id")
	require.NoError(t, err)

	var doc map[string]interface{}
	err = json.Unmarshal([]byte(docJSON), &doc)
	require.NoError(t, err)

	assert.Equal(t, "custom-string-id", doc["_id"], "Should retrieve document with string ID")
}

func TestIntegration_DocumentWithNumericID(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Insert document with numeric ID
	ctx := context.Background()
	coll := tc.client.Database("testdb").Collection("users")
	_, err := coll.InsertOne(ctx, bson.M{"_id": int64(12345), "name": "NumericID User"})
	require.NoError(t, err)

	// Connect via app
	err = tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Get the document by numeric ID (passed as Extended JSON)
	// Note: parseDocumentID doesn't auto-convert "12345" to int64, so we use Extended JSON format
	docJSON, err := tc.app.GetDocument(tc.connID, "testdb", "users", `{"$numberLong": "12345"}`)
	require.NoError(t, err)

	assert.Contains(t, docJSON, "NumericID User", "Should retrieve document with numeric ID")
}

// =============================================================================
// Schema Inference Tests
// =============================================================================

func TestIntegration_InferCollectionSchema(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed diverse test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{
			"name":      "Alice",
			"age":       30,
			"active":    true,
			"email":     "alice@test.com",
			"createdAt": time.Now(),
			"address":   bson.M{"city": "NYC", "zip": "10001"},
			"tags":      []string{"admin", "verified"},
		},
		{
			"name":      "Bob",
			"age":       25,
			"active":    false,
			"email":     "bob@test.com",
			"createdAt": time.Now(),
			"address":   bson.M{"city": "LA", "zip": "90001"},
		},
		{
			"name":      "Charlie",
			"age":       35,
			"active":    true,
			"createdAt": time.Now(),
			// Missing email and address to test occurrence
		},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Infer schema
	schema, err := tc.app.InferCollectionSchema(tc.connID, "testdb", "users", 10)
	require.NoError(t, err)

	assert.Equal(t, "users", schema.Collection, "Should have correct collection name")
	assert.Equal(t, int64(3), schema.TotalDocs, "Should have correct total docs")

	// Check field types
	assert.Contains(t, schema.Fields, "_id", "Should have _id field")
	assert.Contains(t, schema.Fields, "name", "Should have name field")
	assert.Contains(t, schema.Fields, "age", "Should have age field")
	assert.Contains(t, schema.Fields, "active", "Should have active field")
	assert.Contains(t, schema.Fields, "address", "Should have address field")

	// Check nested object
	addressField := schema.Fields["address"]
	assert.Equal(t, "Object", addressField.Type, "Address should be Object type")
	assert.Contains(t, addressField.Fields, "city", "Address should have city field")
	assert.Contains(t, addressField.Fields, "zip", "Address should have zip field")

	// Check array field
	if tagsField, ok := schema.Fields["tags"]; ok {
		assert.Contains(t, tagsField.Type, "Array", "Tags should be Array type")
	}

	// Check occurrence (email is in 2/3 documents)
	emailField := schema.Fields["email"]
	assert.InDelta(t, 66.67, emailField.Occurrence, 1.0, "Email should have ~66.67% occurrence")
}

// =============================================================================
// Collection Operations Tests
// =============================================================================

func TestIntegration_DropCollection(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed data
	tc.seedTestData(t, "testdb", "todrop", []bson.M{{"x": 1}})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Verify collection exists
	collections, err := tc.app.ListCollections(tc.connID, "testdb")
	require.NoError(t, err)

	var found bool
	for _, c := range collections {
		if c.Name == "todrop" {
			found = true
			break
		}
	}
	assert.True(t, found, "Collection should exist before drop")

	// Drop collection
	err = tc.app.DropCollection(tc.connID, "testdb", "todrop")
	require.NoError(t, err)

	// Verify collection is gone
	collections, err = tc.app.ListCollections(tc.connID, "testdb")
	require.NoError(t, err)

	found = false
	for _, c := range collections {
		if c.Name == "todrop" {
			found = true
			break
		}
	}
	assert.False(t, found, "Collection should not exist after drop")
}

func TestIntegration_ClearCollection(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed data
	tc.seedTestData(t, "testdb", "toclear", []bson.M{
		{"x": 1},
		{"x": 2},
		{"x": 3},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Verify documents exist
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "toclear", "{}", QueryOptions{Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(3), result.Total, "Should have 3 documents before clear")

	// Clear collection
	err = tc.app.ClearCollection(tc.connID, "testdb", "toclear")
	require.NoError(t, err)

	// Verify documents are gone but collection exists
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "toclear", "{}", QueryOptions{Limit: 10})
	require.NoError(t, err)
	assert.Equal(t, int64(0), result.Total, "Should have 0 documents after clear")

	// Collection should still exist
	collections, err := tc.app.ListCollections(tc.connID, "testdb")
	require.NoError(t, err)

	var found bool
	for _, c := range collections {
		if c.Name == "toclear" {
			found = true
			break
		}
	}
	assert.True(t, found, "Collection should still exist after clear")
}

// =============================================================================
// Index Tests
// =============================================================================

func TestIntegration_ListIndexes(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed data and create index
	tc.seedTestData(t, "testdb", "indexed", []bson.M{{"email": "test@test.com"}})

	ctx := context.Background()
	coll := tc.client.Database("testdb").Collection("indexed")
	_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	require.NoError(t, err)

	// Connect via app
	err = tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// List indexes
	indexes, err := tc.app.ListIndexes(tc.connID, "testdb", "indexed")
	require.NoError(t, err)

	// Should have _id index and email index
	assert.GreaterOrEqual(t, len(indexes), 2, "Should have at least 2 indexes")

	var emailIndexFound bool
	for _, idx := range indexes {
		if idx.Name == "email_1" {
			emailIndexFound = true
			assert.True(t, idx.Unique, "Email index should be unique")
		}
	}
	assert.True(t, emailIndexFound, "Should find email index")
}

// =============================================================================
// Complex Query Tests
// =============================================================================

func TestIntegration_FindWithComplexFilter(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "products", []bson.M{
		{"name": "Widget A", "price": 10.00, "category": "widgets", "stock": 100},
		{"name": "Widget B", "price": 25.00, "category": "widgets", "stock": 50},
		{"name": "Gadget A", "price": 50.00, "category": "gadgets", "stock": 25},
		{"name": "Gadget B", "price": 75.00, "category": "gadgets", "stock": 10},
		{"name": "Gadget C", "price": 100.00, "category": "gadgets", "stock": 5},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Complex filter: gadgets with price > 50
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "products",
		`{"category": "gadgets", "price": {"$gt": 50}}`,
		QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(2), result.Total, "Should find 2 gadgets with price > 50")

	// Filter with $or
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "products",
		`{"$or": [{"price": {"$lt": 20}}, {"stock": {"$lt": 10}}]}`,
		QueryOptions{Limit: 10})
	require.NoError(t, err)

	assert.Equal(t, int64(2), result.Total, "Should find 2 products (cheap or low stock)")
}

func TestIntegration_FindWithSort(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed test data
	tc.seedTestData(t, "testdb", "users", []bson.M{
		{"name": "Charlie", "age": 35},
		{"name": "Alice", "age": 30},
		{"name": "Bob", "age": 25},
	})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Sort by age ascending (simple format: "field" for ascending, "-field" for descending)
	result, err := tc.app.FindDocuments(tc.connID, "testdb", "users", "{}",
		QueryOptions{Limit: 10, Sort: "age"})
	require.NoError(t, err)

	// First document should be Bob (youngest)
	var firstDoc map[string]interface{}
	err = json.Unmarshal([]byte(result.Documents[0]), &firstDoc)
	require.NoError(t, err)

	assert.Equal(t, "Bob", firstDoc["name"], "First document should be Bob (age 25)")

	// Sort by age descending
	result, err = tc.app.FindDocuments(tc.connID, "testdb", "users", "{}",
		QueryOptions{Limit: 10, Sort: "-age"})
	require.NoError(t, err)

	err = json.Unmarshal([]byte(result.Documents[0]), &firstDoc)
	require.NoError(t, err)

	assert.Equal(t, "Charlie", firstDoc["name"], "First document should be Charlie (age 35)")
}

// =============================================================================
// BSON Types Tests
// =============================================================================

func TestIntegration_BSONTypes(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Insert document with various BSON types
	ctx := context.Background()
	coll := tc.client.Database("testdb").Collection("bsontypes")

	oid := primitive.NewObjectID()
	now := time.Now().UTC().Truncate(time.Millisecond)

	_, err := coll.InsertOne(ctx, bson.M{
		"_id":         oid,
		"string":      "hello",
		"int32":       int32(42),
		"int64":       int64(9223372036854775807),
		"double":      3.14159,
		"bool":        true,
		"date":        now,
		"null":        nil,
		"objectId":    primitive.NewObjectID(),
		"array":       []string{"a", "b", "c"},
		"nestedDoc":   bson.M{"x": 1, "y": 2},
		"binary":      primitive.Binary{Subtype: 0x00, Data: []byte("binary data")},
	})
	require.NoError(t, err)

	// Connect via app
	err = tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Get the document
	docJSON, err := tc.app.GetDocument(tc.connID, "testdb", "bsontypes", oid.Hex())
	require.NoError(t, err)

	var doc map[string]interface{}
	err = json.Unmarshal([]byte(docJSON), &doc)
	require.NoError(t, err)

	// Verify types are preserved in Extended JSON format
	assert.Equal(t, "hello", doc["string"])
	assert.Equal(t, true, doc["bool"])
	assert.Nil(t, doc["null"])

	// Check Extended JSON formats
	assert.Contains(t, doc["_id"], "$oid", "_id should be in Extended JSON ObjectId format")
	assert.Contains(t, doc["date"], "$date", "date should be in Extended JSON Date format")
	assert.Contains(t, doc["int64"], "$numberLong", "int64 should be in Extended JSON NumberLong format")
}

// =============================================================================
// Error Handling Tests
// =============================================================================

func TestIntegration_InvalidFilter(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Seed data
	tc.seedTestData(t, "testdb", "users", []bson.M{{"name": "Alice"}})

	// Connect
	err := tc.app.Connect(tc.connID)
	require.NoError(t, err)

	// Invalid filter syntax
	_, err = tc.app.FindDocuments(tc.connID, "testdb", "users", "not valid json", QueryOptions{Limit: 10})
	assert.Error(t, err, "Should error on invalid filter JSON")

	// Invalid operator
	_, err = tc.app.FindDocuments(tc.connID, "testdb", "users", `{"$invalidOp": 1}`, QueryOptions{Limit: 10})
	assert.Error(t, err, "Should error on invalid MongoDB operator")
}

func TestIntegration_NotConnected(t *testing.T) {
	tc := setupTestContainer(t)
	defer tc.teardown(t)

	// Don't connect, try operations
	_, err := tc.app.ListDatabases(tc.connID)
	assert.Error(t, err, "Should error when not connected")
	assert.Contains(t, err.Error(), "not connected", "Error should mention not connected")
}

// =============================================================================
// Benchmark Tests
// =============================================================================

func BenchmarkIntegration_FindDocuments(b *testing.B) {
	ctx := context.Background()

	// Start MongoDB container
	container, err := mongodb.Run(ctx, "mongo:7")
	if err != nil {
		b.Fatalf("Failed to start MongoDB container: %v", err)
	}
	defer container.Terminate(ctx)

	uri, _ := container.ConnectionString(ctx)

	// Connect and seed data
	client, _ := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	defer client.Disconnect(ctx)

	coll := client.Database("benchdb").Collection("docs")
	var docs []interface{}
	for i := 0; i < 1000; i++ {
		docs = append(docs, bson.M{
			"index":  i,
			"name":   fmt.Sprintf("Document %d", i),
			"value":  i * 100,
			"active": i%2 == 0,
		})
	}
	coll.InsertMany(ctx, docs)

	// Create app
	app := NewApp()
	app.ctx = ctx
	app.configDir = b.TempDir()
	app.savedConnections = []SavedConnection{{ID: "bench", Name: "Bench", URI: uri}}
	app.Connect("bench")
	defer app.Disconnect("bench")

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		app.FindDocuments("bench", "benchdb", "docs", "{}", QueryOptions{Limit: 50})
	}
}
