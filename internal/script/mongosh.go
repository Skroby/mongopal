// Package script handles MongoDB shell script execution.
package script

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"time"

	"github.com/peternagy/mongopal/internal/storage"
	"github.com/peternagy/mongopal/internal/types"
)

// Service handles script execution.
type Service struct {
	connStore *storage.ConnectionService
}

// NewService creates a new script service.
func NewService(connStore *storage.ConnectionService) *Service {
	return &Service{
		connStore: connStore,
	}
}

// CheckMongoshAvailable checks if mongosh is installed and available.
func CheckMongoshAvailable() (bool, string) {
	// Try mongosh first (modern MongoDB shell)
	if path, err := exec.LookPath("mongosh"); err == nil {
		return true, path
	}
	// Fall back to legacy mongo shell
	if path, err := exec.LookPath("mongo"); err == nil {
		return true, path
	}
	return false, ""
}

// ExecuteScript executes a MongoDB shell script using mongosh.
func (s *Service) ExecuteScript(connID, script string) (*types.ScriptResult, error) {
	if script == "" {
		return nil, fmt.Errorf("script cannot be empty")
	}

	// Check if mongosh is available
	available, shellPath := CheckMongoshAvailable()
	if !available {
		return nil, fmt.Errorf("mongosh or mongo shell not found. Please install MongoDB Shell: https://www.mongodb.com/try/download/shell")
	}

	// Get connection URI with password
	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return nil, err
	}

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build command arguments
	args := []string{
		uri,
		"--quiet", // Suppress connection messages
		"--norc",  // Don't load .mongoshrc.js
		"--eval", script,
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Capture stdout and stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err = cmd.Run()

	result := &types.ScriptResult{
		Output:   stdout.String(),
		Error:    stderr.String(),
		ExitCode: 0,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			result.Error = "script execution timed out (60s limit)"
			result.ExitCode = -1
		} else {
			result.Error = err.Error()
			result.ExitCode = -1
		}
	}

	// Combine stderr with output if there's an error
	if result.Error != "" && result.Output == "" {
		result.Output = result.Error
	}

	return result, nil
}

// ExecuteScriptWithDatabase executes a script against a specific database.
func (s *Service) ExecuteScriptWithDatabase(connID, dbName, script string) (*types.ScriptResult, error) {
	if script == "" {
		return nil, fmt.Errorf("script cannot be empty")
	}
	if dbName == "" {
		return nil, fmt.Errorf("database name cannot be empty")
	}

	// Check if mongosh is available
	available, shellPath := CheckMongoshAvailable()
	if !available {
		return nil, fmt.Errorf("mongosh or mongo shell not found. Please install MongoDB Shell: https://www.mongodb.com/try/download/shell")
	}

	// Get connection URI with password
	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return nil, err
	}

	// Parse and modify URI to include database
	parsedURI, err := url.Parse(uri)
	if err != nil {
		return nil, fmt.Errorf("invalid connection URI: %w", err)
	}

	// Set the database in the path
	parsedURI.Path = "/" + dbName
	uriWithDB := parsedURI.String()

	// Create a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Build command arguments
	args := []string{
		uriWithDB,
		"--quiet",
		"--norc",
		"--eval", script,
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Capture stdout and stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Run the command
	err = cmd.Run()

	result := &types.ScriptResult{
		Output:   stdout.String(),
		Error:    stderr.String(),
		ExitCode: 0,
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			result.Error = "script execution timed out (60s limit)"
			result.ExitCode = -1
		} else {
			result.Error = err.Error()
			result.ExitCode = -1
		}
	}

	if result.Error != "" && result.Output == "" {
		result.Output = result.Error
	}

	return result, nil
}
