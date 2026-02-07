//go:build windows
// +build windows

package auth

import (
	"fmt"
	"syscall"
	"unsafe"
)

// windowsAuthenticator uses Windows credential manager for authentication.
type windowsAuthenticator struct{}

func newPlatformAuthenticator() Authenticator {
	return &windowsAuthenticator{}
}

var (
	credui                  = syscall.NewLazyDLL("credui.dll")
	procCredUIPromptForCred = credui.NewProc("CredUIPromptForCredentialsW")
)

// Authenticate prompts for Windows credentials or biometrics.
func (a *windowsAuthenticator) Authenticate(reason string) error {
	// Use CredUIPromptForCredentials to show authentication dialog
	// This will use Windows Hello if configured, otherwise password

	// For now, use a simple approach with PowerShell
	// In production, should use proper Windows Hello API
	reasonUTF16, err := syscall.UTF16PtrFromString(reason)
	if err != nil {
		return fmt.Errorf("failed to convert reason: %w", err)
	}

	captionUTF16, err := syscall.UTF16PtrFromString("MongoPal Authentication")
	if err != nil {
		return fmt.Errorf("failed to convert caption: %w", err)
	}

	messageUTF16, err := syscall.UTF16PtrFromString(reason)
	if err != nil {
		return fmt.Errorf("failed to convert message: %w", err)
	}

	// Simple credential prompt structure
	type credUIInfo struct {
		cbSize         uint32
		hwndParent     uintptr
		pszMessageText *uint16
		pszCaptionText *uint16
		hbmBanner      uintptr
	}

	info := credUIInfo{
		cbSize:         uint32(unsafe.Sizeof(credUIInfo{})),
		hwndParent:     0,
		pszMessageText: messageUTF16,
		pszCaptionText: captionUTF16,
		hbmBanner:      0,
	}

	userBuf := make([]uint16, 256)
	passBuf := make([]uint16, 256)

	ret, _, _ := procCredUIPromptForCred.Call(
		uintptr(unsafe.Pointer(&info)),
		uintptr(unsafe.Pointer(reasonUTF16)),
		0, // Reserved
		0, // Error code
		uintptr(unsafe.Pointer(&userBuf[0])),
		uintptr(len(userBuf)),
		uintptr(unsafe.Pointer(&passBuf[0])),
		uintptr(len(passBuf)),
		0, // Save flag
		0, // Flags
	)

	if ret != 0 {
		return fmt.Errorf("Windows authentication failed: error code %d", ret)
	}

	return nil
}

// IsAvailable returns true if Windows authentication is available.
func (a *windowsAuthenticator) IsAvailable() bool {
	return true
}
