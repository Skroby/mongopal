// Package auth provides OS-level authentication for revealing sensitive credentials.
package auth

import (
	"fmt"
	"sync"
	"time"
)

// Service handles OS-level authentication for revealing passwords.
type Service struct {
	mu                sync.RWMutex
	lastAuthTime      time.Time
	gracePeriod       time.Duration
	authenticator     Authenticator
	isAuthenticated   bool
}

// Authenticator is the interface for OS-specific authentication.
type Authenticator interface {
	// Authenticate prompts the user for OS-level authentication (TouchID, Windows Hello, etc.)
	// reason is shown to the user explaining why authentication is needed.
	Authenticate(reason string) error
	// IsAvailable returns true if OS authentication is available on this system.
	IsAvailable() bool
}

// NewService creates a new authentication service with the given grace period.
func NewService(gracePeriod time.Duration) *Service {
	return &Service{
		gracePeriod:   gracePeriod,
		authenticator: newPlatformAuthenticator(),
	}
}

// Authenticate prompts the user for OS authentication if outside grace period.
// Returns nil if already authenticated within grace period or authentication succeeds.
func (s *Service) Authenticate(reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if still within grace period
	if s.isAuthenticated && time.Since(s.lastAuthTime) < s.gracePeriod {
		return nil
	}

	// Check if OS authentication is available
	if !s.authenticator.IsAvailable() {
		return fmt.Errorf("OS authentication not available on this system")
	}

	// Prompt for authentication
	if err := s.authenticator.Authenticate(reason); err != nil {
		s.isAuthenticated = false
		return fmt.Errorf("authentication failed: %w", err)
	}

	// Authentication successful - update grace period
	s.lastAuthTime = time.Now()
	s.isAuthenticated = true
	return nil
}

// IsAuthenticated returns true if the user is authenticated and within grace period.
func (s *Service) IsAuthenticated() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if !s.isAuthenticated {
		return false
	}

	return time.Since(s.lastAuthTime) < s.gracePeriod
}

// InvalidateAuth clears the authentication state, requiring re-authentication.
func (s *Service) InvalidateAuth() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.isAuthenticated = false
	s.lastAuthTime = time.Time{}
}

// GracePeriodRemaining returns the time remaining in the grace period.
// Returns 0 if not authenticated or grace period expired.
func (s *Service) GracePeriodRemaining() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if !s.isAuthenticated {
		return 0
	}

	remaining := s.gracePeriod - time.Since(s.lastAuthTime)
	if remaining < 0 {
		return 0
	}
	return remaining
}
