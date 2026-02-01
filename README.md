# MongoPal

A lightweight, cross-platform MongoDB GUI for exploring, viewing, and editing documents.

## Features

- Connect to MongoDB instances via connection URI
- Browse databases and collections in tree view
- View documents in Table or JSON format with pagination
- Edit documents with Monaco editor (syntax highlighting, formatting)
- Insert new documents with JSON validation
- Bulk operations (select, delete multiple documents)
- Collection schema analysis with field type distribution
- Export/import databases and collections (JSON format)
- Query filtering and sorting with mongosh script support
- Secure credential storage (OS keyring with encrypted fallback)
- Multi-tab interface with pinning, renaming, drag-reorder
- Dark theme optimized for extended use

## Technology Stack

- **Backend**: Go 1.24+
- **MongoDB Driver**: mongo-go-driver
- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Desktop Framework**: Wails v2

## Prerequisites

- Go 1.24 or later
- Node.js 18 or later
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

## Development

### Install dependencies

```bash
make install
```

### Run in development mode

```bash
make dev
```

This starts the app with hot reload enabled for both Go and React.

### Build for production

```bash
make build
```

The binary will be created in `build/bin/`.

### Build for specific platforms

```bash
# macOS universal binary
make build-darwin

# Windows
make build-windows

# Linux
make build-linux
```

## Project Structure

```
mongopal/
├── main.go                 # Entry point, Wails app setup
├── app.go                  # Thin facade for Wails bindings
├── app_test.go             # Backend unit tests
├── integration_test.go     # Integration tests (requires Docker)
├── wails.json              # Wails configuration
├── Makefile                # Build automation
│
├── internal/               # Backend packages
│   ├── core/               # App state and event emitter
│   ├── types/              # Shared type definitions
│   ├── credential/         # Password/keyring management
│   ├── storage/            # Config file I/O, connections
│   ├── connection/         # Connect, Disconnect, TestConnection
│   ├── database/           # List databases/collections, drop ops
│   ├── document/           # Document CRUD operations
│   ├── schema/             # Schema inference and export
│   ├── export/             # Database/collection export
│   ├── importer/           # Database/collection import
│   └── script/             # Mongosh script execution
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Root component with state management
│   │   ├── components/     # React components
│   │   │   ├── Sidebar.jsx           # Database/collection tree
│   │   │   ├── CollectionView.jsx    # Document list with filters
│   │   │   ├── DocumentEditView.jsx  # Monaco editor
│   │   │   ├── SchemaView.jsx        # Collection schema analysis
│   │   │   ├── Import/ExportModals   # Data transfer
│   │   │   └── ...
│   │   └── utils/          # Query parsing, schema utils
│   └── ...
│
├── .claude/                # Claude Code configuration
│   ├── rules/              # Project context
│   └── skills/             # Custom skills (pr-summary)
│
└── build/
    └── bin/                # Built binaries
```

## Testing

### Run all tests
```bash
make test
```

### Frontend tests only
```bash
make test-frontend
# or watch mode
cd frontend && npm run test:watch
```

### Backend tests only
```bash
make test-go
```

### Integration tests (requires Docker)
```bash
make test-integration
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+S` | Save document |
| `Cmd+Enter` | Execute query |
| `Escape` | Close panel / cancel edit |

## Documentation

For detailed project context and architecture, see `.claude/rules/mongopal-context.md`.

> **Maintenance**: Update this file AND `.claude/rules/mongopal-context.md` when codebase structure changes.

## License

MIT
