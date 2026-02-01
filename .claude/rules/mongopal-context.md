# MongoPal Project Context

Lightweight, cross-platform MongoDB GUI for exploring, viewing, and editing documents. Go+React via Wails framework.

> **IMPORTANT**: When modifying project structure, adding packages, or changing documentation, update BOTH this file AND `README.md` to keep them in sync.

## Tech Stack
- **Desktop**: Wails v2
- **Backend**: Go 1.24+, mongo-go-driver v1.17
- **Frontend**: React 18, Vite, TailwindCSS
- **Credentials**: OS Keyring (go-keyring) with encrypted file fallback
- **Testing**: Vitest (frontend), Go testing + testcontainers (backend)

## Quick File Reference

### Backend Core
| Purpose | File |
|---------|------|
| Thin facade for Wails bindings | `app.go` |
| App entry point | `main.go` |
| Wails config | `wails.json` |
| Unit tests | `app_test.go` |
| Integration tests (requires Docker) | `integration_test.go` |

### Internal Packages
| Package | Purpose | Key Files |
|---------|---------|-----------|
| `internal/types` | All shared type definitions | `types.go` |
| `internal/core` | App state and event emitter | `state.go`, `events.go` |
| `internal/credential` | Password/keyring management | `keyring.go`, `uri.go` |
| `internal/storage` | Config file I/O, connections, folders | `persistence.go`, `connections.go`, `folders.go` |
| `internal/connection` | Connect, Disconnect, TestConnection | `service.go` |
| `internal/database` | List databases/collections, drop operations | `listing.go`, `operations.go` |
| `internal/document` | Document CRUD operations | `crud.go`, `parser.go` |
| `internal/schema` | Schema inference and export | `inference.go`, `export.go` |
| `internal/export` | Database/collection export | `database.go`, `collection.go`, `documents.go` |
| `internal/importer` | Database/collection import | `database.go`, `collection.go`, `helpers.go` |
| `internal/script` | Mongosh script execution | `mongosh.go` |

### Frontend Core
| Purpose | File |
|---------|------|
| App entry/state | `frontend/src/App.jsx` |
| Global styles | `frontend/src/index.css` |
| Tailwind config | `frontend/tailwind.config.js` |

### Components
| Purpose | File |
|---------|------|
| Left sidebar tree (folders, connections) | `frontend/src/components/Sidebar.jsx` |
| Tab bar with drag-reorder | `frontend/src/components/TabBar.jsx` |
| Collection data view with filters | `frontend/src/components/CollectionView.jsx` |
| Document table display | `frontend/src/components/TableView.jsx` |
| Document editor (Monaco) | `frontend/src/components/DocumentEditView.jsx` |
| Collection schema analysis | `frontend/src/components/SchemaView.jsx` |
| Bulk action bar | `frontend/src/components/BulkActionBar.jsx` |
| Connection form modal | `frontend/src/components/ConnectionForm.jsx` |
| Application settings | `frontend/src/components/Settings.jsx` |
| Toast notifications + history | `frontend/src/components/NotificationContext.jsx` |
| Confirmation dialogs | `frontend/src/components/ConfirmDialog.jsx` |
| Error boundary wrapper | `frontend/src/components/ErrorBoundary.jsx` |
| Database export modal | `frontend/src/components/ExportDatabasesModal.jsx` |
| Database import modal | `frontend/src/components/ImportDatabasesModal.jsx` |
| Collection export modal | `frontend/src/components/ExportCollectionsModal.jsx` |
| Collection import modal | `frontend/src/components/ImportCollectionsModal.jsx` |
| Keyboard shortcuts modal | `frontend/src/components/KeyboardShortcuts.jsx` |
| Actionable error display | `frontend/src/components/ActionableError.jsx` |

### Contexts
| Purpose | File |
|---------|------|
| Connection state management | `frontend/src/components/contexts/ConnectionContext.jsx` |
| Tab state management | `frontend/src/components/contexts/TabContext.jsx` |
| Status bar state | `frontend/src/components/contexts/StatusContext.jsx` |
| Operation tracking (busy indicator) | `frontend/src/components/contexts/OperationContext.jsx` |

### Hooks
| Purpose | File |
|---------|------|
| ETA time remaining calculation | `frontend/src/hooks/useProgressETA.js` |

### Utilities
| Purpose | File |
|---------|------|
| MongoDB query parsing | `frontend/src/utils/queryParser.js` |
| Mongosh script parsing | `frontend/src/utils/mongoshParser.js` |
| Schema analysis helpers | `frontend/src/utils/schemaUtils.js` |
| Table formatting utils | `frontend/src/utils/tableViewUtils.js` |
| Error parsing for actionable hints | `frontend/src/utils/errorParser.js` |

## Key Patterns

### Document IDs
MongoDB documents can have various ID types. Handle them consistently:
- **ObjectId**: `{ "$oid": "507f1f77bcf86cd799439011" }`
- **Binary/UUID**: `{ "$binary": { "base64": "...", "subType": "03" } }`
- **UUID**: `{ "$uuid": "..." }`
- **String**: Plain string

Frontend passes Extended JSON for complex types; backend's `parseDocumentID()` handles conversion.

### Connection Credentials
- Passwords stored in OS keyring, keyed by connection ID
- URI stored without password in `~/.config/mongopal/connections.json`
- Password injected into URI at connection time

### BSON Extended JSON
All document data uses MongoDB Extended JSON format for round-trip fidelity:
- Dates: `{ "$date": "2023-01-01T00:00:00Z" }`
- Numbers: `{ "$numberLong": "123" }`, `{ "$numberInt": "42" }`
- Use `bson.MarshalExtJSON` / `bson.UnmarshalExtJSON` in Go

### Export/Import Operations
Both database-level and collection-level operations:
- **Export**: Creates JSON file with manifest metadata
- **Import**: Supports conflict resolution (skip/overwrite/reject), dry-run preview
- **Progress tracking**: Real-time events via Wails runtime for UI updates
- **Cancellation**: Long-running operations can be interrupted

### Schema Analysis
- Samples documents from collection (configurable count)
- Analyzes field distribution and types
- Identifies nested structures with frequency stats
- Exports schema as JSON

### Folder Organization
- Connections can be organized into nested folders
- Drag-and-drop to move connections/folders between folders
- Folder hierarchy stored in `~/.config/mongopal/folders.json`
- WebKit drag fix: State updates deferred via `setTimeout(0)` to prevent drag cancellation

### Keyboard Navigation
- Full keyboard navigation for sidebar tree (arrow keys, Home/End)
- Tab management (Cmd+W close, Cmd+Shift+[ ] switch tabs)
- Bulk action shortcuts (Cmd+A select all, Delete for selected)
- Query history dropdown (arrow keys, Enter to select)
- Escape closes modals and panels

### Notifications
- Toast stack limited to 4 visible with grouping
- Auto-dismiss pauses on hover
- Notification history drawer (persisted)
- Actionable error hints with recovery suggestions

## Build Commands
```bash
make dev              # Development with hot-reload
make build            # Build for current platform
make build-prod       # Production optimized build
make build-darwin     # macOS universal binary
make build-linux      # Linux amd64
make build-windows    # Windows amd64
make test             # Run all unit tests
make test-integration # Integration tests (requires Docker)
make generate         # Regenerate Wails bindings
make fmt              # Format code
make lint             # Lint code
```

## Adding Features

### New Backend Method
1. Implement logic in the appropriate `internal/` package
2. Add a delegation method to `App` struct in `app.go`
3. Run `make generate` to update bindings
4. Call via `window.go.main.App.MethodName()` in frontend

### New Type
1. Add type definition to `internal/types/types.go`
2. Add type re-export in `app.go` for Wails binding generation

### New Component
1. Create in `frontend/src/components/`
2. Import and use in parent component
3. Follow existing patterns for state management (useState/useEffect)

## Code Style
- **Go**: Standard gofmt, error wrapping with `fmt.Errorf`
- **React**: Functional components with hooks, no class components
- **CSS**: TailwindCSS utilities, custom classes in `index.css`
- **Colors**: Dark theme with zinc palette, accent `#4CC38A`

## Testing

### Frontend Tests
Run with `make test-frontend`:
- All utility functions have comprehensive test coverage
- Test files located alongside source: `*.test.js`
- Uses Vitest with jsdom environment
- Watch mode: `make test-watch`

### Backend Tests
Run with `make test-go`:
- Unit tests in `app_test.go` for URI parsing, document IDs
- Integration tests in `integration_test.go` require Docker (testcontainers)

### Integration Tests
Run with `make test-integration`:
- Full MongoDB operations against real container
- 5-minute timeout for longer operations
- Covers connection, CRUD, export/import flows

### All Tests
Run with `make test-all` for unit + integration tests.

## Backend Architecture

The backend uses a thin facade pattern:
- `app.go` contains the `App` struct which is the Wails binding surface
- All methods delegate to specialized services in `internal/` packages
- State is managed centrally via `internal/core/AppState`

### Method Categories (in App facade)
| Category | Methods | Internal Package |
|----------|---------|------------------|
| Connection | Connect, Disconnect, TestConnection | `internal/connection` |
| Storage | SaveConnection, ListSavedConnections, CreateFolder, etc. | `internal/storage` |
| Database | ListDatabases, ListCollections, DropDatabase, DropCollection | `internal/database` |
| Document | FindDocuments, GetDocument, InsertDocument, UpdateDocument, DeleteDocument | `internal/document` |
| Schema | InferCollectionSchema, ExportSchemaAsJSON | `internal/schema` |
| Export | ExportDatabases, ExportCollections, ExportDocumentsAsZip | `internal/export` |
| Import | ImportDatabases, ImportCollections, PreviewImportFile | `internal/importer` |
| Script | ExecuteScript, CheckMongoshAvailable | `internal/script` |

> **Maintenance**: Update this file AND `README.md` when codebase structure changes.
