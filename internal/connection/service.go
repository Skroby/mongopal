// Package connection handles MongoDB connection operations.
package connection

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/peternagy/mongopal/internal/core"
	"github.com/peternagy/mongopal/internal/storage"
	"github.com/peternagy/mongopal/internal/types"
)

// Service handles MongoDB connection operations.
type Service struct {
	state     *core.AppState
	connStore *storage.ConnectionService
}

// NewService creates a new connection service.
func NewService(state *core.AppState, connStore *storage.ConnectionService) *Service {
	return &Service{
		state:     state,
		connStore: connStore,
	}
}

// Connect establishes a connection to a saved MongoDB instance.
func (s *Service) Connect(connID string) error {
	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return err
	}

	ctx, cancel := core.ContextWithConnectTimeout()
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	// Ping to verify connection
	if err := client.Ping(ctx, nil); err != nil {
		client.Disconnect(context.Background())
		return fmt.Errorf("failed to ping: %w", err)
	}

	s.state.SetClient(connID, client)

	// Update last accessed time (ignore error - non-critical)
	_ = s.connStore.UpdateLastAccessed(connID)

	return nil
}

// Disconnect closes a MongoDB connection.
func (s *Service) Disconnect(connID string) error {
	s.state.RemoveClient(connID)
	return nil
}

// DisconnectAll closes all MongoDB connections.
func (s *Service) DisconnectAll() error {
	clients := s.state.GetAllClients()
	for id := range clients {
		s.state.RemoveClient(id)
	}
	return nil
}

// TestConnection tests a MongoDB URI without saving.
func (s *Service) TestConnection(uri string) error {
	if uri == "" {
		return fmt.Errorf("URI cannot be empty")
	}

	// Validate URI scheme
	if !strings.HasPrefix(uri, "mongodb://") && !strings.HasPrefix(uri, "mongodb+srv://") {
		return fmt.Errorf("invalid URI scheme: must start with mongodb:// or mongodb+srv://")
	}

	ctx, cancel := core.ContextWithConnectTimeout()
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}
	// Use same timeout context for disconnect to avoid hanging
	defer client.Disconnect(ctx)

	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping: %w", err)
	}

	return nil
}

// GetConnectionStatus returns the status of a connection.
func (s *Service) GetConnectionStatus(connID string) types.ConnectionStatus {
	if !s.state.HasClient(connID) {
		return types.ConnectionStatus{Connected: false}
	}

	// Verify with ping
	client, _ := s.state.GetClient(connID)
	if client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := client.Ping(ctx, nil); err != nil {
			return types.ConnectionStatus{Connected: false, Error: err.Error()}
		}
	}

	return types.ConnectionStatus{Connected: true}
}

// GetConnectionInfo returns detailed info about a connection.
func (s *Service) GetConnectionInfo(connID string) types.ConnectionInfo {
	client, err := s.state.GetClient(connID)
	if err != nil {
		return types.ConnectionInfo{ID: connID}
	}

	ctx, cancel := core.ContextWithTimeout()
	defer cancel()

	info := types.ConnectionInfo{ID: connID, Type: "standalone"}

	// Get server info
	var result bson.M
	if err := client.Database("admin").RunCommand(ctx, bson.D{{Key: "buildInfo", Value: 1}}).Decode(&result); err == nil {
		if version, ok := result["version"].(string); ok {
			info.ServerVersion = version
		}
	}

	// Check if replica set
	var replStatus bson.M
	if err := client.Database("admin").RunCommand(ctx, bson.D{{Key: "replSetGetStatus", Value: 1}}).Decode(&replStatus); err == nil {
		info.Type = "replicaset"
		if setName, ok := replStatus["set"].(string); ok {
			info.ReplicaSet = setName
		}
	}

	return info
}

// Shutdown closes all connections and cleans up resources.
func (s *Service) Shutdown(ctx context.Context) {
	clients := s.state.GetAllClients()
	for id, client := range clients {
		_ = client.Disconnect(ctx)
		s.state.Mu.Lock()
		delete(s.state.Clients, id)
		s.state.Mu.Unlock()
	}
}
