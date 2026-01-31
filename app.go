package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/zalando/go-keyring"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const keyringService = "mongopal"

const DefaultQueryTimeout = 30 * time.Second
const DefaultConnectTimeout = 10 * time.Second

// App struct holds the application state
type App struct {
	ctx              context.Context
	clients          map[string]*mongo.Client // Active connections by ID
	savedConnections []SavedConnection        // In-memory cache of saved connections
	folders          []Folder                 // Connection folders
	configDir        string                   // Config directory path
	mu               sync.RWMutex
	exportCancel     context.CancelFunc       // Cancel function for ongoing export
	importCancel     context.CancelFunc       // Cancel function for ongoing import
	disableEvents    bool                     // Disable event emission (for tests)
}

// NewApp creates a new App instance
func NewApp() *App {
	return &App{
		clients:          make(map[string]*mongo.Client),
		savedConnections: []SavedConnection{},
	}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.initConfigDir()
	a.loadConnections()
}

// emitEvent safely emits an event, handling non-Wails contexts gracefully
func (a *App) emitEvent(eventName string, data interface{}) {
	// Skip event emission if disabled (for tests) or context is nil
	if a.disableEvents || a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, eventName, data)
}

// initConfigDir sets up the config directory
func (a *App) initConfigDir() {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.Getenv("HOME")
	}
	a.configDir = filepath.Join(configDir, "mongopal")
	os.MkdirAll(a.configDir, 0755)
}

// connectionsFile returns the path to the connections file
func (a *App) connectionsFile() string {
	return filepath.Join(a.configDir, "connections.json")
}

// foldersFile returns the path to the folders file
func (a *App) foldersFile() string {
	return filepath.Join(a.configDir, "folders.json")
}

// loadConnections loads saved connections from disk
func (a *App) loadConnections() {
	data, err := os.ReadFile(a.connectionsFile())
	if err == nil {
		json.Unmarshal(data, &a.savedConnections)
	}

	// Load folders
	data, err = os.ReadFile(a.foldersFile())
	if err == nil {
		json.Unmarshal(data, &a.folders)
	}
}

// persistConnections saves connections to disk
func (a *App) persistConnections() error {
	data, err := json.MarshalIndent(a.savedConnections, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.connectionsFile(), data, 0644)
}

// persistFolders saves folders to disk
func (a *App) persistFolders() error {
	data, err := json.MarshalIndent(a.folders, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.foldersFile(), data, 0644)
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for id, client := range a.clients {
		_ = client.Disconnect(ctx)
		delete(a.clients, id)
	}
}

// contextWithTimeout creates a context with the default timeout
func (a *App) contextWithTimeout() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), DefaultQueryTimeout)
}

// getClient returns the MongoDB client for a connection, or error if not connected
func (a *App) getClient(connID string) (*mongo.Client, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	client, ok := a.clients[connID]
	if !ok {
		return nil, fmt.Errorf("not connected: %s", connID)
	}
	return client, nil
}

// getConnectionURI returns the URI for a saved connection with password from keyring
func (a *App) getConnectionURI(connID string) (string, error) {
	a.mu.RLock()
	var conn *SavedConnection
	for i := range a.savedConnections {
		if a.savedConnections[i].ID == connID {
			conn = &a.savedConnections[i]
			break
		}
	}
	a.mu.RUnlock()

	if conn == nil {
		return "", fmt.Errorf("connection not found: %s", connID)
	}

	// Get password from keyring and inject into URI
	password, err := a.getPassword(connID)
	if err != nil || password == "" {
		// No password stored, return URI as-is
		return conn.URI, nil
	}

	return a.injectPasswordIntoURI(conn.URI, password)
}

// =============================================================================
// Keyring Helper Functions
// =============================================================================

// setPassword stores a password in the OS keyring
func (a *App) setPassword(connID, password string) error {
	if password == "" {
		// Delete any existing password
		_ = keyring.Delete(keyringService, connID)
		return nil
	}
	return keyring.Set(keyringService, connID, password)
}

// getPassword retrieves a password from the OS keyring
func (a *App) getPassword(connID string) (string, error) {
	password, err := keyring.Get(keyringService, connID)
	if err == keyring.ErrNotFound {
		return "", nil
	}
	return password, err
}

// deletePassword removes a password from the OS keyring
func (a *App) deletePassword(connID string) error {
	err := keyring.Delete(keyringService, connID)
	if err == keyring.ErrNotFound {
		return nil
	}
	return err
}

// extractPasswordFromURI extracts and removes password from a MongoDB URI
func (a *App) extractPasswordFromURI(uri string) (cleanURI, password string, err error) {
	parsed, err := url.Parse(uri)
	if err != nil {
		return uri, "", nil // Return original if parsing fails
	}

	if parsed.User == nil {
		return uri, "", nil // No credentials
	}

	password, hasPassword := parsed.User.Password()
	if !hasPassword || password == "" {
		return uri, "", nil // No password
	}

	// Create URI without password
	username := parsed.User.Username()
	parsed.User = url.User(username) // Username only, no password

	return parsed.String(), password, nil
}

// injectPasswordIntoURI adds password back into a MongoDB URI
func (a *App) injectPasswordIntoURI(uri, password string) (string, error) {
	if password == "" {
		return uri, nil
	}

	parsed, err := url.Parse(uri)
	if err != nil {
		return uri, nil
	}

	if parsed.User == nil {
		return uri, nil // No username to add password to
	}

	username := parsed.User.Username()
	parsed.User = url.UserPassword(username, password)

	return parsed.String(), nil
}

// =============================================================================
// Types
// =============================================================================

type Folder struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

type SavedConnection struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	FolderID  string    `json:"folderId,omitempty"`
	URI       string    `json:"uri"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
}

type ConnectionInfo struct {
	ID            string `json:"id"`
	Type          string `json:"type"`          // "standalone", "replicaset", "sharded"
	ReplicaSet    string `json:"replicaSet"`    // e.g., "rs0"
	Primary       string `json:"primary"`
	ServerVersion string `json:"serverVersion"`
}

type ConnectionStatus struct {
	Connected bool   `json:"connected"`
	Error     string `json:"error,omitempty"`
}

type DatabaseInfo struct {
	Name       string `json:"name"`
	SizeOnDisk int64  `json:"sizeOnDisk"`
	Empty      bool   `json:"empty"`
}

type CollectionInfo struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Count int64  `json:"count"`
}

type IndexInfo struct {
	Name   string         `json:"name"`
	Keys   map[string]int `json:"keys"`
	Unique bool           `json:"unique"`
	Sparse bool           `json:"sparse"`
}

type QueryOptions struct {
	Skip       int64  `json:"skip"`
	Limit      int64  `json:"limit"`
	Sort       string `json:"sort"`
	Projection string `json:"projection"`
}

type QueryResult struct {
	Documents   []string `json:"documents"` // Extended JSON strings
	Total       int64    `json:"total"`
	HasMore     bool     `json:"hasMore"`
	QueryTimeMs int64    `json:"queryTimeMs"`
}

// =============================================================================
// Connection Methods
// =============================================================================

// Connect establishes a connection to a saved MongoDB instance
func (a *App) Connect(connID string) error {
	uri, err := a.getConnectionURI(connID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), DefaultConnectTimeout)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Ping to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		client.Disconnect(context.Background())
		return fmt.Errorf("failed to ping: %w", err)
	}

	a.mu.Lock()
	// Disconnect existing client if any
	if existing, ok := a.clients[connID]; ok {
		existing.Disconnect(context.Background())
	}
	a.clients[connID] = client
	a.mu.Unlock()

	return nil
}

// Disconnect closes a MongoDB connection
func (a *App) Disconnect(connID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if client, ok := a.clients[connID]; ok {
		client.Disconnect(context.Background())
		delete(a.clients, connID)
	}
	return nil
}

// DisconnectAll closes all MongoDB connections
func (a *App) DisconnectAll() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	for id, client := range a.clients {
		client.Disconnect(context.Background())
		delete(a.clients, id)
	}
	return nil
}

// TestConnection tests a MongoDB URI without saving
func (a *App) TestConnection(uri string) error {
	if uri == "" {
		return fmt.Errorf("URI cannot be empty")
	}

	ctx, cancel := context.WithTimeout(context.Background(), DefaultConnectTimeout)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	defer client.Disconnect(context.Background())

	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping: %w", err)
	}

	return nil
}

// GetConnectionStatus returns the status of a connection
func (a *App) GetConnectionStatus(connID string) ConnectionStatus {
	a.mu.RLock()
	_, connected := a.clients[connID]
	a.mu.RUnlock()

	if !connected {
		return ConnectionStatus{Connected: false}
	}

	// Verify with ping
	client, _ := a.getClient(connID)
	if client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := client.Ping(ctx, nil); err != nil {
			return ConnectionStatus{Connected: false, Error: err.Error()}
		}
	}

	return ConnectionStatus{Connected: true}
}

// GetConnectionInfo returns detailed info about a connection
func (a *App) GetConnectionInfo(connID string) ConnectionInfo {
	client, err := a.getClient(connID)
	if err != nil {
		return ConnectionInfo{ID: connID}
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	info := ConnectionInfo{ID: connID, Type: "standalone"}

	// Get server info
	var result bson.M
	if err := client.Database("admin").RunCommand(ctx, bson.D{{Key: "buildInfo", Value: 1}}).Decode(&result); err == nil {
		if version, ok := result["version"].(string); ok {
			info.ServerVersion = version
		}
	}

	// Check if replica set
	var replStatus bson.M
	if err := client.Database("admin").RunCommand(ctx, bson.D{{Key: "replSetGetStatus", Value: 1}}).Decode(&replStatus); err == nil {
		info.Type = "replicaset"
		if setName, ok := replStatus["set"].(string); ok {
			info.ReplicaSet = setName
		}
	}

	return info
}

// =============================================================================
// Tree Hierarchy Methods
// =============================================================================

// ListDatabases returns all databases for a connection
func (a *App) ListDatabases(connID string) ([]DatabaseInfo, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	result, err := client.ListDatabases(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}

	databases := make([]DatabaseInfo, 0, len(result.Databases))
	for _, db := range result.Databases {
		databases = append(databases, DatabaseInfo{
			Name:       db.Name,
			SizeOnDisk: db.SizeOnDisk,
			Empty:      db.Empty,
		})
	}

	// Sort by name
	sort.Slice(databases, func(i, j int) bool {
		return databases[i].Name < databases[j].Name
	})

	return databases, nil
}

// ListCollections returns all collections in a database
func (a *App) ListCollections(connID, dbName string) ([]CollectionInfo, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	db := client.Database(dbName)

	// Get collection names and types
	cursor, err := db.ListCollections(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}
	defer cursor.Close(ctx)

	var collections []CollectionInfo
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		name, _ := result["name"].(string)
		collType := "collection"
		if t, ok := result["type"].(string); ok {
			collType = t
		}

		// Get document count (skip for views)
		var count int64
		if collType == "collection" {
			count, _ = db.Collection(name).EstimatedDocumentCount(ctx)
		}

		collections = append(collections, CollectionInfo{
			Name:  name,
			Type:  collType,
			Count: count,
		})
	}

	// Sort by name
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].Name < collections[j].Name
	})

	return collections, nil
}

// ListIndexes returns all indexes for a collection
func (a *App) ListIndexes(connID, dbName, collName string) ([]IndexInfo, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	cursor, err := coll.Indexes().List(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list indexes: %w", err)
	}
	defer cursor.Close(ctx)

	var indexes []IndexInfo
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			continue
		}

		name, _ := result["name"].(string)
		unique, _ := result["unique"].(bool)
		sparse, _ := result["sparse"].(bool)

		keys := make(map[string]int)
		if keyDoc, ok := result["key"].(bson.M); ok {
			for k, v := range keyDoc {
				if intVal, ok := v.(int32); ok {
					keys[k] = int(intVal)
				} else if intVal, ok := v.(int64); ok {
					keys[k] = int(intVal)
				} else if intVal, ok := v.(float64); ok {
					keys[k] = int(intVal)
				}
			}
		}

		indexes = append(indexes, IndexInfo{
			Name:   name,
			Keys:   keys,
			Unique: unique,
			Sparse: sparse,
		})
	}

	return indexes, nil
}

// =============================================================================
// Document Methods
// =============================================================================

// FindDocuments executes a query and returns paginated results
func (a *App) FindDocuments(connID, dbName, collName, query string, opts QueryOptions) (*QueryResult, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)

	// Parse query filter
	var filter bson.M
	if query == "" || query == "{}" {
		filter = bson.M{}
	} else {
		if err := bson.UnmarshalExtJSON([]byte(query), true, &filter); err != nil {
			return nil, fmt.Errorf("invalid query: %w", err)
		}
	}

	// Set defaults
	if opts.Limit <= 0 || opts.Limit > 1000 {
		opts.Limit = 50
	}
	if opts.Skip < 0 {
		opts.Skip = 0
	}

	startTime := time.Now()

	// Get total count
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count documents: %w", err)
	}

	// Build find options
	findOpts := options.Find().
		SetSkip(opts.Skip).
		SetLimit(opts.Limit)

	// Parse projection
	if opts.Projection != "" && opts.Projection != "{}" {
		var projection bson.M
		if err := bson.UnmarshalExtJSON([]byte(opts.Projection), true, &projection); err != nil {
			return nil, fmt.Errorf("invalid projection: %w", err)
		}
		findOpts.SetProjection(projection)
	}

	// Parse sort
	if opts.Sort != "" {
		sortDoc := bson.D{}
		// Simple format: "-fieldName" for descending, "fieldName" for ascending
		for _, field := range strings.Split(opts.Sort, ",") {
			field = strings.TrimSpace(field)
			if strings.HasPrefix(field, "-") {
				sortDoc = append(sortDoc, bson.E{Key: field[1:], Value: -1})
			} else {
				sortDoc = append(sortDoc, bson.E{Key: field, Value: 1})
			}
		}
		findOpts.SetSort(sortDoc)
	}

	// Execute query
	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to find documents: %w", err)
	}
	defer cursor.Close(ctx)

	// Collect results as Extended JSON
	var documents []string
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
		if err != nil {
			continue
		}
		documents = append(documents, string(jsonBytes))
	}

	queryTime := time.Since(startTime).Milliseconds()

	return &QueryResult{
		Documents:   documents,
		Total:       total,
		HasMore:     opts.Skip+int64(len(documents)) < total,
		QueryTimeMs: queryTime,
	}, nil
}

// GetDocument returns a single document by ID
// docID can be: Extended JSON, ObjectID hex, or plain string
func (a *App) GetDocument(connID, dbName, collName, docID string) (string, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return "", err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	filter := bson.M{"_id": a.parseDocumentID(docID)}

	var doc bson.M
	if err := coll.FindOne(ctx, filter).Decode(&doc); err != nil {
		if err == mongo.ErrNoDocuments {
			return "", fmt.Errorf("document not found")
		}
		return "", fmt.Errorf("failed to get document: %w", err)
	}

	jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
	if err != nil {
		return "", fmt.Errorf("failed to marshal document: %w", err)
	}

	return string(jsonBytes), nil
}

// UpdateDocument replaces a document
// docID can be: Extended JSON, ObjectID hex, or plain string
func (a *App) UpdateDocument(connID, dbName, collName, docID, jsonDoc string) error {
	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	// Parse the JSON document
	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(jsonDoc), true, &doc); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	coll := client.Database(dbName).Collection(collName)

	// Build filter using the _id from the document or the provided docID
	var filter bson.M
	if id, ok := doc["_id"]; ok {
		filter = bson.M{"_id": id}
	} else {
		filter = bson.M{"_id": a.parseDocumentID(docID)}
	}

	result, err := coll.ReplaceOne(ctx, filter, doc)
	if err != nil {
		return fmt.Errorf("failed to update document: %w", err)
	}

	if result.MatchedCount == 0 {
		return fmt.Errorf("document not found")
	}

	return nil
}

// InsertDocument creates a new document
func (a *App) InsertDocument(connID, dbName, collName, jsonDoc string) (string, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return "", err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	// Parse the JSON document
	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(jsonDoc), true, &doc); err != nil {
		return "", fmt.Errorf("invalid JSON: %w", err)
	}

	coll := client.Database(dbName).Collection(collName)

	result, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return "", fmt.Errorf("failed to insert document: %w", err)
	}

	// Return the inserted ID as string
	switch id := result.InsertedID.(type) {
	case primitive.ObjectID:
		return id.Hex(), nil
	default:
		return fmt.Sprintf("%v", id), nil
	}
}

// DeleteDocument removes a document
// docID can be: Extended JSON (e.g., {"$oid":"..."} or {"$binary":...}), plain ObjectID hex, or string
func (a *App) DeleteDocument(connID, dbName, collName, docID string) error {
	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)

	// Build filter based on docID format
	filter := bson.M{"_id": a.parseDocumentID(docID)}

	result, err := coll.DeleteOne(ctx, filter)
	if err != nil {
		return fmt.Errorf("failed to delete document: %w", err)
	}

	if result.DeletedCount == 0 {
		return fmt.Errorf("document not found")
	}

	return nil
}

// parseDocumentID converts a document ID string to the appropriate BSON type
// Accepts: Extended JSON, ObjectID hex string, or plain string
func (a *App) parseDocumentID(docID string) interface{} {
	// Try to parse as Extended JSON first (handles Binary, UUID, ObjectId, $numberLong, etc.)
	if strings.HasPrefix(docID, "{") {
		// Wrap in a document to properly parse Extended JSON types like $numberLong
		// bson.UnmarshalExtJSON into interface{} doesn't convert EJSON types, but bson.M does
		wrapped := fmt.Sprintf(`{"_id": %s}`, docID)
		var doc bson.M
		if err := bson.UnmarshalExtJSON([]byte(wrapped), true, &doc); err == nil {
			return doc["_id"]
		}
	}

	// Try to parse as ObjectID hex
	if oid, err := primitive.ObjectIDFromHex(docID); err == nil {
		return oid
	}

	// Fall back to plain string
	return docID
}

// DropDatabase drops an entire database
func (a *App) DropDatabase(connID, dbName string) error {
	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	err = client.Database(dbName).Drop(ctx)
	if err != nil {
		return fmt.Errorf("failed to drop database: %w", err)
	}

	return nil
}

// DropCollection drops a collection from a database
func (a *App) DropCollection(connID, dbName, collName string) error {
	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	err = client.Database(dbName).Collection(collName).Drop(ctx)
	if err != nil {
		return fmt.Errorf("failed to drop collection: %w", err)
	}

	return nil
}

// ClearCollection deletes all documents from a collection but keeps the collection
func (a *App) ClearCollection(connID, dbName, collName string) error {
	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)
	_, err = coll.DeleteMany(ctx, bson.M{})
	if err != nil {
		return fmt.Errorf("failed to clear collection: %w", err)
	}

	return nil
}

// ValidateJSON validates JSON/Extended JSON syntax
func (a *App) ValidateJSON(jsonStr string) error {
	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(jsonStr), true, &doc); err != nil {
		// Try standard JSON
		if err2 := json.Unmarshal([]byte(jsonStr), &doc); err2 != nil {
			return fmt.Errorf("invalid JSON: %w", err)
		}
	}
	return nil
}

// =============================================================================
// Storage Methods
// =============================================================================

// SaveConnection saves a connection to storage with password in keyring
func (a *App) SaveConnection(conn SavedConnection, password string) error {
	// Extract password from URI if present
	cleanURI, uriPassword, _ := a.extractPasswordFromURI(conn.URI)

	// Use explicitly provided password, or the one from URI
	passwordToStore := password
	if passwordToStore == "" {
		passwordToStore = uriPassword
	}

	// Store password in keyring
	if err := a.setPassword(conn.ID, passwordToStore); err != nil {
		// Log but don't fail - password will be in URI as fallback
		fmt.Printf("Warning: failed to store password in keyring: %v\n", err)
	} else {
		// Password stored in keyring, use clean URI
		conn.URI = cleanURI
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// Update or add connection
	found := false
	for i, c := range a.savedConnections {
		if c.ID == conn.ID {
			a.savedConnections[i] = conn
			found = true
			break
		}
	}
	if !found {
		a.savedConnections = append(a.savedConnections, conn)
	}

	return a.persistConnections()
}

// ListSavedConnections returns all saved connections
func (a *App) ListSavedConnections() ([]SavedConnection, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	result := make([]SavedConnection, len(a.savedConnections))
	copy(result, a.savedConnections)
	return result, nil
}

// GetSavedConnection returns a single saved connection
func (a *App) GetSavedConnection(connID string) (SavedConnection, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, c := range a.savedConnections {
		if c.ID == connID {
			return c, nil
		}
	}
	return SavedConnection{}, fmt.Errorf("connection not found: %s", connID)
}

// DeleteSavedConnection removes a saved connection and its password from keyring
func (a *App) DeleteSavedConnection(connID string) error {
	// Delete password from keyring
	_ = a.deletePassword(connID)

	a.mu.Lock()
	defer a.mu.Unlock()

	for i, c := range a.savedConnections {
		if c.ID == connID {
			a.savedConnections = append(a.savedConnections[:i], a.savedConnections[i+1:]...)
			return a.persistConnections()
		}
	}
	return fmt.Errorf("connection not found: %s", connID)
}

// DuplicateConnection creates a copy of a connection including password
func (a *App) DuplicateConnection(connID, newName string) (SavedConnection, error) {
	// Get original password from keyring before locking
	originalPassword, _ := a.getPassword(connID)

	a.mu.Lock()
	defer a.mu.Unlock()

	var original SavedConnection
	for _, c := range a.savedConnections {
		if c.ID == connID {
			original = c
			break
		}
	}
	if original.ID == "" {
		return SavedConnection{}, fmt.Errorf("connection not found: %s", connID)
	}

	newConn := SavedConnection{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Name:      newName,
		FolderID:  original.FolderID,
		URI:       original.URI,
		Color:     original.Color,
		CreatedAt: time.Now(),
	}

	// Copy password to new connection's keyring entry
	if originalPassword != "" {
		_ = a.setPassword(newConn.ID, originalPassword)
	}

	a.savedConnections = append(a.savedConnections, newConn)
	if err := a.persistConnections(); err != nil {
		return SavedConnection{}, err
	}
	return newConn, nil
}

// =============================================================================
// Folder Methods
// =============================================================================

// CreateFolder creates a new folder
func (a *App) CreateFolder(name, parentID string) (Folder, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	folder := Folder{
		ID:       fmt.Sprintf("%d", time.Now().UnixNano()),
		Name:     name,
		ParentID: parentID,
	}

	a.folders = append(a.folders, folder)
	if err := a.persistFolders(); err != nil {
		return Folder{}, err
	}

	return folder, nil
}

// DeleteFolder removes a folder and moves its connections to root
func (a *App) DeleteFolder(folderID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Find and remove folder
	found := false
	for i, f := range a.folders {
		if f.ID == folderID {
			a.folders = append(a.folders[:i], a.folders[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("folder not found: %s", folderID)
	}

	// Move connections in this folder to root
	for i := range a.savedConnections {
		if a.savedConnections[i].FolderID == folderID {
			a.savedConnections[i].FolderID = ""
		}
	}

	// Move child folders to root
	for i := range a.folders {
		if a.folders[i].ParentID == folderID {
			a.folders[i].ParentID = ""
		}
	}

	if err := a.persistFolders(); err != nil {
		return err
	}
	return a.persistConnections()
}

// ListFolders returns all folders
func (a *App) ListFolders() ([]Folder, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	result := make([]Folder, len(a.folders))
	copy(result, a.folders)
	return result, nil
}

// UpdateFolder updates a folder's name or parent
func (a *App) UpdateFolder(folderID, name, parentID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	for i := range a.folders {
		if a.folders[i].ID == folderID {
			if name != "" {
				a.folders[i].Name = name
			}
			a.folders[i].ParentID = parentID
			return a.persistFolders()
		}
	}

	return fmt.Errorf("folder not found: %s", folderID)
}

// MoveConnectionToFolder moves a connection to a folder
func (a *App) MoveConnectionToFolder(connID, folderID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	for i := range a.savedConnections {
		if a.savedConnections[i].ID == connID {
			a.savedConnections[i].FolderID = folderID
			return a.persistConnections()
		}
	}

	return fmt.Errorf("connection not found: %s", connID)
}

// =============================================================================
// Import/Export Methods
// =============================================================================

// ExportConnections exports connections as JSON (without passwords)
func (a *App) ExportConnections(folderID string) (string, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Filter by folder if specified
	var conns []SavedConnection
	for _, c := range a.savedConnections {
		if folderID == "" || c.FolderID == folderID {
			// Mask password in URI for export
			conns = append(conns, c)
		}
	}

	data, err := json.MarshalIndent(conns, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ImportConnections imports connections from JSON
func (a *App) ImportConnections(jsonStr string) error {
	var conns []SavedConnection
	if err := json.Unmarshal([]byte(jsonStr), &conns); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// Add imported connections with new IDs
	for _, c := range conns {
		c.ID = fmt.Sprintf("%d", time.Now().UnixNano())
		c.CreatedAt = time.Now()
		a.savedConnections = append(a.savedConnections, c)
	}

	return a.persistConnections()
}

// ConnectionToURI returns the URI for a connection
func (a *App) ConnectionToURI(connID string) (string, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, c := range a.savedConnections {
		if c.ID == connID {
			return c.URI, nil
		}
	}
	return "", fmt.Errorf("connection not found: %s", connID)
}

// ConnectionFromURI parses a URI and creates a connection object (not saved)
func (a *App) ConnectionFromURI(uri string) (SavedConnection, error) {
	// Basic validation
	if !strings.HasPrefix(uri, "mongodb://") && !strings.HasPrefix(uri, "mongodb+srv://") {
		return SavedConnection{}, fmt.Errorf("invalid MongoDB URI")
	}

	// Extract a name from the URI (use host or "New Connection")
	name := "New Connection"
	if strings.Contains(uri, "@") {
		parts := strings.Split(uri, "@")
		if len(parts) > 1 {
			hostPart := strings.Split(parts[1], "/")[0]
			hostPart = strings.Split(hostPart, "?")[0]
			if hostPart != "" {
				name = hostPart
			}
		}
	}

	return SavedConnection{
		ID:        fmt.Sprintf("%d", time.Now().UnixNano()),
		Name:      name,
		URI:       uri,
		Color:     "#4CC38A",
		CreatedAt: time.Now(),
	}, nil
}

// =============================================================================
// Export Methods
// =============================================================================

// DocumentExportEntry represents a document to be exported
type DocumentExportEntry struct {
	Database   string `json:"database"`
	Collection string `json:"collection"`
	DocID      string `json:"docId"`
	JSON       string `json:"json"`
}

// ExportDocumentsAsZip exports multiple documents as a ZIP file
func (a *App) ExportDocumentsAsZip(entries []DocumentExportEntry, defaultFilename string) error {
	if len(entries) == 0 {
		return fmt.Errorf("no documents to export")
	}

	// Open native save dialog
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Documents",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		// User cancelled
		return nil
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create zip file
	zipFile, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	// Track used filenames to avoid duplicates
	usedNames := make(map[string]int)

	// Add each document as JSON file
	for _, entry := range entries {
		// Generate unique filename
		baseName := fmt.Sprintf("%s_%s.json", entry.Collection, entry.DocID)
		// Sanitize filename (remove invalid characters)
		baseName = strings.Map(func(r rune) rune {
			if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
				return '_'
			}
			return r
		}, baseName)

		// Handle duplicate filenames
		filename := baseName
		if count, exists := usedNames[baseName]; exists {
			ext := filepath.Ext(baseName)
			name := strings.TrimSuffix(baseName, ext)
			filename = fmt.Sprintf("%s_%d%s", name, count+1, ext)
			usedNames[baseName] = count + 1
		} else {
			usedNames[baseName] = 1
		}

		// Create file in zip
		writer, err := zipWriter.Create(filename)
		if err != nil {
			continue // Skip failed entries
		}

		// Pretty print the JSON
		var prettyJSON []byte
		var raw interface{}
		if err := json.Unmarshal([]byte(entry.JSON), &raw); err == nil {
			prettyJSON, _ = json.MarshalIndent(raw, "", "  ")
		} else {
			prettyJSON = []byte(entry.JSON)
		}

		writer.Write(prettyJSON)
	}

	return nil
}

// =============================================================================
// Schema Inference Methods
// =============================================================================

// SchemaField represents a field in the inferred schema
type SchemaField struct {
	Type       string                 `json:"type"`
	Occurrence float64                `json:"occurrence"` // Percentage of documents containing this field
	Fields     map[string]SchemaField `json:"fields,omitempty"` // For nested objects
	ArrayType  *SchemaField           `json:"arrayType,omitempty"` // For arrays
}

// SchemaResult represents the inferred schema of a collection
type SchemaResult struct {
	Collection   string                 `json:"collection"`
	SampleSize   int                    `json:"sampleSize"`
	TotalDocs    int64                  `json:"totalDocs"`
	Fields       map[string]SchemaField `json:"fields"`
}

// InferCollectionSchema analyzes a collection and returns its inferred schema
func (a *App) InferCollectionSchema(connID, dbName, collName string, sampleSize int) (*SchemaResult, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	coll := client.Database(dbName).Collection(collName)

	// Count total documents
	total, err := coll.CountDocuments(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to count documents: %w", err)
	}

	if total == 0 {
		return &SchemaResult{
			Collection: collName,
			SampleSize: 0,
			TotalDocs:  0,
			Fields:     make(map[string]SchemaField),
		}, nil
	}

	// Default sample size
	if sampleSize <= 0 {
		sampleSize = 10
	}

	// Calculate interval for even sampling
	interval := total / int64(sampleSize)
	if interval < 1 {
		interval = 1
	}

	// Collect samples by skipping at regular intervals
	var samples []bson.M
	actualSamples := 0
	for i := int64(0); i < total && actualSamples < sampleSize; i += interval {
		findOpts := options.FindOne().SetSkip(i)
		var doc bson.M
		if err := coll.FindOne(ctx, bson.M{}, findOpts).Decode(&doc); err != nil {
			continue
		}
		samples = append(samples, doc)
		actualSamples++
	}

	// Analyze schema from samples
	fieldCounts := make(map[string]int)
	fieldTypes := make(map[string]map[string]bool) // field -> set of types
	fieldSchemas := make(map[string][]bson.M)      // for nested analysis

	for _, doc := range samples {
		a.analyzeDocument("", doc, fieldCounts, fieldTypes, fieldSchemas)
	}

	// Build schema result
	schema := a.buildSchemaFields(fieldCounts, fieldTypes, fieldSchemas, len(samples))

	return &SchemaResult{
		Collection: collName,
		SampleSize: len(samples),
		TotalDocs:  total,
		Fields:     schema,
	}, nil
}

// analyzeDocument recursively analyzes a document's structure
func (a *App) analyzeDocument(prefix string, doc bson.M, counts map[string]int, types map[string]map[string]bool, nested map[string][]bson.M) {
	for key, value := range doc {
		fullKey := key
		if prefix != "" {
			fullKey = prefix + "." + key
		}

		counts[fullKey]++

		if types[fullKey] == nil {
			types[fullKey] = make(map[string]bool)
		}

		typeName := a.getBsonTypeName(value)
		types[fullKey][typeName] = true

		// Recurse into nested documents
		if nestedDoc, ok := value.(bson.M); ok {
			if nested[fullKey] == nil {
				nested[fullKey] = []bson.M{}
			}
			nested[fullKey] = append(nested[fullKey], nestedDoc)
			a.analyzeDocument(fullKey, nestedDoc, counts, types, nested)
		}

		// Analyze array elements
		if arr, ok := value.(bson.A); ok && len(arr) > 0 {
			// Sample first element to determine array type
			if elem, ok := arr[0].(bson.M); ok {
				arrayKey := fullKey + "[]"
				if nested[arrayKey] == nil {
					nested[arrayKey] = []bson.M{}
				}
				nested[arrayKey] = append(nested[arrayKey], elem)
				a.analyzeDocument(arrayKey, elem, counts, types, nested)
			}
		}
	}
}

// getBsonTypeName returns a human-readable type name for a BSON value
func (a *App) getBsonTypeName(value interface{}) string {
	if value == nil {
		return "Null"
	}

	switch v := value.(type) {
	case primitive.ObjectID:
		return "ObjectId"
	case string:
		return "String"
	case int32:
		return "Int32"
	case int64:
		return "Int64"
	case float64:
		return "Double"
	case bool:
		return "Boolean"
	case primitive.DateTime:
		return "Date"
	case primitive.Timestamp:
		return "Timestamp"
	case bson.M:
		return "Object"
	case bson.A:
		if len(v) > 0 {
			elemType := a.getBsonTypeName(v[0])
			return "Array<" + elemType + ">"
		}
		return "Array"
	case primitive.Binary:
		return "Binary"
	case primitive.Decimal128:
		return "Decimal128"
	case primitive.Regex:
		return "Regex"
	default:
		return fmt.Sprintf("%T", value)
	}
}

// buildSchemaFields constructs the schema field map from analysis results
func (a *App) buildSchemaFields(counts map[string]int, types map[string]map[string]bool, nested map[string][]bson.M, totalSamples int) map[string]SchemaField {
	result := make(map[string]SchemaField)

	// Only include top-level fields (no dots in key)
	for key, count := range counts {
		if strings.Contains(key, ".") {
			continue // Skip nested fields, they'll be handled recursively
		}

		typeList := []string{}
		for t := range types[key] {
			typeList = append(typeList, t)
		}
		sort.Strings(typeList)

		typeName := strings.Join(typeList, " | ")
		occurrence := float64(count) / float64(totalSamples) * 100

		field := SchemaField{
			Type:       typeName,
			Occurrence: occurrence,
		}

		// Check for nested object fields
		if nestedDocs, ok := nested[key]; ok && len(nestedDocs) > 0 {
			nestedCounts := make(map[string]int)
			nestedTypes := make(map[string]map[string]bool)
			nestedNested := make(map[string][]bson.M)

			for _, doc := range nestedDocs {
				a.analyzeDocument("", doc, nestedCounts, nestedTypes, nestedNested)
			}

			field.Fields = a.buildSchemaFields(nestedCounts, nestedTypes, nestedNested, len(nestedDocs))
		}

		// Check for array element schema
		arrayKey := key + "[]"
		if nestedDocs, ok := nested[arrayKey]; ok && len(nestedDocs) > 0 {
			nestedCounts := make(map[string]int)
			nestedTypes := make(map[string]map[string]bool)
			nestedNested := make(map[string][]bson.M)

			for _, doc := range nestedDocs {
				a.analyzeDocument("", doc, nestedCounts, nestedTypes, nestedNested)
			}

			arraySchema := a.buildSchemaFields(nestedCounts, nestedTypes, nestedNested, len(nestedDocs))
			if len(arraySchema) > 0 {
				field.ArrayType = &SchemaField{
					Type:   "Object",
					Fields: arraySchema,
				}
			}
		}

		result[key] = field
	}

	return result
}

// ExportSchemaAsJSON exports a schema result as a JSON Schema file using native save dialog
func (a *App) ExportSchemaAsJSON(jsonContent, defaultFilename string) error {
	// Open native save dialog
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export JSON Schema",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		// User cancelled
		return nil
	}

	// Ensure .json extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		filePath += ".json"
	}

	// Write file
	if err := os.WriteFile(filePath, []byte(jsonContent), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// =============================================================================
// Database Export/Import Methods
// =============================================================================

// ExportProgress represents the progress of an export/import operation
type ExportProgress struct {
	Phase           string `json:"phase"`           // "exporting" | "importing" | "previewing"
	Database        string `json:"database"`
	Collection      string `json:"collection"`
	Current         int64  `json:"current"`
	Total           int64  `json:"total"`
	DatabaseIndex   int    `json:"databaseIndex"`   // Current database (1-indexed)
	DatabaseTotal   int    `json:"databaseTotal"`   // Total databases
	CollectionIndex int    `json:"collectionIndex"` // Current collection (1-indexed) for collection-level exports
	CollectionTotal int    `json:"collectionTotal"` // Total collections for collection-level exports
}

// ImportProgress is the same as ExportProgress
type ImportProgress = ExportProgress

// ImportOptions specifies how to handle existing documents during import
type ImportOptions struct {
	FilePath       string   `json:"filePath"`       // Path to the zip file
	Databases      []string `json:"databases"`      // Databases to import (empty = all)
	Collections    []string `json:"collections"`    // Collections to import (empty = all, for collection-level imports)
	SourceDatabase string   `json:"sourceDatabase"` // Source database in archive (for collection-level imports)
	Mode           string   `json:"mode"`           // "skip" | "override"
}

// ImportPreview contains info about an import file for user selection
type ImportPreview struct {
	FilePath   string                     `json:"filePath"`
	ExportedAt string                     `json:"exportedAt"`
	Databases  []ImportPreviewDatabase    `json:"databases"`
}

// ImportPreviewDatabase contains info about a database in the import file
type ImportPreviewDatabase struct {
	Name            string `json:"name"`
	CollectionCount int    `json:"collectionCount"`
	DocumentCount   int64  `json:"documentCount"`
}

// CollectionImportResult contains import results for a single collection
type CollectionImportResult struct {
	Name              string `json:"name"`
	DocumentsInserted int64  `json:"documentsInserted"`
	DocumentsSkipped  int64  `json:"documentsSkipped"`
	CurrentCount      int64  `json:"currentCount,omitempty"` // For dry-run: docs currently in target
}

// DatabaseImportResult contains import results for a single database
type DatabaseImportResult struct {
	Name         string                   `json:"name"`
	Collections  []CollectionImportResult `json:"collections"`
	CurrentCount int64                    `json:"currentCount,omitempty"` // For dry-run: total docs currently in target
}

// ImportResult contains the result of an import operation
type ImportResult struct {
	Databases         []DatabaseImportResult `json:"databases"`
	DocumentsInserted int64                  `json:"documentsInserted"`
	DocumentsSkipped  int64                  `json:"documentsSkipped"`
	DocumentsDropped  int64                  `json:"documentsDropped,omitempty"` // For dry-run override: docs that will be dropped
	Errors            []string               `json:"errors"`
}

// ExportManifest contains metadata about an exported archive
type ExportManifest struct {
	Version      string                     `json:"version"`
	ExportedAt   time.Time                  `json:"exportedAt"`
	Databases    []ExportManifestDatabase   `json:"databases"`
}

// ExportManifestDatabase contains info about an exported database
type ExportManifestDatabase struct {
	Name        string                       `json:"name"`
	Collections []ExportManifestCollection   `json:"collections"`
}

// ExportManifestCollection contains info about an exported collection
type ExportManifestCollection struct {
	Name       string `json:"name"`
	DocCount   int64  `json:"docCount"`
	IndexCount int    `json:"indexCount"`
}

// GetDatabasesForExport returns databases with their sizes for export selection
func (a *App) GetDatabasesForExport(connID string) ([]DatabaseInfo, error) {
	return a.ListDatabases(connID)
}

// buildExportFilename creates a filename from connection name, db count and timestamp
func (a *App) buildExportFilename(connName string, dbCount int) string {
	// Sanitize connection name for use in filename
	var sanitized strings.Builder
	for _, r := range connName {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		} else if r == ' ' {
			sanitized.WriteRune('_')
		}
	}
	name := sanitized.String()

	// Truncate if too long
	if len(name) > 40 {
		name = name[:40]
	}

	// Add timestamp: YYYY-MM-DD_HHMMSS
	timestamp := time.Now().Format("2006-01-02_150405")

	return fmt.Sprintf("%s_%ddb_%s.zip", name, dbCount, timestamp)
}

// ExportDatabases exports selected databases to a zip file
func (a *App) ExportDatabases(connID string, dbNames []string) error {
	if len(dbNames) == 0 {
		return fmt.Errorf("no databases selected for export")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	// Get connection name for filename
	connName := "export"
	if conn, err := a.GetSavedConnection(connID); err == nil {
		connName = conn.Name
	}

	// Build default filename with connection name, db count and timestamp
	defaultFilename := a.buildExportFilename(connName, len(dbNames))
	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Databases",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return nil // User cancelled
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create cancellable context for the export operation
	exportCtx, exportCancel := context.WithCancel(context.Background())
	a.exportCancel = exportCancel
	defer func() {
		a.exportCancel = nil
	}()

	// Create zip file
	zipFile, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	manifest := ExportManifest{
		Version:    "1.0",
		ExportedAt: time.Now(),
		Databases:  []ExportManifestDatabase{},
	}

	totalDatabases := len(dbNames)

	// Export each database
	for dbIdx, dbName := range dbNames {
		// Check for cancellation
		select {
		case <-exportCtx.Done():
			a.emitEvent("export:cancelled", nil)
			// Clean up partial file
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		default:
		}
		dbManifest := ExportManifestDatabase{
			Name:        dbName,
			Collections: []ExportManifestCollection{},
		}

		// Get collections
		ctx, cancel := a.contextWithTimeout()
		db := client.Database(dbName)
		cursor, err := db.ListCollections(ctx, bson.D{})
		if err != nil {
			cancel()
			continue
		}

		var collInfos []struct {
			Name string `bson:"name"`
			Type string `bson:"type"`
		}
		if err := cursor.All(ctx, &collInfos); err != nil {
			cursor.Close(ctx)
			cancel()
			continue
		}
		cursor.Close(ctx)
		cancel()

		for _, collInfo := range collInfos {
			if collInfo.Type == "view" {
				continue // Skip views
			}

			collName := collInfo.Name
			coll := db.Collection(collName)

			// Get estimated document count for progress
			ctx, cancel := a.contextWithTimeout()
			estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
			cancel()

			// Emit progress
			a.emitEvent("export:progress", ExportProgress{
				Phase:         "exporting",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         estimatedCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
			})

			// Export documents as NDJSON
			ctx, cancel = context.WithTimeout(context.Background(), 5*time.Minute)
			docCursor, err := coll.Find(ctx, bson.D{})
			if err != nil {
				cancel()
				continue
			}

			ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
			ndjsonWriter, err := zipWriter.Create(ndjsonPath)
			if err != nil {
				docCursor.Close(ctx)
				cancel()
				continue
			}

			var docCount int64
			cancelled := false
			for docCursor.Next(ctx) {
				// Check for cancellation periodically
				if docCount%100 == 0 {
					select {
					case <-exportCtx.Done():
						cancelled = true
						break
					default:
					}
				}
				if cancelled {
					break
				}

				var doc bson.M
				if err := docCursor.Decode(&doc); err != nil {
					continue
				}
				jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
				if err != nil {
					continue
				}
				ndjsonWriter.Write(jsonBytes)
				ndjsonWriter.Write([]byte("\n"))
				docCount++

				// Emit progress periodically
				if docCount%1000 == 0 {
					a.emitEvent("export:progress", ExportProgress{
						Phase:         "exporting",
						Database:      dbName,
						Collection:    collName,
						Current:       docCount,
						Total:         estimatedCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
					})
				}
			}
			if cancelled {
				docCursor.Close(ctx)
				cancel()
				a.emitEvent("export:cancelled", nil)
				zipWriter.Close()
				zipFile.Close()
				os.Remove(filePath)
				return fmt.Errorf("export cancelled")
			}
			docCursor.Close(ctx)
			cancel()

			// Export indexes
			ctx2, cancel2 := a.contextWithTimeout()
			indexCursor, err := coll.Indexes().List(ctx2)
			if err != nil {
				cancel2()
				continue
			}

			var indexes []bson.M
			for indexCursor.Next(ctx2) {
				var idx bson.M
				if err := indexCursor.Decode(&idx); err != nil {
					continue
				}
				// Skip the _id index (auto-created)
				if name, ok := idx["name"].(string); ok && name == "_id_" {
					continue
				}
				indexes = append(indexes, idx)
			}
			indexCursor.Close(ctx2)
			cancel2()

			// Write indexes.json
			indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
			indexWriter, err := zipWriter.Create(indexPath)
			if err != nil {
				continue
			}
			indexData, _ := json.MarshalIndent(indexes, "", "  ")
			indexWriter.Write(indexData)

			dbManifest.Collections = append(dbManifest.Collections, ExportManifestCollection{
				Name:       collName,
				DocCount:   docCount,
				IndexCount: len(indexes),
			})
		}

		manifest.Databases = append(manifest.Databases, dbManifest)
	}

	// Write manifest
	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("failed to create manifest: %w", err)
	}
	manifestData, _ := json.MarshalIndent(manifest, "", "  ")
	manifestWriter.Write(manifestData)

	a.emitEvent("export:complete", nil)
	return nil
}

// CancelExport cancels an ongoing export operation
func (a *App) CancelExport() {
	if a.exportCancel != nil {
		a.exportCancel()
	}
}

// PreviewImportFile opens a file dialog and returns info about the databases in the zip
func (a *App) PreviewImportFile() (*ImportPreview, error) {
	// Open file dialog
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Import File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open file dialog: %w", err)
	}
	if filePath == "" {
		return nil, nil // User cancelled
	}

	// Open zip file
	zipReader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	if len(manifest.Databases) == 0 {
		return nil, fmt.Errorf("no databases found in archive")
	}

	// Build preview
	preview := &ImportPreview{
		FilePath:   filePath,
		ExportedAt: manifest.ExportedAt.Format("2006-01-02 15:04:05"),
		Databases:  make([]ImportPreviewDatabase, 0, len(manifest.Databases)),
	}

	for _, db := range manifest.Databases {
		var docCount int64
		for _, coll := range db.Collections {
			docCount += coll.DocCount
		}
		preview.Databases = append(preview.Databases, ImportPreviewDatabase{
			Name:            db.Name,
			CollectionCount: len(db.Collections),
			DocumentCount:   docCount,
		})
	}

	return preview, nil
}

// DryRunImport previews what an import would do without making changes
func (a *App) DryRunImport(connID string, opts ImportOptions) (*ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	// Open zip file
	zipReader, err := zip.OpenReader(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	// Build selected databases set
	selectedDbs := make(map[string]bool)
	for _, db := range opts.Databases {
		selectedDbs[db] = true
	}

	// Filter manifest databases
	var databasesToCheck []ExportManifestDatabase
	for _, db := range manifest.Databases {
		if len(selectedDbs) == 0 || selectedDbs[db.Name] {
			databasesToCheck = append(databasesToCheck, db)
		}
	}

	if len(databasesToCheck) == 0 {
		return nil, fmt.Errorf("no databases selected for import")
	}

	result := &ImportResult{
		Databases: []DatabaseImportResult{},
		Errors:    []string{},
	}

	// Build a map for quick file lookup
	fileMap := make(map[string]*zip.File)
	for _, f := range zipReader.File {
		fileMap[f.Name] = f
	}

	totalDatabases := len(databasesToCheck)

	// Check each database
	for dbIdx, dbManifest := range databasesToCheck {
		dbName := dbManifest.Name
		db := client.Database(dbName)

		dbResult := DatabaseImportResult{
			Name:        dbName,
			Collections: []CollectionImportResult{},
		}

		// Emit progress
		a.emitEvent("dryrun:progress", ExportProgress{
			Phase:         "analyzing",
			Database:      dbName,
			DatabaseIndex: dbIdx + 1,
			DatabaseTotal: totalDatabases,
		})

		// Override mode: count what currently exists (will be dropped)
		if opts.Mode == "override" {
			// Get list of collections currently in this database
			ctx, cancel := a.contextWithTimeout()
			collNames, err := db.ListCollectionNames(ctx, bson.M{})
			cancel()
			if err != nil {
				collNames = []string{}
			}

			// Count documents in each current collection
			var dbCurrentTotal int64
			for _, collName := range collNames {
				// Skip system collections
				if strings.HasPrefix(collName, "system.") {
					continue
				}
				ctx, cancel := a.contextWithTimeout()
				count, err := db.Collection(collName).CountDocuments(ctx, bson.M{})
				cancel()
				if err == nil {
					dbCurrentTotal += count
				}
			}
			dbResult.CurrentCount = dbCurrentTotal
			result.DocumentsDropped += dbCurrentTotal

			// Now add the collections from the archive (what will be inserted)
			for _, collManifest := range dbManifest.Collections {
				// Check if this collection currently exists and get its count
				var currentCount int64
				for _, existingColl := range collNames {
					if existingColl == collManifest.Name {
						ctx, cancel := a.contextWithTimeout()
						count, err := db.Collection(collManifest.Name).CountDocuments(ctx, bson.M{})
						cancel()
						if err == nil {
							currentCount = count
						}
						break
					}
				}

				collResult := CollectionImportResult{
					Name:              collManifest.Name,
					DocumentsInserted: collManifest.DocCount,
					DocumentsSkipped:  0,
					CurrentCount:      currentCount,
				}
				dbResult.Collections = append(dbResult.Collections, collResult)
				result.DocumentsInserted += collManifest.DocCount
			}
			result.Databases = append(result.Databases, dbResult)
			continue
		}

		// Skip mode: check which documents exist
		for _, collManifest := range dbManifest.Collections {
			collName := collManifest.Name
			coll := db.Collection(collName)

			collResult := CollectionImportResult{
				Name: collName,
			}

			a.emitEvent("dryrun:progress", ExportProgress{
				Phase:         "analyzing",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         collManifest.DocCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
			})

			// Read documents from NDJSON
			ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
			ndjsonFile := fileMap[ndjsonPath]
			if ndjsonFile == nil {
				result.Errors = append(result.Errors, fmt.Sprintf("missing documents file for %s.%s", dbName, collName))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			rc, err := ndjsonFile.Open()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to open documents for %s.%s: %v", dbName, collName, err))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			scanner := bufio.NewScanner(rc)
			const maxScanTokenSize = 16 * 1024 * 1024
			buf := make([]byte, maxScanTokenSize)
			scanner.Buffer(buf, maxScanTokenSize)

			// Collect IDs in batches to check existence
			var ids []interface{}
			var current int64
			const batchSize = 500

			for scanner.Scan() {
				line := scanner.Bytes()
				if len(line) == 0 {
					continue
				}

				var doc bson.M
				if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
					continue
				}

				if id, ok := doc["_id"]; ok {
					ids = append(ids, id)
				}

				current++

				// Check batch
				if len(ids) >= batchSize {
					existing := a.countExistingIds(coll, ids)
					collResult.DocumentsSkipped += existing
					collResult.DocumentsInserted += int64(len(ids)) - existing
					ids = ids[:0]
				}

				if current%1000 == 0 {
					a.emitEvent("dryrun:progress", ExportProgress{
						Phase:         "analyzing",
						Database:      dbName,
						Collection:    collName,
						Current:       current,
						Total:         collManifest.DocCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
					})
				}
			}
			rc.Close()

			// Check remaining IDs
			if len(ids) > 0 {
				existing := a.countExistingIds(coll, ids)
				collResult.DocumentsSkipped += existing
				collResult.DocumentsInserted += int64(len(ids)) - existing
			}

			result.DocumentsInserted += collResult.DocumentsInserted
			result.DocumentsSkipped += collResult.DocumentsSkipped
			dbResult.Collections = append(dbResult.Collections, collResult)
		}

		result.Databases = append(result.Databases, dbResult)
	}

	a.emitEvent("dryrun:complete", result)
	return result, nil
}

// countExistingIds counts how many of the given IDs exist in the collection
func (a *App) countExistingIds(coll *mongo.Collection, ids []interface{}) int64 {
	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	count, err := coll.CountDocuments(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return 0
	}
	return count
}

// ImportDatabases imports selected databases from a zip file
func (a *App) ImportDatabases(connID string, opts ImportOptions) (*ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	// Open zip file
	zipReader, err := zip.OpenReader(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest ExportManifest
	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	// Create cancellable context for the import operation
	importCtx, importCancel := context.WithCancel(context.Background())
	a.importCancel = importCancel
	defer func() {
		a.importCancel = nil
	}()

	// Filter databases if specified
	selectedDbs := make(map[string]bool)
	if len(opts.Databases) > 0 {
		for _, db := range opts.Databases {
			selectedDbs[db] = true
		}
	}

	// Filter manifest databases
	var databasesToImport []ExportManifestDatabase
	for _, db := range manifest.Databases {
		if len(selectedDbs) == 0 || selectedDbs[db.Name] {
			databasesToImport = append(databasesToImport, db)
		}
	}

	if len(databasesToImport) == 0 {
		return nil, fmt.Errorf("no databases selected for import")
	}

	result := &ImportResult{
		Databases: []DatabaseImportResult{},
		Errors:    []string{},
	}

	// Build a map for quick file lookup
	fileMap := make(map[string]*zip.File)
	for _, f := range zipReader.File {
		fileMap[f.Name] = f
	}

	totalDatabases := len(databasesToImport)

	// Import each database
	for dbIdx, dbManifest := range databasesToImport {
		// Check for cancellation
		select {
		case <-importCtx.Done():
			a.emitEvent("import:cancelled", result)
			return result, nil
		default:
		}

		dbName := dbManifest.Name
		db := client.Database(dbName)

		// Track per-database results
		dbResult := DatabaseImportResult{
			Name:        dbName,
			Collections: []CollectionImportResult{},
		}

		// Override mode: drop the database first
		if opts.Mode == "override" {
			a.emitEvent("import:progress", ExportProgress{
				Phase:         "dropping",
				Database:      dbName,
				Collection:    "",
				Current:       0,
				Total:         0,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
			})
			ctx, cancel := a.contextWithTimeout()
			if err := db.Drop(ctx); err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to drop database %s: %v", dbName, err))
			}
			cancel()
		}

		for _, collManifest := range dbManifest.Collections {
			collName := collManifest.Name
			coll := db.Collection(collName)

			// Track per-collection results
			collResult := CollectionImportResult{
				Name: collName,
			}

			// Emit progress
			a.emitEvent("import:progress", ExportProgress{
				Phase:         "importing",
				Database:      dbName,
				Collection:    collName,
				Current:       0,
				Total:         collManifest.DocCount,
				DatabaseIndex: dbIdx + 1,
				DatabaseTotal: totalDatabases,
			})

			// Import documents
			ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
			ndjsonFile := fileMap[ndjsonPath]
			if ndjsonFile == nil {
				result.Errors = append(result.Errors, fmt.Sprintf("missing documents file for %s.%s", dbName, collName))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			rc, err := ndjsonFile.Open()
			if err != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("failed to open documents for %s.%s: %v", dbName, collName, err))
				dbResult.Collections = append(dbResult.Collections, collResult)
				continue
			}

			// Process documents in batches using bufio.Scanner for NDJSON
			scanner := bufio.NewScanner(rc)
			// Increase buffer size for large documents
			const maxScanTokenSize = 16 * 1024 * 1024 // 16MB
			buf := make([]byte, maxScanTokenSize)
			scanner.Buffer(buf, maxScanTokenSize)

			var batch []interface{}
			var current int64
			const batchSize = 100

			cancelled := false
			for scanner.Scan() {
				// Check for cancellation periodically
				if current%100 == 0 {
					select {
					case <-importCtx.Done():
						cancelled = true
					default:
					}
				}
				if cancelled {
					break
				}

				line := scanner.Bytes()
				if len(line) == 0 {
					continue
				}

				var doc bson.M
				if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
					continue
				}

				// Both modes now just batch insert (override already dropped db, skip uses unordered insert)
				batch = append(batch, doc)
				if len(batch) >= batchSize {
					inserted, skipped := a.insertBatchSkipDuplicates(coll, batch)
					collResult.DocumentsInserted += inserted
					collResult.DocumentsSkipped += skipped
					result.DocumentsInserted += inserted
					result.DocumentsSkipped += skipped
					batch = batch[:0]
				}

				current++
				if current%1000 == 0 {
					a.emitEvent("import:progress", ExportProgress{
						Phase:         "importing",
						Database:      dbName,
						Collection:    collName,
						Current:       current,
						Total:         collManifest.DocCount,
						DatabaseIndex: dbIdx + 1,
						DatabaseTotal: totalDatabases,
					})
				}
			}
			rc.Close()

			// Check if we were cancelled
			if cancelled {
				// Save partial collection result
				dbResult.Collections = append(dbResult.Collections, collResult)
				result.Databases = append(result.Databases, dbResult)
				a.emitEvent("import:cancelled", result)
				return result, nil
			}

			// Insert remaining batch
			if len(batch) > 0 && opts.Mode != "upsert" {
				inserted, skipped := a.insertBatchSkipDuplicates(coll, batch)
				collResult.DocumentsInserted += inserted
				collResult.DocumentsSkipped += skipped
				result.DocumentsInserted += inserted
				result.DocumentsSkipped += skipped
			}

			dbResult.Collections = append(dbResult.Collections, collResult)

			// Import indexes
			indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
			indexFile := fileMap[indexPath]
			if indexFile != nil {
				rc, err := indexFile.Open()
				if err == nil {
					var indexes []bson.M
					if err := json.NewDecoder(rc).Decode(&indexes); err == nil {
						for _, idx := range indexes {
							// Extract keys and options
							keys, ok := idx["key"].(map[string]interface{})
							if !ok {
								continue
							}

							keyDoc := bson.D{}
							for k, v := range keys {
								keyDoc = append(keyDoc, bson.E{Key: k, Value: v})
							}

							indexOpts := options.Index()
							if name, ok := idx["name"].(string); ok {
								indexOpts.SetName(name)
							}
							if unique, ok := idx["unique"].(bool); ok && unique {
								indexOpts.SetUnique(true)
							}
							if sparse, ok := idx["sparse"].(bool); ok && sparse {
								indexOpts.SetSparse(true)
							}

							ctx, cancel := a.contextWithTimeout()
							_, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{
								Keys:    keyDoc,
								Options: indexOpts,
							})
							cancel()
							if err != nil {
								// Index might already exist, ignore error
							}
						}
					}
					rc.Close()
				}
			}
		}

		result.Databases = append(result.Databases, dbResult)
	}

	a.emitEvent("import:complete", result)
	return result, nil
}

// CancelImport cancels an ongoing import operation
func (a *App) CancelImport() {
	if a.importCancel != nil {
		a.importCancel()
	}
}

// =============================================================================
// Collection-Level Export/Import (single database)
// =============================================================================

// sanitizeFilename converts a string to a safe filename component
func sanitizeFilename(name string) string {
	var sanitized strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		} else if r == ' ' {
			sanitized.WriteRune('_')
		}
	}
	return sanitized.String()
}

// CollectionExportInfo provides collection info for the export modal
type CollectionExportInfo struct {
	Name       string `json:"name"`
	Count      int64  `json:"count"`
	SizeOnDisk int64  `json:"sizeOnDisk"`
}

// GetCollectionsForExport returns collections with their stats for export selection
func (a *App) GetCollectionsForExport(connID, dbName string) ([]CollectionExportInfo, error) {
	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	db := client.Database(dbName)

	// Get collection stats
	var result bson.M
	err = db.RunCommand(ctx, bson.D{{Key: "dbStats", Value: 1}}).Decode(&result)
	if err != nil {
		return nil, fmt.Errorf("failed to get database stats: %w", err)
	}

	// Get list of collections
	cursor, err := db.ListCollections(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("failed to list collections: %w", err)
	}
	defer cursor.Close(ctx)

	var collections []CollectionExportInfo
	for cursor.Next(ctx) {
		var collInfo struct {
			Name string `bson:"name"`
			Type string `bson:"type"`
		}
		if err := cursor.Decode(&collInfo); err != nil {
			continue
		}
		if collInfo.Type == "view" {
			continue // Skip views
		}

		coll := db.Collection(collInfo.Name)
		count, _ := coll.EstimatedDocumentCount(ctx)

		// Get collection stats for size
		var collStats bson.M
		db.RunCommand(ctx, bson.D{{Key: "collStats", Value: collInfo.Name}}).Decode(&collStats)
		var size int64
		if s, ok := collStats["size"].(int64); ok {
			size = s
		} else if s, ok := collStats["size"].(int32); ok {
			size = int64(s)
		}

		collections = append(collections, CollectionExportInfo{
			Name:       collInfo.Name,
			Count:      count,
			SizeOnDisk: size,
		})
	}

	// Sort by name
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].Name < collections[j].Name
	})

	return collections, nil
}

// ExportCollections exports selected collections from a single database to a zip file
func (a *App) ExportCollections(connID, dbName string, collNames []string) error {
	if len(collNames) == 0 {
		return fmt.Errorf("no collections selected for export")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return err
	}

	// Get connection name for filename
	connName := "export"
	if conn, err := a.GetSavedConnection(connID); err == nil {
		connName = conn.Name
	}

	// Build default filename
	safeName := sanitizeFilename(connName)
	if len(safeName) > 20 {
		safeName = safeName[:20]
	}
	safeDbName := sanitizeFilename(dbName)
	if len(safeDbName) > 20 {
		safeDbName = safeDbName[:20]
	}
	timestamp := time.Now().Format("2006-01-02")
	defaultFilename := fmt.Sprintf("%s-%s-%dc-%s.zip", safeName, safeDbName, len(collNames), timestamp)

	filePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Export Collections",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return nil // User cancelled
	}

	// Ensure .zip extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".zip") {
		filePath += ".zip"
	}

	// Create cancellable context for the export operation
	exportCtx, exportCancel := context.WithCancel(context.Background())
	a.exportCancel = exportCancel
	defer func() {
		a.exportCancel = nil
	}()

	// Create zip file
	zipFile, err := os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	manifest := ExportManifest{
		Version:    "1.0",
		ExportedAt: time.Now(),
		Databases: []ExportManifestDatabase{
			{
				Name:        dbName,
				Collections: []ExportManifestCollection{},
			},
		},
	}

	db := client.Database(dbName)
	totalCollections := len(collNames)

	// Export each collection
	for collIdx, collName := range collNames {
		// Check for cancellation
		select {
		case <-exportCtx.Done():
			a.emitEvent("export:cancelled", nil)
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		default:
		}

		coll := db.Collection(collName)

		// Get estimated document count for progress
		ctx, cancel := a.contextWithTimeout()
		estimatedCount, _ := coll.EstimatedDocumentCount(ctx)
		cancel()

		// Emit progress
		a.emitEvent("export:progress", ExportProgress{
			Phase:           "exporting",
			Database:        dbName,
			Collection:      collName,
			Current:         0,
			Total:           estimatedCount,
			CollectionIndex: collIdx + 1,
			CollectionTotal: totalCollections,
		})

		// Export documents as NDJSON
		ctx, cancel = context.WithTimeout(context.Background(), 5*time.Minute)
		docCursor, err := coll.Find(ctx, bson.D{})
		if err != nil {
			cancel()
			continue
		}

		ndjsonPath := fmt.Sprintf("%s/%s/documents.ndjson", dbName, collName)
		ndjsonWriter, err := zipWriter.Create(ndjsonPath)
		if err != nil {
			docCursor.Close(ctx)
			cancel()
			continue
		}

		var docCount int64
		cancelled := false
		for docCursor.Next(ctx) {
			// Check for cancellation periodically
			if docCount%100 == 0 {
				select {
				case <-exportCtx.Done():
					cancelled = true
				default:
				}
				if cancelled {
					break
				}

				// Emit progress update
				a.emitEvent("export:progress", ExportProgress{
					Phase:           "exporting",
					Database:        dbName,
					Collection:      collName,
					Current:         docCount,
					Total:           estimatedCount,
					CollectionIndex: collIdx + 1,
					CollectionTotal: totalCollections,
				})
			}

			var doc bson.M
			if err := docCursor.Decode(&doc); err != nil {
				continue
			}

			// Marshal as Extended JSON
			jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
			if err != nil {
				continue
			}
			ndjsonWriter.Write(jsonBytes)
			ndjsonWriter.Write([]byte("\n"))
			docCount++
		}
		docCursor.Close(ctx)
		cancel()

		if cancelled {
			a.emitEvent("export:cancelled", nil)
			zipWriter.Close()
			zipFile.Close()
			os.Remove(filePath)
			return fmt.Errorf("export cancelled")
		}

		// Export indexes
		ctx, cancel = a.contextWithTimeout()
		indexCursor, err := coll.Indexes().List(ctx)
		if err == nil {
			var indexes []bson.M
			indexCursor.All(ctx, &indexes)

			// Filter out _id index
			var exportIndexes []bson.M
			for _, idx := range indexes {
				if name, ok := idx["name"].(string); ok && name != "_id_" {
					exportIndexes = append(exportIndexes, idx)
				}
			}

			if len(exportIndexes) > 0 {
				indexPath := fmt.Sprintf("%s/%s/indexes.json", dbName, collName)
				indexWriter, err := zipWriter.Create(indexPath)
				if err == nil {
					indexBytes, _ := json.MarshalIndent(exportIndexes, "", "  ")
					indexWriter.Write(indexBytes)
				}
			}
		}
		cancel()

		manifest.Databases[0].Collections = append(manifest.Databases[0].Collections, ExportManifestCollection{
			Name:     collName,
			DocCount: docCount,
		})
	}

	// Write manifest
	manifestWriter, err := zipWriter.Create("manifest.json")
	if err == nil {
		manifestBytes, _ := json.MarshalIndent(manifest, "", "  ")
		manifestWriter.Write(manifestBytes)
	}

	a.emitEvent("export:complete", nil)
	return nil
}

// CollectionsImportPreview contains info about an export file for collection import
type CollectionsImportPreview struct {
	FilePath   string                           `json:"filePath"`
	ExportedAt string                           `json:"exportedAt"`
	Databases  []CollectionsImportPreviewDatabase `json:"databases"`
}

// CollectionsImportPreviewDatabase describes a database in the export file
type CollectionsImportPreviewDatabase struct {
	Name        string                         `json:"name"`
	Collections []CollectionsImportPreviewItem `json:"collections"`
}

// CollectionsImportPreviewItem describes a collection in the export file
type CollectionsImportPreviewItem struct {
	Name     string `json:"name"`
	DocCount int64  `json:"docCount"`
}

// PreviewCollectionsImportFile opens a file dialog and reads the export manifest
func (a *App) PreviewCollectionsImportFile() (*CollectionsImportPreview, error) {
	// Open file dialog
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Export File to Import",
		Filters: []runtime.FileFilter{
			{DisplayName: "Zip Files (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open file dialog: %w", err)
	}
	if filePath == "" {
		return nil, nil // User cancelled
	}

	// Open zip file
	zipReader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Read manifest
	var manifest ExportManifest
	for _, file := range zipReader.File {
		if file.Name == "manifest.json" {
			rc, err := file.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open manifest: %w", err)
			}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return nil, fmt.Errorf("failed to parse manifest: %w", err)
			}
			rc.Close()
			break
		}
	}

	if len(manifest.Databases) == 0 {
		return nil, fmt.Errorf("no databases found in archive")
	}

	// Build preview with databases and their collections
	preview := &CollectionsImportPreview{
		FilePath:   filePath,
		ExportedAt: manifest.ExportedAt.Format("2006-01-02 15:04:05"),
		Databases:  []CollectionsImportPreviewDatabase{},
	}

	for _, db := range manifest.Databases {
		dbPreview := CollectionsImportPreviewDatabase{
			Name:        db.Name,
			Collections: []CollectionsImportPreviewItem{},
		}
		for _, coll := range db.Collections {
			dbPreview.Collections = append(dbPreview.Collections, CollectionsImportPreviewItem{
				Name:     coll.Name,
				DocCount: coll.DocCount,
			})
		}
		preview.Databases = append(preview.Databases, dbPreview)
	}

	return preview, nil
}

// DryRunImportCollections previews what an import would do to a single database
func (a *App) DryRunImportCollections(connID, dbName string, opts ImportOptions) (*ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}
	if opts.SourceDatabase == "" {
		return nil, fmt.Errorf("no source database specified")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	// Open zip file
	zipReader, err := zip.OpenReader(opts.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	result := &ImportResult{
		Databases: []DatabaseImportResult{},
	}

	db := client.Database(dbName)
	dbResult := DatabaseImportResult{
		Name:        dbName,
		Collections: []CollectionImportResult{},
	}

	// Build set of selected collections for filtering
	selectedColls := make(map[string]bool)
	for _, c := range opts.Collections {
		selectedColls[c] = true
	}

	// Build map of files in zip by collection (only from source database)
	collectionFiles := make(map[string]*zip.File)
	for _, file := range zipReader.File {
		if strings.HasSuffix(file.Name, "/documents.ndjson") {
			parts := strings.Split(file.Name, "/")
			// Path format: dbName/collName/documents.ndjson
			if len(parts) >= 3 {
				sourceDb := parts[0]
				collName := parts[len(parts)-2]
				// Filter by source database
				if sourceDb != opts.SourceDatabase {
					continue
				}
				// Filter by selected collections if specified
				if len(selectedColls) > 0 && !selectedColls[collName] {
					continue
				}
				collectionFiles[collName] = file
			}
		}
	}

	totalCollections := len(collectionFiles)
	collIdx := 0

	for collName, file := range collectionFiles {
		collIdx++
		a.emitEvent("import:progress", ImportProgress{
			Phase:           "previewing",
			Database:        dbName,
			Collection:      collName,
			CollectionIndex: collIdx,
			CollectionTotal: totalCollections,
		})

		collResult := CollectionImportResult{
			Name: collName,
		}

		coll := db.Collection(collName)

		// Get current document count for override mode
		if opts.Mode == "override" {
			ctx, cancel := a.contextWithTimeout()
			currentCount, _ := coll.EstimatedDocumentCount(ctx)
			cancel()
			collResult.CurrentCount = currentCount
			dbResult.CurrentCount += currentCount
		}

		// Count documents in the export file and check for existing IDs
		rc, err := file.Open()
		if err != nil {
			continue
		}

		var allIDs []interface{}
		scanner := bufio.NewScanner(rc)
		scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)

		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}
			var doc bson.M
			if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
				continue
			}
			if id, ok := doc["_id"]; ok {
				allIDs = append(allIDs, id)
			}
		}
		rc.Close()

		// For skip mode, check how many already exist
		if opts.Mode == "skip" {
			existingCount := a.countExistingIds(coll, allIDs)
			collResult.DocumentsSkipped = existingCount
			collResult.DocumentsInserted = int64(len(allIDs)) - existingCount
		} else {
			// Override mode: all documents will be inserted after drop
			collResult.DocumentsInserted = int64(len(allIDs))
		}

		result.DocumentsInserted += collResult.DocumentsInserted
		result.DocumentsSkipped += collResult.DocumentsSkipped

		dbResult.Collections = append(dbResult.Collections, collResult)
	}

	// Calculate dropped count for override mode
	if opts.Mode == "override" {
		result.DocumentsDropped = dbResult.CurrentCount
	}

	result.Databases = append(result.Databases, dbResult)
	return result, nil
}

// ImportCollections imports collections from a zip file into a single database
func (a *App) ImportCollections(connID, dbName string, opts ImportOptions) (*ImportResult, error) {
	if opts.FilePath == "" {
		return nil, fmt.Errorf("no file path specified")
	}
	if opts.SourceDatabase == "" {
		return nil, fmt.Errorf("no source database specified")
	}

	client, err := a.getClient(connID)
	if err != nil {
		return nil, err
	}

	filePath := opts.FilePath

	// Open zip file
	zipReader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open zip file: %w", err)
	}
	defer zipReader.Close()

	// Create cancellable context
	importCtx, importCancel := context.WithCancel(context.Background())
	a.importCancel = importCancel
	defer func() {
		a.importCancel = nil
	}()

	result := &ImportResult{
		Databases: []DatabaseImportResult{},
	}

	db := client.Database(dbName)
	dbResult := DatabaseImportResult{
		Name:        dbName,
		Collections: []CollectionImportResult{},
	}

	// Build set of selected collections for filtering
	selectedColls := make(map[string]bool)
	for _, c := range opts.Collections {
		selectedColls[c] = true
	}

	// Build map of files in zip by collection
	type collFiles struct {
		docs    *zip.File
		indexes *zip.File
	}
	collections := make(map[string]*collFiles)

	for _, file := range zipReader.File {
		parts := strings.Split(file.Name, "/")
		if len(parts) >= 2 {
			collName := parts[len(parts)-2]
			// Filter by selected collections if specified
			if len(selectedColls) > 0 && !selectedColls[collName] {
				continue
			}
			if collections[collName] == nil {
				collections[collName] = &collFiles{}
			}
			if strings.HasSuffix(file.Name, "/documents.ndjson") {
				collections[collName].docs = file
			} else if strings.HasSuffix(file.Name, "/indexes.json") {
				collections[collName].indexes = file
			}
		}
	}

	totalCollections := len(collections)
	collIdx := 0
	cancelled := false

	for collName, files := range collections {
		// Check for cancellation
		select {
		case <-importCtx.Done():
			cancelled = true
		default:
		}
		if cancelled {
			break
		}

		collIdx++
		collResult := CollectionImportResult{
			Name: collName,
		}

		coll := db.Collection(collName)

		// For override mode, drop the collection first
		if opts.Mode == "override" {
			ctx, cancel := a.contextWithTimeout()
			coll.Drop(ctx)
			cancel()
		}

		// Import documents
		if files.docs != nil {
			a.emitEvent("import:progress", ImportProgress{
				Phase:           "importing",
				Database:        dbName,
				Collection:      collName,
				CollectionIndex: collIdx,
				CollectionTotal: totalCollections,
			})

			rc, err := files.docs.Open()
			if err != nil {
				continue
			}

			scanner := bufio.NewScanner(rc)
			scanner.Buffer(make([]byte, 1024*1024), 16*1024*1024)

			var batch []interface{}
			const batchSize = 1000
			var docCount int64

			for scanner.Scan() {
				// Check for cancellation
				if docCount%100 == 0 {
					select {
					case <-importCtx.Done():
						cancelled = true
					default:
					}
					if cancelled {
						break
					}
				}

				line := scanner.Bytes()
				if len(line) == 0 {
					continue
				}
				var doc bson.M
				if err := bson.UnmarshalExtJSON(line, true, &doc); err != nil {
					continue
				}
				batch = append(batch, doc)
				docCount++

				if len(batch) >= batchSize {
					if opts.Mode == "skip" {
						inserted, skipped := a.insertBatchSkipDuplicates(coll, batch)
						collResult.DocumentsInserted += inserted
						collResult.DocumentsSkipped += skipped
					} else {
						ctx, cancel := a.contextWithTimeout()
						res, err := coll.InsertMany(ctx, batch, options.InsertMany().SetOrdered(false))
						cancel()
						if err == nil && res != nil {
							collResult.DocumentsInserted += int64(len(res.InsertedIDs))
						}
					}
					batch = batch[:0]

					a.emitEvent("import:progress", ImportProgress{
						Phase:           "importing",
						Database:        dbName,
						Collection:      collName,
						Current:         docCount,
						CollectionIndex: collIdx,
						CollectionTotal: totalCollections,
					})
				}
			}
			rc.Close()

			// Insert remaining batch
			if len(batch) > 0 && !cancelled {
				if opts.Mode == "skip" {
					inserted, skipped := a.insertBatchSkipDuplicates(coll, batch)
					collResult.DocumentsInserted += inserted
					collResult.DocumentsSkipped += skipped
				} else {
					ctx, cancel := a.contextWithTimeout()
					res, err := coll.InsertMany(ctx, batch, options.InsertMany().SetOrdered(false))
					cancel()
					if err == nil && res != nil {
						collResult.DocumentsInserted += int64(len(res.InsertedIDs))
					}
				}
			}
		}

		// Import indexes
		if files.indexes != nil && !cancelled {
			rc, err := files.indexes.Open()
			if err == nil {
				var indexes []bson.M
				json.NewDecoder(rc).Decode(&indexes)
				rc.Close()

				for _, idx := range indexes {
					keys, ok := idx["key"].(bson.M)
					if !ok {
						continue
					}
					indexModel := mongo.IndexModel{
						Keys: keys,
					}
					// Add options if present
					if name, ok := idx["name"].(string); ok {
						indexModel.Options = options.Index().SetName(name)
					}
					if unique, ok := idx["unique"].(bool); ok && unique {
						if indexModel.Options == nil {
							indexModel.Options = options.Index()
						}
						indexModel.Options.SetUnique(true)
					}
					ctx, cancel := a.contextWithTimeout()
					coll.Indexes().CreateOne(ctx, indexModel)
					cancel()
				}
			}
		}

		result.DocumentsInserted += collResult.DocumentsInserted
		result.DocumentsSkipped += collResult.DocumentsSkipped
		dbResult.Collections = append(dbResult.Collections, collResult)
	}

	result.Databases = append(result.Databases, dbResult)

	if cancelled {
		a.emitEvent("import:cancelled", result)
		return result, fmt.Errorf("import cancelled")
	}

	a.emitEvent("import:complete", result)
	return result, nil
}

// insertBatchSkipDuplicates inserts documents, skipping duplicates
func (a *App) insertBatchSkipDuplicates(coll *mongo.Collection, batch []interface{}) (inserted, skipped int64) {
	if len(batch) == 0 {
		return 0, 0
	}

	ctx, cancel := a.contextWithTimeout()
	defer cancel()

	opts := options.InsertMany().SetOrdered(false)
	result, err := coll.InsertMany(ctx, batch, opts)
	if err != nil {
		// Check for bulk write errors (duplicate key errors)
		if bwe, ok := err.(mongo.BulkWriteException); ok {
			inserted = int64(len(batch) - len(bwe.WriteErrors))
			skipped = int64(len(bwe.WriteErrors))
			return
		}
		// Other error, count all as skipped
		return 0, int64(len(batch))
	}

	return int64(len(result.InsertedIDs)), 0
}

// =============================================================================
// Script Execution Methods (mongosh)
// =============================================================================

// ScriptResult represents the result of executing a MongoDB shell script
type ScriptResult struct {
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
	ExitCode int    `json:"exitCode"`
}

// CheckMongoshAvailable checks if mongosh is installed and available
func (a *App) CheckMongoshAvailable() (bool, string) {
	// Try mongosh first (modern MongoDB shell)
	if path, err := exec.LookPath("mongosh"); err == nil {
		return true, path
	}
	// Fall back to legacy mongo shell
	if path, err := exec.LookPath("mongo"); err == nil {
		return true, path
	}
	return false, ""
}

// ExecuteScript executes a MongoDB shell script using mongosh
func (a *App) ExecuteScript(connID, script string) (*ScriptResult, error) {
	if script == "" {
		return nil, fmt.Errorf("script cannot be empty")
	}

	// Check if mongosh is available
	available, shellPath := a.CheckMongoshAvailable()
	if !available {
		return nil, fmt.Errorf("mongosh or mongo shell not found. Please install MongoDB Shell: https://www.mongodb.com/try/download/shell")
	}

	// Get connection URI with password
	uri, err := a.getConnectionURI(connID)
	if err != nil {
		return nil, err
	}

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build command arguments
	args := []string{
		uri,
		"--quiet", // Suppress connection messages
		"--norc",  // Don't load .mongoshrc.js
		"--eval", script,
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Capture stdout and stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err = cmd.Run()

	result := &ScriptResult{
		Output:   stdout.String(),
		Error:    stderr.String(),
		ExitCode: 0,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			result.Error = "script execution timed out (60s limit)"
			result.ExitCode = -1
		} else {
			result.Error = err.Error()
			result.ExitCode = -1
		}
	}

	// Combine stderr with output if there's an error
	if result.Error != "" && result.Output == "" {
		result.Output = result.Error
	}

	return result, nil
}

// ExecuteScriptWithDatabase executes a script against a specific database
func (a *App) ExecuteScriptWithDatabase(connID, dbName, script string) (*ScriptResult, error) {
	if script == "" {
		return nil, fmt.Errorf("script cannot be empty")
	}
	if dbName == "" {
		return nil, fmt.Errorf("database name cannot be empty")
	}

	// Check if mongosh is available
	available, shellPath := a.CheckMongoshAvailable()
	if !available {
		return nil, fmt.Errorf("mongosh or mongo shell not found. Please install MongoDB Shell: https://www.mongodb.com/try/download/shell")
	}

	// Get connection URI with password
	uri, err := a.getConnectionURI(connID)
	if err != nil {
		return nil, err
	}

	// Parse and modify URI to include database
	parsedURI, err := url.Parse(uri)
	if err != nil {
		return nil, fmt.Errorf("invalid connection URI: %w", err)
	}

	// Set the database in the path
	parsedURI.Path = "/" + dbName
	uriWithDB := parsedURI.String()

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build command arguments
	args := []string{
		uriWithDB,
		"--quiet",
		"--norc",
		"--eval", script,
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Capture stdout and stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err = cmd.Run()

	result := &ScriptResult{
		Output:   stdout.String(),
		Error:    stderr.String(),
		ExitCode: 0,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			result.Error = "script execution timed out (60s limit)"
			result.ExitCode = -1
		} else {
			result.Error = err.Error()
			result.ExitCode = -1
		}
	}

	if result.Error != "" && result.Output == "" {
		result.Output = result.Error
	}

	return result, nil
}
