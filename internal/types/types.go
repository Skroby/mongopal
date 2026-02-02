// Package types contains shared type definitions used across the mongopal application.
package types

import "time"

// =============================================================================
// Folder and Connection Types
// =============================================================================

// Folder represents a folder for organizing connections.
type Folder struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

// SavedConnection represents a saved MongoDB connection.
type SavedConnection struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	FolderID       string    `json:"folderId,omitempty"`
	URI            string    `json:"uri"`
	Color          string    `json:"color"`
	ReadOnly       bool      `json:"readOnly"`
	CreatedAt      time.Time `json:"createdAt"`
	LastAccessedAt time.Time `json:"lastAccessedAt,omitempty"`
}

// ConnectionInfo provides detailed info about a connection.
type ConnectionInfo struct {
	ID            string `json:"id"`
	Type          string `json:"type"`       // "standalone", "replicaset", "sharded"
	ReplicaSet    string `json:"replicaSet"` // e.g., "rs0"
	Primary       string `json:"primary"`
	ServerVersion string `json:"serverVersion"`
}

// ConnectionStatus represents the status of a connection.
type ConnectionStatus struct {
	Connected bool   `json:"connected"`
	Error     string `json:"error,omitempty"`
}

// =============================================================================
// Database and Collection Types
// =============================================================================

// DatabaseInfo describes a MongoDB database.
type DatabaseInfo struct {
	Name       string `json:"name"`
	SizeOnDisk int64  `json:"sizeOnDisk"`
	Empty      bool   `json:"empty"`
}

// CollectionInfo describes a MongoDB collection.
type CollectionInfo struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Count int64  `json:"count"`
}

// IndexInfo describes a MongoDB index.
type IndexInfo struct {
	Name       string         `json:"name"`
	Keys       map[string]int `json:"keys"`
	Unique     bool           `json:"unique"`
	Sparse     bool           `json:"sparse"`
	TTL        int64          `json:"ttl,omitempty"`        // TTL in seconds, 0 if not a TTL index
	Size       int64          `json:"size"`                 // Index size in bytes
	UsageCount int64          `json:"usageCount,omitempty"` // Number of operations that used this index
}

// IndexOptions specifies options for creating an index.
type IndexOptions struct {
	Unique             bool   `json:"unique"`
	Sparse             bool   `json:"sparse"`
	Background         bool   `json:"background"`
	ExpireAfterSeconds int64  `json:"expireAfterSeconds,omitempty"` // TTL in seconds
	Name               string `json:"name,omitempty"`               // Custom index name
}

// CollectionExportInfo provides collection info for the export modal.
type CollectionExportInfo struct {
	Name       string `json:"name"`
	Count      int64  `json:"count"`
	SizeOnDisk int64  `json:"sizeOnDisk"`
}

// CollectionStats contains statistics about a MongoDB collection.
type CollectionStats struct {
	Namespace      string `json:"namespace"`      // Full namespace (db.collection)
	Count          int64  `json:"count"`          // Number of documents
	Size           int64  `json:"size"`           // Total uncompressed size of documents in bytes
	StorageSize    int64  `json:"storageSize"`    // Storage size on disk in bytes
	AvgObjSize     int64  `json:"avgObjSize"`     // Average document size in bytes
	IndexCount     int    `json:"indexCount"`     // Number of indexes
	TotalIndexSize int64  `json:"totalIndexSize"` // Total size of all indexes in bytes
	Capped         bool   `json:"capped"`         // Whether collection is capped
}

// =============================================================================
// Query Types
// =============================================================================

// ExplainResult contains the results of an explain plan analysis.
type ExplainResult struct {
	QueryPlanner     QueryPlannerResult   `json:"queryPlanner"`
	ExecutionStats   ExecutionStatsResult `json:"executionStats"`
	WinningPlan      string               `json:"winningPlan"`      // Human-readable summary of winning plan
	IndexUsed        string               `json:"indexUsed"`        // Name of index used, empty if collection scan
	IsCollectionScan bool                 `json:"isCollectionScan"` // True if no index was used
	RawExplain       string               `json:"rawExplain"`       // Full explain output as JSON
}

// QueryPlannerResult contains query planner information.
type QueryPlannerResult struct {
	Namespace        string `json:"namespace"`
	IndexFilterSet   bool   `json:"indexFilterSet"`
	ParsedQuery      string `json:"parsedQuery"`      // Query as parsed by MongoDB
	RejectedPlans    int    `json:"rejectedPlans"`    // Number of rejected query plans
	WinningPlanStage string `json:"winningPlanStage"` // Top-level stage of winning plan
}

// ExecutionStatsResult contains execution statistics.
type ExecutionStatsResult struct {
	ExecutionSuccess  bool  `json:"executionSuccess"`
	NReturned         int64 `json:"nReturned"`         // Documents returned
	ExecutionTimeMs   int64 `json:"executionTimeMs"`   // Execution time in milliseconds
	TotalKeysExamined int64 `json:"totalKeysExamined"` // Index keys examined
	TotalDocsExamined int64 `json:"totalDocsExamined"` // Documents examined
}

// QueryOptions specifies parameters for document queries.
type QueryOptions struct {
	Skip       int64  `json:"skip"`
	Limit      int64  `json:"limit"`
	Sort       string `json:"sort"`
	Projection string `json:"projection"`
}

// QueryResult contains the result of a document query.
type QueryResult struct {
	Documents   []string `json:"documents"` // Extended JSON strings
	Total       int64    `json:"total"`
	HasMore     bool     `json:"hasMore"`
	QueryTimeMs int64    `json:"queryTimeMs"`
	Warnings    []string `json:"warnings,omitempty"` // Non-fatal errors during query
}

// =============================================================================
// Schema Types
// =============================================================================

// SchemaField represents a field in the inferred schema.
type SchemaField struct {
	Type       string                 `json:"type"`
	Occurrence float64                `json:"occurrence"`          // Percentage of documents containing this field
	Fields     map[string]SchemaField `json:"fields,omitempty"`    // For nested objects
	ArrayType  *SchemaField           `json:"arrayType,omitempty"` // For arrays
}

// SchemaResult represents the inferred schema of a collection.
type SchemaResult struct {
	Collection string                 `json:"collection"`
	SampleSize int                    `json:"sampleSize"`
	TotalDocs  int64                  `json:"totalDocs"`
	Fields     map[string]SchemaField `json:"fields"`
}

// =============================================================================
// Export/Import Types
// =============================================================================

// DocumentExportEntry represents a document to be exported.
type DocumentExportEntry struct {
	Database   string `json:"database"`
	Collection string `json:"collection"`
	DocID      string `json:"docId"`
	JSON       string `json:"json"`
}

// ExportProgress represents the progress of an export/import operation.
type ExportProgress struct {
	Phase           string `json:"phase"` // "exporting" | "importing" | "previewing"
	Database        string `json:"database"`
	Collection      string `json:"collection"`
	Current         int64  `json:"current"`
	Total           int64  `json:"total"`
	DatabaseIndex   int    `json:"databaseIndex"`   // Current database (1-indexed)
	DatabaseTotal   int    `json:"databaseTotal"`   // Total databases
	CollectionIndex int    `json:"collectionIndex"` // Current collection (1-indexed) for collection-level exports
	CollectionTotal int    `json:"collectionTotal"` // Total collections for collection-level exports
	ProcessedDocs   int64  `json:"processedDocs"`   // Cumulative docs processed across all collections
	TotalDocs       int64  `json:"totalDocs"`       // Total docs across all collections (for ETA)
}

// ImportProgress is the same as ExportProgress.
type ImportProgress = ExportProgress

// ImportOptions specifies how to handle existing documents during import.
type ImportOptions struct {
	FilePath       string   `json:"filePath"`       // Path to the zip file
	Databases      []string `json:"databases"`      // Databases to import (empty = all)
	Collections    []string `json:"collections"`    // Collections to import (empty = all, for collection-level imports)
	SourceDatabase string   `json:"sourceDatabase"` // Source database in archive (for collection-level imports)
	Mode           string   `json:"mode"`           // "skip" | "override"
}

// ImportPreview contains info about an import file for user selection.
type ImportPreview struct {
	FilePath   string                  `json:"filePath"`
	ExportedAt string                  `json:"exportedAt"`
	Databases  []ImportPreviewDatabase `json:"databases"`
}

// ImportPreviewDatabase contains info about a database in the import file.
type ImportPreviewDatabase struct {
	Name            string `json:"name"`
	CollectionCount int    `json:"collectionCount"`
	DocumentCount   int64  `json:"documentCount"`
}

// CollectionImportResult contains import results for a single collection.
type CollectionImportResult struct {
	Name                string `json:"name"`
	DocumentsInserted   int64  `json:"documentsInserted"`
	DocumentsSkipped    int64  `json:"documentsSkipped"`
	DocumentsParseError int64  `json:"documentsParseError,omitempty"` // Docs that failed to parse
	CurrentCount        int64  `json:"currentCount,omitempty"`        // For dry-run: docs currently in target
}

// DatabaseImportResult contains import results for a single database.
type DatabaseImportResult struct {
	Name         string                   `json:"name"`
	Collections  []CollectionImportResult `json:"collections"`
	CurrentCount int64                    `json:"currentCount,omitempty"` // For dry-run: total docs currently in target
}

// ImportResult contains the result of an import operation.
type ImportResult struct {
	Databases           []DatabaseImportResult `json:"databases"`
	DocumentsInserted   int64                  `json:"documentsInserted"`
	DocumentsSkipped    int64                  `json:"documentsSkipped"`
	DocumentsParseError int64                  `json:"documentsParseError,omitempty"` // Docs that failed to parse
	DocumentsDropped    int64                  `json:"documentsDropped,omitempty"`    // For dry-run override: docs that will be dropped
	Errors              []string               `json:"errors"`
}

// ImportErrorResult contains partial results and error details when an import fails.
type ImportErrorResult struct {
	Error              string       `json:"error"`                        // The error message
	PartialResult      ImportResult `json:"partialResult"`                // What was imported before failure
	FailedDatabase     string       `json:"failedDatabase,omitempty"`     // Database where failure occurred
	FailedCollection   string       `json:"failedCollection,omitempty"`   // Collection where failure occurred
	RemainingDatabases []string     `json:"remainingDatabases,omitempty"` // Databases that weren't attempted
}

// ExportManifest contains metadata about an exported archive.
type ExportManifest struct {
	Version    string                   `json:"version"`
	ExportedAt time.Time                `json:"exportedAt"`
	Databases  []ExportManifestDatabase `json:"databases"`
}

// ExportManifestDatabase contains info about an exported database.
type ExportManifestDatabase struct {
	Name        string                     `json:"name"`
	Collections []ExportManifestCollection `json:"collections"`
}

// ExportManifestCollection contains info about an exported collection.
type ExportManifestCollection struct {
	Name       string `json:"name"`
	DocCount   int64  `json:"docCount"`
	IndexCount int    `json:"indexCount"`
}

// CollectionsImportPreview contains info about an export file for collection import.
type CollectionsImportPreview struct {
	FilePath   string                             `json:"filePath"`
	ExportedAt string                             `json:"exportedAt"`
	Databases  []CollectionsImportPreviewDatabase `json:"databases"`
}

// CollectionsImportPreviewDatabase describes a database in the export file.
type CollectionsImportPreviewDatabase struct {
	Name        string                         `json:"name"`
	Collections []CollectionsImportPreviewItem `json:"collections"`
}

// CollectionsImportPreviewItem describes a collection in the export file.
type CollectionsImportPreviewItem struct {
	Name     string `json:"name"`
	DocCount int64  `json:"docCount"`
}

// =============================================================================
// CSV Export Types
// =============================================================================

// CSVExportOptions specifies options for CSV export.
type CSVExportOptions struct {
	Delimiter      string `json:"delimiter"`      // Field delimiter, defaults to comma
	IncludeHeaders bool   `json:"includeHeaders"` // Whether to include column headers
	FlattenArrays  bool   `json:"flattenArrays"`  // If true, join arrays with semicolon; if false, create JSON representation
	Filter         string `json:"filter"`         // Optional query filter in Extended JSON format
}

// =============================================================================
// Script Execution Types
// =============================================================================

// ScriptResult represents the result of executing a MongoDB shell script.
type ScriptResult struct {
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
	ExitCode int    `json:"exitCode"`
}
