// Package storage handles configuration file I/O operations.
package storage

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/peternagy/mongopal/internal/types"
)

// Service handles configuration file persistence.
type Service struct {
	configDir string
}

// NewService creates a new storage service.
func NewService(configDir string) *Service {
	return &Service{configDir: configDir}
}

// InitConfigDir sets up the config directory.
func InitConfigDir() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.Getenv("HOME")
	}
	dir := filepath.Join(configDir, "mongopal")
	os.MkdirAll(dir, 0700)
	return dir
}

// FoldersFile returns the path to the folders file.
func (s *Service) FoldersFile() string {
	return filepath.Join(s.configDir, "folders.json")
}

// LoadFolders loads folders from disk.
func (s *Service) LoadFolders() ([]types.Folder, error) {
	data, err := os.ReadFile(s.FoldersFile())
	if err != nil {
		if os.IsNotExist(err) {
			return []types.Folder{}, nil
		}
		return nil, err
	}
	var folders []types.Folder
	if err := json.Unmarshal(data, &folders); err != nil {
		return nil, err
	}
	return folders, nil
}

// PersistFolders saves folders to disk.
func (s *Service) PersistFolders(folders []types.Folder) error {
	data, err := json.MarshalIndent(folders, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.FoldersFile(), data, 0600)
}
