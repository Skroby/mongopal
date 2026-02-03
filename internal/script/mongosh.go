// Package script handles MongoDB shell script execution.
package script

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os/exec"
	"strings"
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

	// Security: Pass script via stdin to avoid exposing URI with password in process listings.
	// We use --nodb mode and connect() within the script.
	wrappedScript := buildWrappedScript(uri, "", script)

	// Build command arguments
	args := []string{
		"--nodb",  // Don't connect automatically (we'll use connect() in script)
		"--quiet", // Suppress connection messages
		"--norc",  // Don't load .mongoshrc.js
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Pass script via stdin
	cmd.Stdin = strings.NewReader(wrappedScript)

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

// buildWrappedScript creates a script that connects first, then runs the user script.
// This keeps the URI out of the command line arguments.
func buildWrappedScript(uri, dbName, userScript string) string {
	var sb strings.Builder
	// Escape backticks and backslashes in URI for JavaScript string
	escapedURI := strings.ReplaceAll(uri, "\\", "\\\\")
	escapedURI = strings.ReplaceAll(escapedURI, "`", "\\`")

	if dbName != "" {
		// Connect to specific database
		sb.WriteString(fmt.Sprintf("db = connect(`%s`);\n", escapedURI))
	} else {
		// Connect without specific database - use 'test' as default
		sb.WriteString(fmt.Sprintf("db = connect(`%s`);\n", escapedURI))
	}
	sb.WriteString(userScript)
	return sb.String()
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

	// Security: Pass script via stdin to avoid exposing URI with password in process listings.
	wrappedScript := buildWrappedScript(uriWithDB, dbName, script)

	// Build command arguments
	args := []string{
		"--nodb",  // Don't connect automatically (we'll use connect() in script)
		"--quiet",
		"--norc",
	}

	// Create command
	cmd := exec.CommandContext(ctx, shellPath, args...)

	// Pass script via stdin
	cmd.Stdin = strings.NewReader(wrappedScript)

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
