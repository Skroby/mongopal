package credential

import (
	"strings"
	"testing"

	"github.com/peternagy/mongopal/internal/types"
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

func TestBuildURIFromFormData(t *testing.T) {
	tests := []struct {
		name     string
		fd       types.ConnectionFormData
		password string
		want     string
	}{
		{
			name: "standalone with directConnection",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				RetryWrites:    true,
			},
			want: "mongodb://localhost/?directConnection=true",
		},
		{
			name: "standalone with credentials",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "db.example.com", Port: 27018}},
				Username:       "admin",
				RetryWrites:    true,
			},
			password: "s3cret",
			want:     "mongodb://admin:s3cret@db.example.com:27018/?directConnection=true",
		},
		{
			name: "standalone with special chars in credentials",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				Username:       "user@domain",
				RetryWrites:    true,
			},
			password: "p@ss:word/123",
			want:     "mongodb://user%40domain:p%40ss%3Aword%2F123@localhost/?directConnection=true",
		},
		{
			name: "replicaset with multiple hosts",
			fd: types.ConnectionFormData{
				ConnectionType: "replicaset",
				Hosts: []types.HostPort{
					{Host: "host1", Port: 27017},
					{Host: "host2", Port: 27018},
					{Host: "host3", Port: 27019},
				},
				ReplicaSetName: "rs0",
				RetryWrites:    true,
			},
			want: "mongodb://host1,host2:27018,host3:27019/?replicaSet=rs0",
		},
		{
			name: "srv connection",
			fd: types.ConnectionFormData{
				ConnectionType: "srv",
				SRVHostname:    "cluster0.abc123.mongodb.net",
				Username:       "admin",
				DefaultDatabase: "mydb",
				RetryWrites:    true,
			},
			password: "pass",
			want:     "mongodb+srv://admin:pass@cluster0.abc123.mongodb.net/mydb",
		},
		{
			name: "sharded with hosts",
			fd: types.ConnectionFormData{
				ConnectionType: "sharded",
				Hosts: []types.HostPort{
					{Host: "mongos1", Port: 27017},
					{Host: "mongos2", Port: 27017},
				},
				RetryWrites: true,
			},
			want: "mongodb://mongos1,mongos2/",
		},
		{
			name: "auth mechanism SCRAM-SHA-256",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				Username:       "user",
				AuthMechanism:  "scram-sha-256",
				AuthDatabase:   "myauthdb",
				RetryWrites:    true,
			},
			password: "pass",
			want:     "mongodb://user:pass@localhost/?authMechanism=SCRAM-SHA-256&authSource=myauthdb&directConnection=true",
		},
		{
			name: "auth mechanism x509 with admin authdb omitted",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				Username:       "CN=client",
				AuthMechanism:  "x509",
				AuthDatabase:   "admin",
				RetryWrites:    true,
			},
			want: "mongodb://CN=client@localhost/?authMechanism=MONGODB-X509&directConnection=true",
		},
		{
			name: "TLS enabled with insecure",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				TLSEnabled:     true,
				TLSInsecure:    true,
				RetryWrites:    true,
			},
			want: "mongodb://localhost/?directConnection=true&tls=true&tlsAllowInvalidCertificates=true",
		},
		{
			name: "non-default options",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				MaxPoolSize:    50,
				RetryWrites:    false,
				ReadPreference: "secondary",
				AppName:        "myapp",
				Compressors:    []string{"zstd", "snappy"},
			},
			want: "mongodb://localhost/?directConnection=true&maxPoolSize=50&retryWrites=false&readPreference=secondary&appName=myapp&compressors=zstd,snappy",
		},
		{
			name: "write concern majority",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				RetryWrites:    true,
				WriteConcernW:  "majority",
				WriteConcernJ:  true,
				WriteConcernWTimeout: 5000,
			},
			want: "mongodb://localhost/?directConnection=true&w=majority&journal=true&wtimeout=5000",
		},
		{
			name: "write concern numeric 0",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				RetryWrites:    true,
				WriteConcernW:  float64(0),
			},
			want: "mongodb://localhost/?directConnection=true&w=0",
		},
		{
			name: "timeouts non-default",
			fd: types.ConnectionFormData{
				ConnectionType:         "standalone",
				Hosts:                  []types.HostPort{{Host: "localhost", Port: 27017}},
				RetryWrites:            true,
				ConnectTimeout:         5,
				SocketTimeout:          60,
				ServerSelectionTimeout: 15,
			},
			want: "mongodb://localhost/?directConnection=true&connectTimeoutMS=5000&socketTimeoutMS=60000&serverSelectionTimeoutMS=15000",
		},
		{
			name: "IPv6 host",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "::1", Port: 27017}},
				RetryWrites:    true,
			},
			want: "mongodb://[::1]/?directConnection=true",
		},
		{
			name: "IPv6 host with custom port",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "2001:db8::1", Port: 27018}},
				RetryWrites:    true,
			},
			want: "mongodb://[2001:db8::1]:27018/?directConnection=true",
		},
		{
			name: "defaults omitted - maxPoolSize 100 not added",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				MaxPoolSize:    100,
				RetryWrites:    true,
				ReadPreference: "primary",
				AppName:        "mongopal",
				ConnectTimeout: 10,
				SocketTimeout:  30,
				ServerSelectionTimeout: 30,
			},
			want: "mongodb://localhost/?directConnection=true",
		},
		{
			name: "no username - no credentials in URI",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
				RetryWrites:    true,
			},
			password: "ignored-because-no-username",
			want:     "mongodb://localhost/?directConnection=true",
		},
		{
			name: "empty hosts fallback for standalone",
			fd: types.ConnectionFormData{
				ConnectionType: "standalone",
				Hosts:          []types.HostPort{},
				RetryWrites:    true,
			},
			want: "mongodb://localhost:27017/?directConnection=true",
		},
		{
			name: "replicaset filters empty hosts",
			fd: types.ConnectionFormData{
				ConnectionType: "replicaset",
				Hosts: []types.HostPort{
					{Host: "host1", Port: 27017},
					{Host: "", Port: 0},
					{Host: "host2", Port: 27017},
				},
				ReplicaSetName: "rs0",
				RetryWrites:    true,
			},
			want: "mongodb://host1,host2/?replicaSet=rs0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildURIFromFormData(&tt.fd, tt.password)
			if got != tt.want {
				t.Errorf("BuildURIFromFormData() =\n  %q\nwant:\n  %q", got, tt.want)
			}
		})
	}
}

func TestStripVendorParams(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "strips mongopal params",
			uri:  "mongodb://localhost:27017/?directConnection=true&mongopal.ssh.enabled=true&mongopal.ssh.host=bastion",
			want: "mongodb://localhost:27017/?directConnection=true",
		},
		{
			name: "strips 3t params",
			uri:  "mongodb://localhost:27017/?3t.uriVersion=3&3t.connectionMode=direct&directConnection=true",
			want: "mongodb://localhost:27017/?directConnection=true",
		},
		{
			name: "strips both mongopal and 3t params",
			uri:  "mongodb://localhost:27017/?mongopal.ssh.enabled=true&directConnection=true&3t.uriVersion=3",
			want: "mongodb://localhost:27017/?directConnection=true",
		},
		{
			name: "preserves all non-vendor params",
			uri:  "mongodb://user:pass@localhost:27017/db?authMechanism=SCRAM-SHA-256&directConnection=true&tls=true",
			want: "mongodb://user:pass@localhost:27017/db?authMechanism=SCRAM-SHA-256&directConnection=true&tls=true",
		},
		{
			name: "no query string - returns original",
			uri:  "mongodb://localhost:27017/db",
			want: "mongodb://localhost:27017/db",
		},
		{
			name: "all vendor params - returns base URI",
			uri:  "mongodb://localhost:27017/?mongopal.ssh.enabled=true&mongopal.ssh.host=bastion&3t.uriVersion=3",
			want: "mongodb://localhost:27017/",
		},
		{
			name: "empty URI",
			uri:  "",
			want: "",
		},
		{
			name: "complex URI with many params",
			uri:  "mongodb://user:pass@host1:27017,host2:27017/db?replicaSet=rs0&mongopal.socks5.enabled=true&maxPoolSize=50&mongopal.socks5.host=proxy",
			want: "mongodb://user:pass@host1:27017,host2:27017/db?replicaSet=rs0&maxPoolSize=50",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := StripVendorParams(tt.uri)
			if got != tt.want {
				t.Errorf("StripVendorParams() =\n  %q\nwant:\n  %q", got, tt.want)
			}
		})
	}
}

func TestStripSCRAMAuthMechanism(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "strips SCRAM-SHA-1",
			uri:  "mongodb://root:pass@localhost:27017/?authMechanism=SCRAM-SHA-1&directConnection=true",
			want: "mongodb://root:pass@localhost:27017/?directConnection=true",
		},
		{
			name: "strips SCRAM-SHA-256",
			uri:  "mongodb://root:pass@localhost:27017/?authMechanism=SCRAM-SHA-256&directConnection=true",
			want: "mongodb://root:pass@localhost:27017/?directConnection=true",
		},
		{
			name: "preserves X509",
			uri:  "mongodb://cn=client@localhost:27017/?authMechanism=MONGODB-X509&directConnection=true",
			want: "mongodb://cn=client@localhost:27017/?authMechanism=MONGODB-X509&directConnection=true",
		},
		{
			name: "preserves AWS",
			uri:  "mongodb://localhost:27017/?authMechanism=MONGODB-AWS",
			want: "mongodb://localhost:27017/?authMechanism=MONGODB-AWS",
		},
		{
			name: "preserves GSSAPI",
			uri:  "mongodb://user@localhost:27017/?authMechanism=GSSAPI",
			want: "mongodb://user@localhost:27017/?authMechanism=GSSAPI",
		},
		{
			name: "no authMechanism - returns unchanged",
			uri:  "mongodb://root:pass@localhost:27017/?directConnection=true",
			want: "mongodb://root:pass@localhost:27017/?directConnection=true",
		},
		{
			name: "no query string - returns unchanged",
			uri:  "mongodb://localhost:27017/mydb",
			want: "mongodb://localhost:27017/mydb",
		},
		{
			name: "SCRAM-SHA-1 only param - strips to base",
			uri:  "mongodb://root:pass@localhost:27017/?authMechanism=SCRAM-SHA-1",
			want: "mongodb://root:pass@localhost:27017/",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := StripSCRAMAuthMechanism(tt.uri)
			if got != tt.want {
				t.Errorf("StripSCRAMAuthMechanism() =\n  %q\nwant:\n  %q", got, tt.want)
			}
		})
	}
}

func TestBuildURIFromFormData_NoVendorParams(t *testing.T) {
	// Verify that BuildURIFromFormData never includes mongopal.* or 3t.* params
	fd := types.ConnectionFormData{
		ConnectionType: "standalone",
		Hosts:          []types.HostPort{{Host: "localhost", Port: 27017}},
		Username:       "admin",
		TLSEnabled:     true,
		MaxPoolSize:    50,
		RetryWrites:    false,
		ReadPreference: "secondary",
	}
	uri := BuildURIFromFormData(&fd, "pass")
	if strings.Contains(uri, "mongopal.") {
		t.Errorf("URI should not contain mongopal.* params, got: %s", uri)
	}
	if strings.Contains(uri, "3t.") {
		t.Errorf("URI should not contain 3t.* params, got: %s", uri)
	}
}
