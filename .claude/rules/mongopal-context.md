# MongoPal Project Context

Lightweight, cross-platform MongoDB GUI for exploring, viewing, and editing documents. Go+React via Wails framework.

## Tech Stack
- **Desktop**: Wails v2
- **Backend**: Go 1.22+, mongo-go-driver
- **Frontend**: React 18, Vite, TailwindCSS
- **Credentials**: OS Keyring (go-keyring) with encrypted file fallback

## Quick File Reference

### Backend Core
| Purpose | File |
|---------|------|
| All Wails bindings + MongoDB ops | `app.go` |
| App entry point | `main.go` |
| Wails config | `wails.json` |

### Frontend Core
| Purpose | File |
|---------|------|
| App entry/state | `frontend/src/App.jsx` |
| Global styles | `frontend/src/index.css` |
| Tailwind config | `frontend/tailwind.config.js` |

### Components
| Purpose | File |
|---------|------|
| Left sidebar tree | `frontend/src/components/Sidebar.jsx` |
| Tab bar | `frontend/src/components/TabBar.jsx` |
| Collection data view | `frontend/src/components/CollectionView.jsx` |
| Document table | `frontend/src/components/TableView.jsx` |
| Document editor (Monaco) | `frontend/src/components/DocumentEditView.jsx` |
| Bulk action bar | `frontend/src/components/BulkActionBar.jsx` |
| Connection form modal | `frontend/src/components/ConnectionForm.jsx` |
| Notifications | `frontend/src/components/NotificationContext.jsx` |

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

## Build Commands
```bash
wails dev         # Development with hot-reload
wails build       # Build for current platform
make build        # Cross-platform builds (if Makefile exists)
```

## Adding Features

### New Backend Method
1. Add method to `App` struct in `app.go`
2. Run `wails generate module` to update bindings
3. Call via `window.go.main.App.MethodName()` in frontend

### New Component
1. Create in `frontend/src/components/`
2. Import and use in parent component
3. Follow existing patterns for state management (useState/useEffect)

## Code Style
- **Go**: Standard gofmt, error wrapping with `fmt.Errorf`
- **React**: Functional components with hooks, no class components
- **CSS**: TailwindCSS utilities, custom classes in `index.css`
- **Colors**: Dark theme with zinc palette, accent `#4CC38A`

> **Maintenance**: Update this file when codebase structure changes.
