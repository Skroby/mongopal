package storage

import (
	"github.com/google/uuid"
	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/types"
)

// FolderService handles folder CRUD operations.
type FolderService struct {
	state   *core.AppState
	storage *Service
}

// NewFolderService creates a new folder service.
func NewFolderService(state *core.AppState, storage *Service) *FolderService {
	return &FolderService{state: state, storage: storage}
}

// CreateFolder creates a new folder.
func (s *FolderService) CreateFolder(name, parentID string) (types.Folder, error) {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	folder := types.Folder{
		ID:       uuid.New().String(),
		Name:     name,
		ParentID: parentID,
	}

	s.state.Folders = append(s.state.Folders, folder)
	if err := s.storage.PersistFolders(s.state.Folders); err != nil {
		return types.Folder{}, err
	}

	return folder, nil
}

// DeleteFolder removes a folder and moves its connections to root.
// Returns the IDs of connections that were moved so the caller can sync encrypted storage.
func (s *FolderService) DeleteFolder(folderID string) ([]string, error) {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	// Find and remove folder
	found := false
	for i, f := range s.state.Folders {
		if f.ID == folderID {
			s.state.Folders = append(s.state.Folders[:i], s.state.Folders[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		return nil, &core.FolderNotFoundError{FolderID: folderID}
	}

	// Move connections in this folder to root, collecting affected IDs
	var movedConnIDs []string
	for i := range s.state.SavedConnections {
		if s.state.SavedConnections[i].FolderID == folderID {
			s.state.SavedConnections[i].FolderID = ""
			movedConnIDs = append(movedConnIDs, s.state.SavedConnections[i].ID)
		}
	}

	// Move child folders to root
	for i := range s.state.Folders {
		if s.state.Folders[i].ParentID == folderID {
			s.state.Folders[i].ParentID = ""
		}
	}

	return movedConnIDs, s.storage.PersistFolders(s.state.Folders)
}

// ListFolders returns all folders.
func (s *FolderService) ListFolders() ([]types.Folder, error) {
	s.state.Mu.RLock()
	defer s.state.Mu.RUnlock()

	result := make([]types.Folder, len(s.state.Folders))
	copy(result, s.state.Folders)
	return result, nil
}

// UpdateFolder updates a folder's name or parent.
func (s *FolderService) UpdateFolder(folderID, name, parentID string) error {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i := range s.state.Folders {
		if s.state.Folders[i].ID == folderID {
			if name != "" {
				s.state.Folders[i].Name = name
			}
			s.state.Folders[i].ParentID = parentID
			return s.storage.PersistFolders(s.state.Folders)
		}
	}

	return &core.FolderNotFoundError{FolderID: folderID}
}

// MoveConnectionToFolder moves a connection to a folder (in-memory only).
// Caller must sync encrypted storage separately via ConnectionService.UpdateFolderID.
func (s *FolderService) MoveConnectionToFolder(connID, folderID string) error {
	s.state.Mu.Lock()
	defer s.state.Mu.Unlock()

	for i := range s.state.SavedConnections {
		if s.state.SavedConnections[i].ID == connID {
			s.state.SavedConnections[i].FolderID = folderID
			return nil
		}
	}

	return &core.ConnectionNotFoundError{ConnID: connID}
}
