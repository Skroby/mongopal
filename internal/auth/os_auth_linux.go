//go:build linux
// +build linux

package auth

import (
	"fmt"
	"os/exec"
)

// linuxAuthenticator uses pkexec or zenity for authentication on Linux.
type linuxAuthenticator struct {
	method string // "pkexec" or "zenity"
}

func newPlatformAuthenticator() Authenticator {
	auth := &linuxAuthenticator{}

	// Check which authentication method is available
	if _, err := exec.LookPath("pkexec"); err == nil {
		auth.method = "pkexec"
	} else if _, err := exec.LookPath("zenity"); err == nil {
		auth.method = "zenity"
	}

	return auth
}

// Authenticate prompts for password on Linux.
func (a *linuxAuthenticator) Authenticate(reason string) error {
	switch a.method {
	case "pkexec":
		return a.authenticateWithPkexec(reason)
	case "zenity":
		return a.authenticateWithZenity(reason)
	default:
		return fmt.Errorf("no authentication method available")
	}
}

// authenticateWithPkexec uses polkit for authentication.
func (a *linuxAuthenticator) authenticateWithPkexec(reason string) error {
	// Use pkexec to run a simple command that requires authentication
	cmd := exec.Command("pkexec", "echo", "Authentication successful")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pkexec authentication failed: %w", err)
	}
	return nil
}

// authenticateWithZenity shows a password dialog using zenity.
func (a *linuxAuthenticator) authenticateWithZenity(reason string) error {
	cmd := exec.Command("zenity", "--password", "--title=MongoPal Authentication", fmt.Sprintf("--text=%s", reason))
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("zenity authentication failed: %w", err)
	}

	// If we got here and output is not empty, user authenticated
	if len(output) == 0 {
		return fmt.Errorf("authentication cancelled")
	}

	return nil
}

// IsAvailable returns true if any authentication method is available.
func (a *linuxAuthenticator) IsAvailable() bool {
	return a.method != ""
}
