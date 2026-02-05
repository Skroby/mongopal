package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/peternagy/mongopal/internal/connection"
	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/credential"
	"github.com/peternagy/mongopal/internal/database"
	"github.com/peternagy/mongopal/internal/debug"
	"github.com/peternagy/mongopal/internal/document"
	"github.com/peternagy/mongopal/internal/export"
	"github.com/peternagy/mongopal/internal/importer"
	"github.com/peternagy/mongopal/internal/performance"
	"github.com/peternagy/mongopal/internal/schema"
	"github.com/peternagy/mongopal/internal/script"
	"github.com/peternagy/mongopal/internal/storage"
	"github.com/peternagy/mongopal/internal/types"
)

// =============================================================================
// Type Re-exports for Wails Binding Generation
// =============================================================================

type Folder = types.Folder
type SavedConnection = types.SavedConnection
type ConnectionInfo = types.ConnectionInfo
type ConnectionStatus = types.ConnectionStatus
type DatabaseInfo = types.DatabaseInfo
type CollectionInfo = types.CollectionInfo
type CollectionExportInfo = types.CollectionExportInfo
type CollectionStats = types.CollectionStats
type IndexInfo = types.IndexInfo
type IndexOptions = types.IndexOptions
type ExplainResult = types.ExplainResult
type QueryPlannerResult = types.QueryPlannerResult
type ExecutionStatsResult = types.ExecutionStatsResult
type QueryOptions = types.QueryOptions
type QueryResult = types.QueryResult
type SchemaField = types.SchemaField
type SchemaResult = types.SchemaResult
type DocumentExportEntry = types.DocumentExportEntry
type ExportProgress = types.ExportProgress
type ImportProgress = types.ImportProgress
type ImportOptions = types.ImportOptions
type ImportPreview = types.ImportPreview
type ImportPreviewDatabase = types.ImportPreviewDatabase
type CollectionImportResult = types.CollectionImportResult
type DatabaseImportResult = types.DatabaseImportResult
type ImportResult = types.ImportResult
type ExportManifest = types.ExportManifest
type ExportManifestDatabase = types.ExportManifestDatabase
type ExportManifestCollection = types.ExportManifestCollection
type CollectionsImportPreview = types.CollectionsImportPreview
type CollectionsImportPreviewDatabase = types.CollectionsImportPreviewDatabase
type CollectionsImportPreviewItem = types.CollectionsImportPreviewItem
type ScriptResult = types.ScriptResult
type CSVExportOptions = types.CSVExportOptions
type SavedQuery = types.SavedQuery
type PerformanceMetrics = performance.Metrics

// =============================================================================
// App - Thin Facade for Wails Bindings
// =============================================================================

// App struct holds the application state and services
type App struct {
	state       *core.AppState
	storage     *storage.Service
	credential  *credential.Service
	connStore   *storage.ConnectionService
	folderSvc   *storage.FolderService
	querySvc    *storage.QueryService
	favoriteSvc *storage.FavoriteService
	dbMetaSvc   *storage.DatabaseMetadataService
	connection  *connection.Service
	database    *database.Service
	document    *document.Service
	schema      *schema.Service
	export      *export.Service
	importer    *importer.Service
	script      *script.Service
	performance *performance.Service
}

// NewApp creates a new App instance
func NewApp() *App {
	state := core.NewAppState()
	credSvc := credential.NewService()
	storageSvc := storage.NewService("")

	return &App{
		state:      state,
		credential: credSvc,
		storage:    storageSvc,
	}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.state.Ctx = ctx
	a.state.Emitter = &core.WailsEventEmitter{Ctx: ctx}

	// Initialize debug logger
	debug.Init(ctx)

	// Initialize config directory and storage
	configDir := storage.InitConfigDir()
	a.storage = storage.NewService(configDir)
	a.state.ConfigDir = configDir

	// Load connections and folders
	connections, _ := a.storage.LoadConnections()
	folders, _ := a.storage.LoadFolders()
	a.state.SavedConnections = connections
	a.state.Folders = folders

	// Initialize all services
	a.connStore = storage.NewConnectionService(a.state, a.storage, a.credential)
	a.folderSvc = storage.NewFolderService(a.state, a.storage)
	a.querySvc = storage.NewQueryService(configDir)
	a.favoriteSvc = storage.NewFavoriteService(configDir)
	a.dbMetaSvc = storage.NewDatabaseMetadataService(configDir)
	a.connection = connection.NewService(a.state, a.connStore)
	a.database = database.NewService(a.state)
	a.document = document.NewService(a.state)
	a.schema = schema.NewService(a.state)
	a.export = export.NewService(a.state, a.connStore)
	a.importer = importer.NewService(a.state, a.connStore)
	a.script = script.NewService(a.connStore)
	a.performance = performance.NewService(a.state)
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	a.connection.Shutdown(ctx)
}

// =============================================================================
// Connection Methods
// =============================================================================

func (a *App) Connect(connID string) error {
	return a.connection.Connect(connID)
}

func (a *App) Disconnect(connID string) error {
	return a.connection.Disconnect(connID)
}

func (a *App) DisconnectAll() error {
	return a.connection.DisconnectAll()
}

func (a *App) TestConnection(uri string) error {
	return a.connection.TestConnection(uri)
}

func (a *App) GetConnectionStatus(connID string) ConnectionStatus {
	return a.connection.GetConnectionStatus(connID)
}

func (a *App) GetConnectionInfo(connID string) ConnectionInfo {
	return a.connection.GetConnectionInfo(connID)
}

// =============================================================================
// Storage - Connection Methods
// =============================================================================

func (a *App) SaveConnection(conn SavedConnection, password string) error {
	return a.connStore.SaveConnection(conn, password)
}

func (a *App) ListSavedConnections() ([]SavedConnection, error) {
	return a.connStore.ListSavedConnections()
}

func (a *App) GetSavedConnection(connID string) (SavedConnection, error) {
	return a.connStore.GetSavedConnection(connID)
}

func (a *App) DeleteSavedConnection(connID string) error {
	// Delete the connection
	if err := a.connStore.DeleteSavedConnection(connID); err != nil {
		return err
	}
	// Clean up associated data (ignore errors, these are secondary)
	_ = a.favoriteSvc.RemoveFavoritesForConnection(connID)
	_ = a.dbMetaSvc.RemoveMetadataForConnection(connID)
	_ = a.querySvc.DeleteQueriesForConnection(connID)
	return nil
}

func (a *App) DuplicateConnection(connID, newName string) (SavedConnection, error) {
	return a.connStore.DuplicateConnection(connID, newName)
}

func (a *App) ExportConnections(folderID string) (string, error) {
	return a.connStore.ExportConnections(folderID)
}

func (a *App) ImportConnections(jsonStr string) error {
	return a.connStore.ImportConnections(jsonStr)
}

func (a *App) ConnectionToURI(connID string) (string, error) {
	return a.connStore.ConnectionToURI(connID)
}

func (a *App) ConnectionFromURI(uri string) (SavedConnection, error) {
	return a.connStore.ConnectionFromURI(uri)
}

// =============================================================================
// Storage - Folder Methods
// =============================================================================

func (a *App) CreateFolder(name, parentID string) (Folder, error) {
	return a.folderSvc.CreateFolder(name, parentID)
}

func (a *App) DeleteFolder(folderID string) error {
	return a.folderSvc.DeleteFolder(folderID)
}

func (a *App) ListFolders() ([]Folder, error) {
	return a.folderSvc.ListFolders()
}

func (a *App) UpdateFolder(folderID, name, parentID string) error {
	return a.folderSvc.UpdateFolder(folderID, name, parentID)
}

func (a *App) MoveConnectionToFolder(connID, folderID string) error {
	return a.folderSvc.MoveConnectionToFolder(connID, folderID)
}

// =============================================================================
// Database Methods
// =============================================================================

func (a *App) ListDatabases(connID string) ([]DatabaseInfo, error) {
	databases, err := a.database.ListDatabases(connID)
	if err != nil {
		return nil, err
	}

	// Collect database names for cleanup
	dbNames := make([]string, len(databases))
	for i, db := range databases {
		dbNames[i] = db.Name
	}

	// Cleanup stale database metadata (databases that no longer exist)
	_ = a.dbMetaSvc.CleanupStaleDatabases(connID, dbNames)

	// Enrich with LastAccessedAt from metadata
	for i := range databases {
		databases[i].LastAccessedAt = a.dbMetaSvc.GetDatabaseLastAccessed(connID, databases[i].Name)
	}

	return databases, nil
}

func (a *App) UpdateDatabaseAccessed(connID, dbName string) error {
	return a.dbMetaSvc.UpdateDatabaseAccessed(connID, dbName)
}

func (a *App) ListCollections(connID, dbName string) ([]CollectionInfo, error) {
	return a.database.ListCollections(connID, dbName)
}

func (a *App) ListIndexes(connID, dbName, collName string) ([]IndexInfo, error) {
	return a.database.ListIndexes(connID, dbName, collName)
}

func (a *App) CreateIndex(connID, dbName, collName string, keys map[string]int, opts IndexOptions) error {
	return a.database.CreateIndex(connID, dbName, collName, keys, opts)
}

func (a *App) DropIndex(connID, dbName, collName, indexName string) error {
	return a.database.DropIndex(connID, dbName, collName, indexName)
}

func (a *App) DropDatabase(connID, dbName string) error {
	return a.database.DropDatabase(connID, dbName)
}

func (a *App) DropCollection(connID, dbName, collName string) error {
	return a.database.DropCollection(connID, dbName, collName)
}

func (a *App) ClearCollection(connID, dbName, collName string) error {
	return a.database.ClearCollection(connID, dbName, collName)
}

func (a *App) GetDatabasesForExport(connID string) ([]DatabaseInfo, error) {
	return a.database.ListDatabases(connID)
}

func (a *App) GetCollectionsForExport(connID, dbName string) ([]CollectionExportInfo, error) {
	return a.database.GetCollectionsForExport(connID, dbName)
}

func (a *App) GetCollectionStats(connID, dbName, collName string) (*CollectionStats, error) {
	return a.database.GetCollectionStats(connID, dbName, collName)
}

func (a *App) ExplainQuery(connID, dbName, collName, filter string) (*ExplainResult, error) {
	return a.database.ExplainQuery(connID, dbName, collName, filter)
}

// =============================================================================
// Document Methods
// =============================================================================

func (a *App) FindDocuments(connID, dbName, collName, query string, opts QueryOptions) (*QueryResult, error) {
	return a.document.FindDocuments(connID, dbName, collName, query, opts)
}

func (a *App) GetDocument(connID, dbName, collName, docID string) (string, error) {
	return a.document.GetDocument(connID, dbName, collName, docID)
}

func (a *App) UpdateDocument(connID, dbName, collName, docID, jsonDoc string) error {
	return a.document.UpdateDocument(connID, dbName, collName, docID, jsonDoc)
}

func (a *App) InsertDocument(connID, dbName, collName, jsonDoc string) (string, error) {
	return a.document.InsertDocument(connID, dbName, collName, jsonDoc)
}

func (a *App) DeleteDocument(connID, dbName, collName, docID string) error {
	return a.document.DeleteDocument(connID, dbName, collName, docID)
}

func (a *App) ValidateJSON(jsonStr string) error {
	return document.ValidateJSON(jsonStr)
}

// =============================================================================
// Schema Methods
// =============================================================================

func (a *App) InferCollectionSchema(connID, dbName, collName string, sampleSize int) (*SchemaResult, error) {
	return a.schema.InferCollectionSchema(connID, dbName, collName, sampleSize)
}

func (a *App) ExportSchemaAsJSON(jsonContent, defaultFilename string) error {
	return schema.ExportSchemaAsJSON(a.state.Ctx, jsonContent, defaultFilename)
}

// =============================================================================
// Export Methods
// =============================================================================

func (a *App) ExportDatabases(connID string, dbNames []string) error {
	return a.export.ExportDatabases(connID, dbNames)
}

func (a *App) CancelExport() {
	a.export.CancelExport()
}

func (a *App) PauseExport() {
	a.export.PauseExport()
}

func (a *App) ResumeExport() {
	a.export.ResumeExport()
}

func (a *App) IsExportPaused() bool {
	return a.export.IsExportPaused()
}

func (a *App) ExportCollections(connID, dbName string, collNames []string) error {
	return a.export.ExportCollections(connID, dbName, collNames)
}

func (a *App) ExportDocumentsAsZip(entries []DocumentExportEntry, defaultFilename string) error {
	return a.export.ExportDocumentsAsZip(entries, defaultFilename)
}

func (a *App) ExportCollectionAsCSV(connID, dbName, collName, defaultFilename string, opts CSVExportOptions) error {
	return a.export.ExportCollectionAsCSV(connID, dbName, collName, defaultFilename, opts)
}

func (a *App) GetCSVSavePath(defaultFilename string) (string, error) {
	return a.export.GetCSVSavePath(defaultFilename)
}

func (a *App) RevealInFinder(filePath string) error {
	return a.export.RevealInFinder(filePath)
}

// =============================================================================
// Import Methods
// =============================================================================

func (a *App) PreviewImportFile() (*ImportPreview, error) {
	return a.importer.PreviewImportFile()
}

func (a *App) DryRunImport(connID string, opts ImportOptions) (*ImportResult, error) {
	return a.importer.DryRunImport(connID, opts)
}

func (a *App) ImportDatabases(connID string, opts ImportOptions) (*ImportResult, error) {
	return a.importer.ImportDatabases(connID, opts)
}

func (a *App) CancelImport() {
	a.importer.CancelImport()
}

func (a *App) PauseImport() {
	a.importer.PauseImport()
}

func (a *App) ResumeImport() {
	a.importer.ResumeImport()
}

func (a *App) IsImportPaused() bool {
	return a.importer.IsImportPaused()
}

func (a *App) PreviewCollectionsImportFile() (*CollectionsImportPreview, error) {
	return a.importer.PreviewCollectionsImportFile()
}

func (a *App) DryRunImportCollections(connID, dbName string, opts ImportOptions) (*ImportResult, error) {
	return a.importer.DryRunImportCollections(connID, dbName, opts)
}

func (a *App) ImportCollections(connID, dbName string, opts ImportOptions) (*ImportResult, error) {
	return a.importer.ImportCollections(connID, dbName, opts)
}

// =============================================================================
// Script Execution Methods
// =============================================================================

func (a *App) CheckMongoshAvailable() (bool, string) {
	return script.CheckMongoshAvailable()
}

func (a *App) ExecuteScript(connID, scriptContent string) (*ScriptResult, error) {
	return a.script.ExecuteScript(connID, scriptContent)
}

func (a *App) ExecuteScriptWithDatabase(connID, dbName, scriptContent string) (*ScriptResult, error) {
	return a.script.ExecuteScriptWithDatabase(connID, dbName, scriptContent)
}

// =============================================================================
// Saved Query Methods
// =============================================================================

func (a *App) SaveQuery(query SavedQuery) (SavedQuery, error) {
	return a.querySvc.SaveQuery(query)
}

func (a *App) GetSavedQuery(queryID string) (SavedQuery, error) {
	return a.querySvc.GetQuery(queryID)
}

func (a *App) ListSavedQueries(connectionID, database, collection string) ([]SavedQuery, error) {
	return a.querySvc.ListQueries(connectionID, database, collection)
}

func (a *App) DeleteSavedQuery(queryID string) error {
	return a.querySvc.DeleteQuery(queryID)
}

// =============================================================================
// Performance Methods
// =============================================================================

func (a *App) GetPerformanceMetrics() *PerformanceMetrics {
	return a.performance.GetMetrics()
}

func (a *App) ForceGC() {
	a.performance.ForceGC()
}

// =============================================================================
// Debug Methods
// =============================================================================

func (a *App) SetDebugEnabled(enabled bool) {
	debug.SetEnabled(enabled)
}

func (a *App) SaveDebugLogs(jsonContent, defaultFilename string) error {
	filePath, err := runtime.SaveFileDialog(a.state.Ctx, runtime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           "Save Debug Logs",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to open save dialog: %w", err)
	}
	if filePath == "" {
		return nil // User cancelled
	}

	if !strings.HasSuffix(strings.ToLower(filePath), ".json") {
		filePath += ".json"
	}

	if err := os.WriteFile(filePath, []byte(jsonContent), 0644); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

// =============================================================================
// Collection Favorites Methods
// =============================================================================

func (a *App) AddFavorite(connID, dbName, collName string) error {
	return a.favoriteSvc.AddFavorite(connID, dbName, collName)
}

func (a *App) RemoveFavorite(connID, dbName, collName string) error {
	return a.favoriteSvc.RemoveFavorite(connID, dbName, collName)
}

func (a *App) ListFavorites() []string {
	return a.favoriteSvc.ListFavorites()
}

// =============================================================================
// Database Favorites Methods
// =============================================================================

func (a *App) AddDatabaseFavorite(connID, dbName string) error {
	return a.favoriteSvc.AddDatabaseFavorite(connID, dbName)
}

func (a *App) RemoveDatabaseFavorite(connID, dbName string) error {
	return a.favoriteSvc.RemoveDatabaseFavorite(connID, dbName)
}

func (a *App) ListDatabaseFavorites() []string {
	return a.favoriteSvc.ListDatabaseFavorites()
}
