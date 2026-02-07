package credential

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// ConnectionShareBundle is the encrypted bundle format for sharing connections.
type ConnectionShareBundle struct {
	Version int    `json:"v"`
	App     string `json:"app"`
	Time    string `json:"ts"`
	Nonce   string `json:"nonce"`
	Data    string `json:"data"`
}

// EncryptForSharing encrypts arbitrary JSON data with a random AES-256-GCM key.
// Returns the JSON bundle and the base64url-encoded key.
func EncryptForSharing(data []byte) (string, string, error) {
	// Generate random 256-bit key
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", "", fmt.Errorf("failed to generate key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt
	ciphertext := gcm.Seal(nil, nonce, data, nil)

	// Build bundle
	bundle := ConnectionShareBundle{
		Version: 1,
		App:     "mongopal",
		Time:    time.Now().UTC().Format(time.RFC3339),
		Nonce:   base64.RawURLEncoding.EncodeToString(nonce),
		Data:    base64.RawURLEncoding.EncodeToString(ciphertext),
	}

	bundleJSON, err := json.Marshal(bundle)
	if err != nil {
		return "", "", fmt.Errorf("failed to marshal bundle: %w", err)
	}

	keyStr := base64.RawURLEncoding.EncodeToString(key)

	return string(bundleJSON), keyStr, nil
}

// EncryptForSharingWithKey encrypts data using a pre-existing AES-256 key (base64url-encoded).
// Use this when encrypting multiple items with the same key.
func EncryptForSharingWithKey(data []byte, keyStr string) (string, error) {
	key, err := base64.RawURLEncoding.DecodeString(keyStr)
	if err != nil {
		return "", fmt.Errorf("invalid key format: %w", err)
	}
	if len(key) != 32 {
		return "", fmt.Errorf("invalid key length: expected 32 bytes")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, data, nil)

	bundle := ConnectionShareBundle{
		Version: 1,
		App:     "mongopal",
		Time:    time.Now().UTC().Format(time.RFC3339),
		Nonce:   base64.RawURLEncoding.EncodeToString(nonce),
		Data:    base64.RawURLEncoding.EncodeToString(ciphertext),
	}

	bundleJSON, err := json.Marshal(bundle)
	if err != nil {
		return "", fmt.Errorf("failed to marshal bundle: %w", err)
	}

	return string(bundleJSON), nil
}

// GenerateSharingKey generates a random AES-256 key and returns it base64url-encoded.
func GenerateSharingKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate key: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(key), nil
}

// DecryptFromSharing decrypts a connection share bundle using the provided key.
// Returns the decrypted JSON data.
func DecryptFromSharing(bundleJSON string, keyStr string) ([]byte, error) {
	var bundle ConnectionShareBundle
	if err := json.Unmarshal([]byte(bundleJSON), &bundle); err != nil {
		return nil, fmt.Errorf("invalid bundle format: %w", err)
	}

	if bundle.App != "mongopal" {
		return nil, fmt.Errorf("not a MongoPal export bundle")
	}

	if bundle.Version != 1 {
		return nil, fmt.Errorf("unsupported bundle version %d (update MongoPal to import)", bundle.Version)
	}

	key, err := base64.RawURLEncoding.DecodeString(keyStr)
	if err != nil {
		return nil, fmt.Errorf("invalid decryption key format")
	}

	if len(key) != 32 {
		return nil, fmt.Errorf("invalid decryption key length")
	}

	nonce, err := base64.RawURLEncoding.DecodeString(bundle.Nonce)
	if err != nil {
		return nil, fmt.Errorf("corrupted bundle: invalid nonce")
	}

	ciphertext, err := base64.RawURLEncoding.DecodeString(bundle.Data)
	if err != nil {
		return nil, fmt.Errorf("corrupted bundle: invalid data")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed — check that the key and bundle are correct")
	}

	return plaintext, nil
}
