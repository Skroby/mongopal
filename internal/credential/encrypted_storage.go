package credential

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

const (
	encryptionKeyringService = "mongopal"
	encryptionKeyPrefix      = "mongopal-key-"
	encryptedFileExt         = ".encrypted"
)

// EncryptedStorage handles AES-256-GCM encryption/decryption with OS keyring keys.
type EncryptedStorage struct {
	storageDir string
}

// NewEncryptedStorage creates a new encrypted storage instance.
// storageDir is the directory where encrypted files will be stored.
func NewEncryptedStorage(storageDir string) (*EncryptedStorage, error) {
	// Ensure storage directory exists with restrictive permissions
	if err := os.MkdirAll(storageDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create storage directory: %w", err)
	}

	return &EncryptedStorage{
		storageDir: storageDir,
	}, nil
}

// getOrCreateEncryptionKey retrieves or creates a 32-byte AES-256 key from OS keyring.
func (s *EncryptedStorage) getOrCreateEncryptionKey(connID string) ([]byte, error) {
	keyName := encryptionKeyPrefix + connID

	// Try to retrieve existing key
	keyStr, err := keyring.Get(encryptionKeyringService, keyName)
	if err == nil {
		// Key exists, decode from hex
		key := []byte(keyStr)
		if len(key) != 32 {
			// Invalid key length, regenerate
			return s.createNewKey(keyName)
		}
		return key, nil
	}

	// Key doesn't exist (or keyring unavailable), create new one
	if err == keyring.ErrNotFound {
		return s.createNewKey(keyName)
	}

	// Keyring error - still create key but warn
	key, _ := s.createNewKey(keyName)
	return key, fmt.Errorf("keyring unavailable: %w", err)
}

// createNewKey generates a new 32-byte random key and stores it in keyring.
func (s *EncryptedStorage) createNewKey(keyName string) ([]byte, error) {
	key := make([]byte, 32) // AES-256 requires 32-byte key
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}

	// Store in keyring (best effort - may fail on some platforms)
	if err := keyring.Set(encryptionKeyringService, keyName, string(key)); err != nil {
		// Don't fail if keyring unavailable - key will be regenerated on each load
		// This means encrypted files won't be portable, but better than no encryption
		return key, fmt.Errorf("keyring unavailable (encryption key not persistent): %w", err)
	}

	return key, nil
}

// deleteEncryptionKey removes the encryption key from OS keyring.
func (s *EncryptedStorage) deleteEncryptionKey(connID string) error {
	keyName := encryptionKeyPrefix + connID
	err := keyring.Delete(encryptionKeyringService, keyName)
	if err == keyring.ErrNotFound {
		return nil // Already gone
	}
	return err
}

// encryptData encrypts data using AES-256-GCM with the connection's key.
func (s *EncryptedStorage) encryptData(connID string, data []byte) ([]byte, error) {
	key, err := s.getOrCreateEncryptionKey(connID)
	if err != nil {
		// Log warning but continue - encryption will work, just not persistent across restarts
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt and prepend nonce (nonce is not secret)
	ciphertext := gcm.Seal(nonce, nonce, data, nil)
	return ciphertext, nil
}

// decryptData decrypts data using AES-256-GCM with the connection's key.
func (s *EncryptedStorage) decryptData(connID string, encryptedData []byte) ([]byte, error) {
	key, err := s.getOrCreateEncryptionKey(connID)
	if err != nil {
		return nil, fmt.Errorf("failed to get encryption key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(encryptedData) < nonceSize {
		return nil, fmt.Errorf("corrupted encrypted data: too short")
	}

	// Extract nonce and ciphertext
	nonce, ciphertext := encryptedData[:nonceSize], encryptedData[nonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt data (wrong key or corrupted file): %w", err)
	}

	return plaintext, nil
}

// filePath returns the path to the encrypted file for a connection.
func (s *EncryptedStorage) filePath(connID string) string {
	return filepath.Join(s.storageDir, connID+encryptedFileExt)
}

// SaveConnection encrypts and saves connection data to disk.
func (s *EncryptedStorage) SaveConnection(connID string, data interface{}) error {
	// Marshal to JSON
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal connection data: %w", err)
	}

	// Encrypt
	encryptedData, err := s.encryptData(connID, jsonData)
	if err != nil {
		return fmt.Errorf("failed to encrypt connection data: %w", err)
	}

	// Write to file with restrictive permissions
	filePath := s.filePath(connID)
	if err := os.WriteFile(filePath, encryptedData, 0600); err != nil {
		return fmt.Errorf("failed to write encrypted file: %w", err)
	}

	return nil
}

// LoadConnection loads and decrypts connection data from disk.
func (s *EncryptedStorage) LoadConnection(connID string, dest interface{}) error {
	filePath := s.filePath(connID)

	// Read encrypted file
	encryptedData, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("connection not found: %s", connID)
		}
		return fmt.Errorf("failed to read encrypted file: %w", err)
	}

	// Decrypt
	plaintext, err := s.decryptData(connID, encryptedData)
	if err != nil {
		return fmt.Errorf("failed to decrypt connection data: %w", err)
	}

	// Unmarshal
	if err := json.Unmarshal(plaintext, dest); err != nil {
		return fmt.Errorf("failed to unmarshal connection data: %w", err)
	}

	return nil
}

// DeleteConnection removes an encrypted connection file and its key from keyring.
func (s *EncryptedStorage) DeleteConnection(connID string) error {
	// Delete encryption key from keyring
	if err := s.deleteEncryptionKey(connID); err != nil {
		// Log warning but continue with file deletion
	}

	// Delete encrypted file
	filePath := s.filePath(connID)
	err := os.Remove(filePath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete encrypted file: %w", err)
	}

	return nil
}

// ListConnectionIDs returns all connection IDs with encrypted files.
func (s *EncryptedStorage) ListConnectionIDs() ([]string, error) {
	entries, err := os.ReadDir(s.storageDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, fmt.Errorf("failed to read storage directory: %w", err)
	}

	var connIDs []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if filepath.Ext(name) == encryptedFileExt {
			connID := name[:len(name)-len(encryptedFileExt)]
			connIDs = append(connIDs, connID)
		}
	}

	return connIDs, nil
}

// ConnectionExists checks if an encrypted file exists for a connection.
func (s *EncryptedStorage) ConnectionExists(connID string) bool {
	filePath := s.filePath(connID)
	_, err := os.Stat(filePath)
	return err == nil
}
