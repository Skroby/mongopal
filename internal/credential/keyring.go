// Package credential handles password storage and URI credential management.
package credential

import (
	"github.com/zalando/go-keyring"
)

const keyringService = "mongopal"

// Service handles password storage in the OS keyring.
type Service struct{}

// NewService creates a new credential service.
func NewService() *Service {
	return &Service{}
}

// SetPassword stores a password in the OS keyring.
func (s *Service) SetPassword(connID, password string) error {
	if password == "" {
		// Delete any existing password
		_ = keyring.Delete(keyringService, connID)
		return nil
	}
	return keyring.Set(keyringService, connID, password)
}

// GetPassword retrieves a password from the OS keyring.
func (s *Service) GetPassword(connID string) (string, error) {
	password, err := keyring.Get(keyringService, connID)
	if err == keyring.ErrNotFound {
		return "", nil
	}
	return password, err
}

// DeletePassword removes a password from the OS keyring.
func (s *Service) DeletePassword(connID string) error {
	err := keyring.Delete(keyringService, connID)
	if err == keyring.ErrNotFound {
		return nil
	}
	return err
}
