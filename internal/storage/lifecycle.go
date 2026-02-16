package storage

// ConnectionLifecycle orchestrates cross-service operations for connection management.
// It wraps ConnectionService and related storage services to handle operations
// that span multiple concerns (e.g. deleting a connection and its associated data).
type ConnectionLifecycle struct {
	connStore   *ConnectionService
	favoriteSvc *FavoriteService
	dbMetaSvc   *DatabaseMetadataService
	querySvc    *QueryService
}

// NewConnectionLifecycle creates a new lifecycle manager.
func NewConnectionLifecycle(
	connStore *ConnectionService,
	favoriteSvc *FavoriteService,
	dbMetaSvc *DatabaseMetadataService,
	querySvc *QueryService,
) *ConnectionLifecycle {
	return &ConnectionLifecycle{
		connStore:   connStore,
		favoriteSvc: favoriteSvc,
		dbMetaSvc:   dbMetaSvc,
		querySvc:    querySvc,
	}
}

// DeleteConnection deletes a saved connection and cleans up all associated data
// (favorites, database metadata, saved queries). Cleanup errors are ignored
// since they are secondary to the primary deletion.
func (l *ConnectionLifecycle) DeleteConnection(connID string) error {
	if err := l.connStore.DeleteSavedConnection(connID); err != nil {
		return err
	}
	// Clean up associated data (ignore errors, these are secondary)
	_ = l.favoriteSvc.RemoveFavoritesForConnection(connID)
	_ = l.dbMetaSvc.RemoveMetadataForConnection(connID)
	_ = l.querySvc.DeleteQueriesForConnection(connID)
	return nil
}
