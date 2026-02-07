//go:build darwin
// +build darwin

package auth

import (
	"fmt"
	"os/exec"
)

// macOSAuthenticator uses macOS security framework for authentication.
type macOSAuthenticator struct{}

func newPlatformAuthenticator() Authenticator {
	return &macOSAuthenticator{}
}

// Authenticate prompts for TouchID or password on macOS.
func (a *macOSAuthenticator) Authenticate(reason string) error {
	// Use osascript to trigger authentication dialog
	// This will use TouchID if available, otherwise password
	script := fmt.Sprintf(`
		do shell script "echo 'Authentication successful'" with administrator privileges with prompt "%s"
	`, reason)

	cmd := exec.Command("osascript", "-e", script)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("macOS authentication failed: %w", err)
	}

	return nil
}

// IsAvailable always returns true on macOS as osascript is always available.
func (a *macOSAuthenticator) IsAvailable() bool {
	return true
}
