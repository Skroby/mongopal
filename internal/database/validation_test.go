package database

import (
	"strings"
	"testing"
)

func TestValidateDatabaseName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
		errMsg  string
	}{
		{"valid simple name", "mydb", false, ""},
		{"valid with numbers", "mydb123", false, ""},
		{"valid with underscore", "my_db", false, ""},
		{"valid with hyphen", "my-db", false, ""},
		{"empty name", "", true, "cannot be empty"},
		{"too long", strings.Repeat("a", 65), true, "exceeds 64 bytes"},
		{"max length valid", strings.Repeat("a", 64), false, ""},
		{"contains slash", "my/db", true, "invalid character"},
		{"contains backslash", "my\\db", true, "invalid character"},
		{"contains dot", "my.db", true, "invalid character"},
		{"contains space", "my db", true, "invalid character"},
		{"contains quote", "my\"db", true, "invalid character"},
		{"contains dollar", "my$db", true, "invalid character"},
		{"contains asterisk", "my*db", true, "invalid character"},
		{"contains less than", "my<db", true, "invalid character"},
		{"contains greater than", "my>db", true, "invalid character"},
		{"contains colon", "my:db", true, "invalid character"},
		{"contains pipe", "my|db", true, "invalid character"},
		{"contains question", "my?db", true, "invalid character"},
		{"contains null", "my\x00db", true, "null character"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDatabaseName(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateDatabaseName(%q) expected error, got nil", tt.input)
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("ValidateDatabaseName(%q) error = %q, want to contain %q", tt.input, err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateDatabaseName(%q) unexpected error: %v", tt.input, err)
				}
			}
		})
	}
}

func TestValidateCollectionName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
		errMsg  string
	}{
		{"valid simple name", "users", false, ""},
		{"valid with numbers", "users123", false, ""},
		{"valid with dot", "users.active", false, ""},
		{"valid with underscore", "user_data", false, ""},
		{"valid with hyphen", "user-data", false, ""},
		{"empty name", "", true, "cannot be empty"},
		{"too long", strings.Repeat("a", 121), true, "exceeds 120 bytes"},
		{"max length valid", strings.Repeat("a", 120), false, ""},
		{"starts with dollar", "$users", true, "cannot start with $"},
		{"system collection allowed", "system.users", false, ""},
		{"contains null", "users\x00data", true, "null character"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateCollectionName(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateCollectionName(%q) expected error, got nil", tt.input)
					return
				}
				if tt.errMsg != "" && !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("ValidateCollectionName(%q) error = %q, want to contain %q", tt.input, err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateCollectionName(%q) unexpected error: %v", tt.input, err)
				}
			}
		})
	}
}

func TestValidateDatabaseAndCollection(t *testing.T) {
	tests := []struct {
		name     string
		dbName   string
		collName string
		wantErr  bool
	}{
		{"both valid", "mydb", "users", false},
		{"invalid db", "my/db", "users", true},
		{"invalid coll", "mydb", "$users", true},
		{"both invalid", "my/db", "$users", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDatabaseAndCollection(tt.dbName, tt.collName)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateDatabaseAndCollection(%q, %q) expected error, got nil", tt.dbName, tt.collName)
				}
			} else {
				if err != nil {
					t.Errorf("ValidateDatabaseAndCollection(%q, %q) unexpected error: %v", tt.dbName, tt.collName, err)
				}
			}
		})
	}
}

func TestInvalidNameError(t *testing.T) {
	err := &InvalidNameError{
		Type:   "database",
		Name:   "my/db",
		Reason: "contains invalid character",
	}

	expected := `invalid database name "my/db": contains invalid character`
	if err.Error() != expected {
		t.Errorf("InvalidNameError.Error() = %q, want %q", err.Error(), expected)
	}
}
