# MongoPal

A lightweight, cross-platform MongoDB GUI for exploring, viewing, and editing documents.

## Features

- Connect to MongoDB instances via connection URI
- Browse databases and collections
- View documents in Table, Tree, or JSON format
- Edit documents with syntax highlighting
- Secure credential storage (OS keyring with encrypted fallback)
- Dark theme optimized for extended use

## Technology Stack

- **Backend**: Go 1.22+
- **MongoDB Driver**: mongo-go-driver
- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Desktop Framework**: Wails v2

## Prerequisites

- Go 1.22 or later
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
├── app.go                  # All backend methods
├── wails.json              # Wails configuration
├── Makefile                # Build automation
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Root component
│   │   └── components/     # UI components
│   └── ...
│
└── build/
    └── appicon.png         # App icon
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+S` | Save document |
| `Cmd+Enter` | Execute query |
| `Escape` | Close panel / cancel edit |

## License

MIT
