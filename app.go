package main

import (
	"archive/zip"
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
