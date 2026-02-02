package database

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// MongoDB naming constraints:
// - Database names: max 64 bytes, no /\. "$*<>:|? or null characters
// - Collection names: max 120 bytes, no $ prefix (except system), no null characters

// InvalidNameError represents a validation error for database or collection names.
type InvalidNameError struct {
	Type   string // "database" or "collection"
	Name   string
	Reason string
}

func (e *InvalidNameError) Error() string {
	return fmt.Sprintf("invalid %s name %q: %s", e.Type, e.Name, e.Reason)
}

// ValidateDatabaseName checks if a database name is valid according to MongoDB rules.
func ValidateDatabaseName(name string) error {
	if name == "" {
		return &InvalidNameError{Type: "database", Name: name, Reason: "name cannot be empty"}
	}

	if len(name) > 64 {
		return &InvalidNameError{Type: "database", Name: name, Reason: "name exceeds 64 bytes"}
	}

	// Check for invalid characters: /\. "$*<>:|?
	invalidChars := `/\. "$*<>:|?`
	for _, r := range name {
		if r == 0 {
			return &InvalidNameError{Type: "database", Name: name, Reason: "name contains null character"}
		}
		if strings.ContainsRune(invalidChars, r) {
			return &InvalidNameError{Type: "database", Name: name, Reason: fmt.Sprintf("name contains invalid character %q", r)}
		}
	}

	return nil
}

// ValidateCollectionName checks if a collection name is valid according to MongoDB rules.
func ValidateCollectionName(name string) error {
	if name == "" {
		return &InvalidNameError{Type: "collection", Name: name, Reason: "name cannot be empty"}
	}

	if len(name) > 120 {
		return &InvalidNameError{Type: "collection", Name: name, Reason: "name exceeds 120 bytes"}
	}

	// Check for null character
	if strings.ContainsRune(name, 0) {
		return &InvalidNameError{Type: "collection", Name: name, Reason: "name contains null character"}
	}

	// Collection names cannot start with $ (except system collections)
	if strings.HasPrefix(name, "$") && !strings.HasPrefix(name, "system.") {
		return &InvalidNameError{Type: "collection", Name: name, Reason: "name cannot start with $"}
	}

	// Check for valid UTF-8
	if !utf8.ValidString(name) {
		return &InvalidNameError{Type: "collection", Name: name, Reason: "name is not valid UTF-8"}
	}

	return nil
}

// ValidateDatabaseAndCollection validates both database and collection names.
func ValidateDatabaseAndCollection(dbName, collName string) error {
	if err := ValidateDatabaseName(dbName); err != nil {
		return err
	}
	return ValidateCollectionName(collName)
}
