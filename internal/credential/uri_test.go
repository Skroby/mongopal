package credential

import (
	"testing"
)

func TestExtractPasswordFromURI(t *testing.T) {
	tests := []struct {
		name         string
		uri          string
		wantCleanURI string
		wantPassword string
	}{
		{
			name:         "standard mongodb URI with password",
			uri:          "mongodb://user:secret@localhost:27017/testdb",
			wantCleanURI: "mongodb://user@localhost:27017/testdb",
			wantPassword: "secret",
		},
		{
			name:         "mongodb+srv URI with password",
			uri:          "mongodb+srv://admin:pass123@cluster.mongodb.net/db",
			wantCleanURI: "mongodb+srv://admin@cluster.mongodb.net/db",
			wantPassword: "pass123",
		},
		{
			name:         "no password - username only",
			uri:          "mongodb://user@localhost:27017/testdb",
			wantCleanURI: "mongodb://user@localhost:27017/testdb",
			wantPassword: "",
		},
		{
			name:         "no credentials at all",
			uri:          "mongodb://localhost:27017/testdb",
			wantCleanURI: "mongodb://localhost:27017/testdb",
			wantPassword: "",
		},
		{
			name:         "empty password",
			uri:          "mongodb://user:@localhost:27017/testdb",
			wantCleanURI: "mongodb://user:@localhost:27017/testdb",
			wantPassword: "",
		},
		{
			name:         "password with special chars - URL encoded",
			uri:          "mongodb://user:p%40ss%3Aword@localhost:27017/db",
			wantCleanURI: "mongodb://user@localhost:27017/db",
			wantPassword: "p@ss:word",
		},
		{
			name:         "password with slash",
			uri:          "mongodb://user:pass%2Fword@localhost:27017/db",
			wantCleanURI: "mongodb://user@localhost:27017/db",
			wantPassword: "pass/word",
		},
		{
			name:         "complex password with multiple special chars",
			uri:          "mongodb://admin:P%40ss%21%23%24%25@host:27017/db",
			wantCleanURI: "mongodb://admin@host:27017/db",
			wantPassword: "P@ss!#$%",
		},
		{
			name:         "replica set - multiple hosts",
			uri:          "mongodb://user:secret@host1:27017,host2:27017,host3:27017/db?replicaSet=rs0",
			wantCleanURI: "mongodb://user@host1:27017,host2:27017,host3:27017/db?replicaSet=rs0",
			wantPassword: "secret",
		},
		{
			name:         "with query parameters",
			uri:          "mongodb://user:pass@localhost:27017/db?authSource=admin&ssl=true",
			wantCleanURI: "mongodb://user@localhost:27017/db?authSource=admin&ssl=true",
			wantPassword: "pass",
		},
		{
			name:         "invalid URI - returns original",
			uri:          "not-a-valid-uri",
			wantCleanURI: "not-a-valid-uri",
			wantPassword: "",
		},
		{
			name:         "empty URI",
			uri:          "",
			wantCleanURI: "",
			wantPassword: "",
		},
		{
			name:         "IPv6 host",
			uri:          "mongodb://user:pass@[::1]:27017/db",
			wantCleanURI: "mongodb://user@[::1]:27017/db",
			wantPassword: "pass",
		},
		{
			name:         "unix socket path - parsed as opaque URI",
			uri:          "mongodb://user:pass@%2Ftmp%2Fmongodb.sock/db",
			wantCleanURI: "mongodb://user:pass@%2Ftmp%2Fmongodb.sock/db", // Go's url.Parse treats encoded host as opaque
			wantPassword: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotClean, gotPass, err := ExtractPasswordFromURI(tt.uri)
			if err != nil {
				t.Errorf("ExtractPasswordFromURI() unexpected error = %v", err)
				return
			}
			if gotClean != tt.wantCleanURI {
				t.Errorf("ExtractPasswordFromURI() cleanURI = %q, want %q", gotClean, tt.wantCleanURI)
			}
			if gotPass != tt.wantPassword {
				t.Errorf("ExtractPasswordFromURI() password = %q, want %q", gotPass, tt.wantPassword)
			}
		})
	}
}

func TestInjectPasswordIntoURI(t *testing.T) {
	tests := []struct {
		name     string
		uri      string
		password string
		wantURI  string
	}{
		{
			name:     "inject password into URI with username only",
			uri:      "mongodb://user@localhost:27017/db",
			password: "secret",
			wantURI:  "mongodb://user:secret@localhost:27017/db",
		},
		{
			name:     "empty password - returns original",
			uri:      "mongodb://user@localhost:27017/db",
			password: "",
			wantURI:  "mongodb://user@localhost:27017/db",
		},
		{
			name:     "no username - returns original",
			uri:      "mongodb://localhost:27017/db",
			password: "secret",
			wantURI:  "mongodb://localhost:27017/db",
		},
		{
			name:     "password with special chars - gets encoded",
			uri:      "mongodb://user@localhost:27017/db",
			password: "p@ss:word",
			wantURI:  "mongodb://user:p%40ss%3Aword@localhost:27017/db", // Go encodes both @ and :
		},
		{
			name:     "password with slash",
			uri:      "mongodb://user@localhost:27017/db",
			password: "pass/word",
			wantURI:  "mongodb://user:pass%2Fword@localhost:27017/db",
		},
		{
			name:     "mongodb+srv with password",
			uri:      "mongodb+srv://admin@cluster.mongodb.net/db",
			password: "pass123",
			wantURI:  "mongodb+srv://admin:pass123@cluster.mongodb.net/db",
		},
		{
			name:     "with query parameters preserved",
			uri:      "mongodb://user@localhost:27017/db?authSource=admin",
			password: "pass",
			wantURI:  "mongodb://user:pass@localhost:27017/db?authSource=admin",
		},
		{
			name:     "replica set preserved",
			uri:      "mongodb://user@host1:27017,host2:27017/db?replicaSet=rs0",
			password: "secret",
			wantURI:  "mongodb://user:secret@host1:27017,host2:27017/db?replicaSet=rs0",
		},
		{
			name:     "invalid URI - returns original",
			uri:      "not-a-uri",
			password: "secret",
			wantURI:  "not-a-uri",
		},
		{
			name:     "IPv6 host",
			uri:      "mongodb://user@[::1]:27017/db",
			password: "pass",
			wantURI:  "mongodb://user:pass@[::1]:27017/db",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := InjectPasswordIntoURI(tt.uri, tt.password)
			if err != nil {
				t.Errorf("InjectPasswordIntoURI() unexpected error = %v", err)
				return
			}
			if got != tt.wantURI {
				t.Errorf("InjectPasswordIntoURI() = %q, want %q", got, tt.wantURI)
			}
		})
	}
}

func TestExtractAndInjectRoundTrip(t *testing.T) {
	// Test that extract -> inject produces equivalent URIs
	tests := []struct {
		name string
		uri  string
	}{
		{
			name: "standard URI",
			uri:  "mongodb://user:password@localhost:27017/db",
		},
		{
			name: "complex password",
			uri:  "mongodb://user:P%40ss%21word@localhost:27017/db",
		},
		{
			name: "with options",
			uri:  "mongodb://user:pass@localhost:27017/db?authSource=admin&ssl=true",
		},
		{
			name: "replica set",
			uri:  "mongodb://user:pass@host1:27017,host2:27017/db?replicaSet=rs0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Extract password
			cleanURI, password, err := ExtractPasswordFromURI(tt.uri)
			if err != nil {
				t.Fatalf("ExtractPasswordFromURI() error = %v", err)
			}

			// Inject password back
			reconstructed, err := InjectPasswordIntoURI(cleanURI, password)
			if err != nil {
				t.Fatalf("InjectPasswordIntoURI() error = %v", err)
			}

			// Should be equivalent (may have different encoding but same meaning)
			// Re-extract to compare
			cleanAgain, passAgain, _ := ExtractPasswordFromURI(reconstructed)
			origClean, origPass, _ := ExtractPasswordFromURI(tt.uri)

			if cleanAgain != origClean {
				t.Errorf("Round-trip clean URI mismatch: got %q, want %q", cleanAgain, origClean)
			}
			if passAgain != origPass {
				t.Errorf("Round-trip password mismatch: got %q, want %q", passAgain, origPass)
			}
		})
	}
}
