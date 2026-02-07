# Password Reveal with OS Authentication

## Overview

Password fields in MongoPal can now be revealed, but only after OS-level authentication (TouchID on macOS, Windows Hello, or system password). This provides defense-in-depth security for stored credentials.

## Features

### 1. **OS-Level Authentication**
- **macOS**: Uses `osascript` to trigger authentication dialog (TouchID if available, password otherwise)
- **Windows**: Uses Windows credential manager (`CredUI`) for authentication
- **Linux**: Uses `pkexec` (polkit) or `zenity` for password dialogs

### 2. **Grace Period**
- After successful authentication, passwords can be revealed for **1 minute** without re-authenticating
- Grace period tracks time since last authentication
- Prevents repeated authentication prompts while still maintaining security

### 3. **Auto-Hide**
- Revealed passwords automatically hide after **30 seconds**
- User can manually hide by clicking the eye icon again

### 4. **Password Fields Protected**
All sensitive credential fields now use the `PasswordField` component:
- MongoDB password
- SSH password
- SSH key passphrase
- SOCKS5 proxy password
- TLS client key password

## Backend Architecture

### `internal/auth/os_auth.go`
Core authentication service with grace period tracking:
```go
type Service struct {
    lastAuthTime    time.Time
    gracePeriod     time.Duration  // 1 minute
    authenticator   Authenticator
    isAuthenticated bool
}
```

### Platform-Specific Authenticators
- `os_auth_darwin.go` - macOS TouchID/password via osascript
- `os_auth_windows.go` - Windows Hello/credentials via CredUI API
- `os_auth_linux.go` - pkexec or zenity dialogs

### App Methods (Wails Bindings)
```go
func (a *App) AuthenticateForPasswordReveal() error
func (a *App) IsAuthenticatedForPasswordReveal() bool
func (a *App) GetAuthGracePeriodRemaining() int
func (a *App) InvalidatePasswordAuth()
```

## Frontend Architecture

### `PasswordField.tsx`
Reusable component that wraps password inputs with reveal functionality:

```typescript
<PasswordField
  value={password}
  onChange={setPassword}
  className="..."
  placeholder="••••••••"
/>
```

**Features**:
- Eye icon button for reveal/hide
- Triggers OS authentication on first reveal
- Shows loading state during authentication
- Auto-hides after 30 seconds
- Disabled when value is empty

### Authentication Flow

1. User clicks eye icon
2. Check if authenticated: `IsAuthenticatedForPasswordReveal()`
3. If not authenticated, prompt: `AuthenticateForPasswordReveal()`
4. On success, reveal password (change input type to `text`)
5. After 30 seconds, auto-hide
6. Within 1-minute grace period, skip step 3

## Security Considerations

### Why This Matters
- **Defense in depth**: Even if someone has physical access to an unlocked computer, they need to authenticate to see passwords
- **Audit trail**: OS authentication provides system-level logging of access attempts
- **OS security model**: Leverages existing OS security features (TouchID, Windows Hello, etc.)

### What's Protected
- ✅ Passwords in connection form (creation/editing)
- ✅ All SSH/TLS/proxy credentials
- ✅ Credentials remain encrypted at rest
- ❌ Passwords during connection (not revealed in UI after saving)

### Grace Period Rationale
- **1 minute** is long enough to edit multiple connections without annoyance
- Short enough to require re-auth if user walks away from computer
- Can be adjusted by changing `auth.NewService(1 * time.Minute)` in `app.go`

## Testing

### Backend Tests
```bash
go test ./internal/auth/...
```

Tests authentication service logic, grace period tracking, and platform availability checks.

### Frontend Tests
```bash
npm test -- PasswordField.test.tsx
```

Tests:
- Password hidden by default
- Reveal triggers authentication
- Grace period skips re-authentication
- Auto-hide after successful reveal
- Manual hide/show toggle
- Disabled when empty

## Future Enhancements

1. **Export with authentication** - Require OS auth before exporting connections with credentials
2. **View saved passwords** - Add UI to view/copy saved passwords (with auth)
3. **Configurable grace period** - Let users adjust grace period in settings
4. **Biometric preference** - Allow users to disable biometrics and force password
5. **Audit log** - Track when credentials were revealed (with timestamps)

## Implementation Notes

### Why Not Store in OS Keyring?
We already use OS keyring for encryption keys. This feature adds an additional authentication layer for *revealing* passwords in the UI.

### Why Not Use LocalAuthentication Framework Directly?
Using `osascript` on macOS is simpler and doesn't require cgo, making builds easier. For production apps with code signing, could switch to LocalAuthentication framework for better UI.

### Windows Implementation
The Windows implementation uses CredUI which is available on all Windows versions. For Windows 10+, could enhance to use Windows Hello API directly for better biometric support.
