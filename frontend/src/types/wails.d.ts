/**
 * Global type declarations for Wails runtime bindings.
 * This file provides type safety for window.go bindings.
 *
 * Methods are based on the auto-generated wailsjs/go/main/App.d.ts
 * and additional runtime methods used by the application.
 */

import { main } from '../../wailsjs/go/models'
import type { TestConnectionResult } from '../components/connection-form/ConnectionFormTypes'

/**
 * Wails App bindings - all methods exposed from the Go backend
 */
export interface WailsAppBindings {
  // Connection methods
  Connect(connectionId: string): Promise<void>
  Disconnect(connectionId: string): Promise<void>
  DisconnectAll(): Promise<void>
  TestConnection(uri: string, connID: string): Promise<TestConnectionResult>

  // Saved connections
  ListSavedConnections(): Promise<main.SavedConnection[]>
  DeleteSavedConnection(connectionId: string): Promise<void>
  DuplicateConnection(connectionId: string, newName: string): Promise<main.SavedConnection>
  ConnectionFromURI(uri: string): Promise<main.SavedConnection>
  ConnectionToURI(connectionId: string): Promise<string>
  MoveConnectionToFolder(connectionId: string, folderId: string): Promise<void>

  // Extended connections (F074)
  GetExtendedConnection(connectionId: string): Promise<main.ExtendedConnection>
  SaveExtendedConnection(connection: main.ExtendedConnection): Promise<void>

  // Encrypted connection sharing
  ExportEncryptedConnection(connectionId: string): Promise<ConnectionShareResult>
  ExportEncryptedConnectionFromForm(formDataJSON: string): Promise<ConnectionShareResult>
  ExportEncryptedConnections(connectionIds: string[]): Promise<BulkConnectionShareResult>
  DecryptConnectionImport(bundleJSON: string, key: string): Promise<string>

  // Folder methods
  ListFolders(): Promise<main.Folder[]>
  CreateFolder(name: string, parentId: string): Promise<main.Folder>
  UpdateFolder(folderId: string, name: string, parentId: string): Promise<void>
  DeleteFolder(folderId: string): Promise<void>

  // Database methods
  ListDatabases(connectionId: string): Promise<main.DatabaseInfo[]>
  ListCollections(connectionId: string, database: string): Promise<main.CollectionInfo[]>
  DropDatabase(connectionId: string, database: string): Promise<void>
  DropCollection(connectionId: string, database: string, collection: string): Promise<void>
  ClearCollection(connectionId: string, database: string, collection: string): Promise<void>

  // Document methods
  FindDocuments(
    connectionId: string,
    database: string,
    collection: string,
    query: string,
    options: main.QueryOptions
  ): Promise<main.QueryResult>
  GetDocument(connectionId: string, database: string, collection: string, documentId: string): Promise<string>
  InsertDocument(connectionId: string, database: string, collection: string, document: string): Promise<string>
  UpdateDocument(
    connectionId: string,
    database: string,
    collection: string,
    documentId: string,
    document: string
  ): Promise<void>
  DeleteDocument(connectionId: string, database: string, collection: string, documentId: string): Promise<void>

  // Index methods
  ListIndexes(connectionId: string, database: string, collection: string): Promise<main.IndexInfo[]>
  CreateIndex?(
    connectionId: string,
    database: string,
    collection: string,
    keys: Record<string, number>,
    options: CreateIndexOptions
  ): Promise<void>
  DropIndex?(
    connectionId: string,
    database: string,
    collection: string,
    indexName: string
  ): Promise<void>

  // Validation
  ValidateJSON(json: string): Promise<void>

  // OS Authentication for password reveal
  AuthenticateForPasswordReveal(): Promise<void>
  IsAuthenticatedForPasswordReveal(): Promise<boolean>

  // Debug
  SetDebugEnabled?(enabled: boolean): void

  // Schema methods (may be added via backend)
  InferCollectionSchema?(
    connectionId: string,
    database: string,
    collection: string,
    sampleSize: number
  ): Promise<SchemaResult>
  ExportSchemaAsJSON?(content: string, filename: string): Promise<void>

  // Export methods (may be added via backend)
  ExportCollectionAsCSV?(
    connectionId: string,
    database: string,
    collection: string,
    query: string,
    fields: string[],
    filePath: string
  ): Promise<void>
  CancelExport?(exportId: string): Promise<void>

  // Saved queries methods (may be added via backend)
  ListSavedQueries?(connectionId: string, database: string, collection: string): Promise<SavedQuery[]>
  SaveQuery?(query: SavedQueryInput): Promise<SavedQuery>
  DeleteSavedQuery?(queryId: string): Promise<void>
  UpdateSavedQuery?(query: SavedQueryInput): Promise<SavedQuery>

  // Favorites methods (may be added via backend)
  GetFavorites?(): Promise<string[]>
  AddFavorite?(connectionId: string, database: string, collection: string): Promise<void>
  RemoveFavorite?(connectionId: string, database: string, collection: string): Promise<void>
  IsFavorite?(path: string): Promise<boolean>
  ListFavorites?(): Promise<string[]>
  ListDatabaseFavorites?(): Promise<string[]>
  AddDatabaseFavorite?(connectionId: string, database: string): Promise<void>
  RemoveDatabaseFavorite?(connectionId: string, database: string): Promise<void>

  // Database tracking methods
  UpdateDatabaseAccessed?(connectionId: string, database: string): Promise<void>

  // Aggregation methods (may be added via backend)
  RunAggregation?(
    connectionId: string,
    database: string,
    collection: string,
    pipeline: string
  ): Promise<AggregationResult>
  ExplainAggregation?(
    connectionId: string,
    database: string,
    collection: string,
    pipeline: string
  ): Promise<ExplainResult>

  // Query explain methods
  ExplainQuery?(
    connectionId: string,
    database: string,
    collection: string,
    query: string
  ): Promise<ExplainResult>

  // Script execution methods (mongosh)
  ExecuteScriptWithDatabase?(
    connectionId: string,
    database: string,
    script: string
  ): Promise<ScriptExecutionResult>
  CheckMongoshAvailable?(): Promise<[boolean, string]>

  // Document export methods
  ExportDocumentsAsZip?(
    entries: ExportEntry[],
    filename: string
  ): Promise<void>
}

/**
 * Schema inference result
 */
export interface SchemaResult {
  fields: SchemaField[]
  documentCount: number
  sampleSize: number
}

export interface SchemaField {
  path: string
  types: TypeInfo[]
  frequency: number
  nullable: boolean
}

export interface TypeInfo {
  type: string
  count: number
  percentage: number
}

/**
 * Saved query types
 */
export interface SavedQuery {
  id: string
  name: string
  description?: string
  connectionId: string
  database: string
  collection: string
  query: string
  createdAt: string
  updatedAt: string
}

export interface SavedQueryInput {
  id?: string
  name: string
  description?: string
  connectionId: string
  database: string
  collection: string
  query: string
}

/**
 * Aggregation result types
 */
export interface AggregationResult {
  documents: string[]
  executionTimeMs: number
}

/**
 * Query/Aggregation explain result
 */
export interface ExplainResult {
  winningPlan: string
  indexUsed: string
  isCollectionScan: boolean
  rawExplain: string
  executionStats?: ExecutionStats
}

export interface ExecutionStats {
  executionTimeMs: number
  totalDocsExamined: number
  totalKeysExamined: number
  nReturned: number
}

/**
 * Index creation options
 */
export interface CreateIndexOptions {
  unique: boolean
  sparse: boolean
  background: boolean
  name: string
  expireAfterSeconds: number
}

/**
 * Script execution result from Go backend (mongosh)
 */
export interface ScriptExecutionResult {
  output: string
  exitCode: number
  error?: string
}

/**
 * Document entry for export
 */
export interface ExportEntry {
  database: string
  collection: string
  docId: string
  json: string
}

/**
 * Encrypted connection sharing result
 */
export interface ConnectionShareResult {
  bundle: string
  key: string
}

export interface BulkConnectionShareResult {
  version: number
  connections: Array<{ name: string; bundle: string }>
  key: string
}

/**
 * Wails main module structure
 */
export interface WailsMainModule {
  App?: WailsAppBindings
}

/**
 * Wails Go bindings structure
 */
export interface WailsGoBindings {
  main?: WailsMainModule
}

/**
 * Extend the Window interface to include Wails bindings
 */
declare global {
  interface Window {
    go?: WailsGoBindings
  }
}

export {}
