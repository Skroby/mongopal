package credential

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/peternagy/mongopal/internal/types"
)

// ExtractPasswordFromURI extracts and removes password from a MongoDB URI.
// Returns the clean URI (without password) and the extracted password.
func ExtractPasswordFromURI(uri string) (cleanURI, password string, err error) {
	parsed, err := url.Parse(uri)
	if err != nil {
		return uri, "", nil // Return original if parsing fails
	}

	if parsed.User == nil {
		return uri, "", nil // No credentials
	}

	password, hasPassword := parsed.User.Password()
	if !hasPassword || password == "" {
		return uri, "", nil // No password
	}

	// Create URI without password
	username := parsed.User.Username()
	parsed.User = url.User(username) // Username only, no password

	return parsed.String(), password, nil
}

// InjectPasswordIntoURI adds password back into a MongoDB URI.
func InjectPasswordIntoURI(uri, password string) (string, error) {
	if password == "" {
		return uri, nil
	}

	parsed, err := url.Parse(uri)
	if err != nil {
		return uri, nil
	}

	if parsed.User == nil {
		return uri, nil // No username to add password to
	}

	username := parsed.User.Username()
	parsed.User = url.UserPassword(username, password)

	return parsed.String(), nil
}

// authMechanismMap maps frontend form values to MongoDB driver auth mechanism names.
var authMechanismMap = map[string]string{
	"scram-sha-1":   "SCRAM-SHA-1",
	"scram-sha-256": "SCRAM-SHA-256",
	"x509":          "MONGODB-X509",
	"mongodb-aws":   "MONGODB-AWS",
	"kerberos":      "GSSAPI",
}

// BuildURIFromFormData constructs a MongoDB URI from stored form data.
// Uses manual string building (no url.Parse) to avoid query-param roundtrip issues.
func BuildURIFromFormData(fd *types.ConnectionFormData, password string) string {
	var b strings.Builder

	// Protocol
	if fd.ConnectionType == "srv" {
		b.WriteString("mongodb+srv://")
	} else {
		b.WriteString("mongodb://")
	}

	// Credentials
	if fd.Username != "" {
		b.WriteString(url.QueryEscape(fd.Username))
		if password != "" {
			b.WriteByte(':')
			b.WriteString(url.QueryEscape(password))
		}
		b.WriteByte('@')
	}

	// Hosts
	switch fd.ConnectionType {
	case "srv":
		b.WriteString(fd.SRVHostname)
	case "standalone":
		if len(fd.Hosts) > 0 {
			b.WriteString(formatHost(fd.Hosts[0].Host, fd.Hosts[0].Port))
		} else {
			b.WriteString("localhost:27017")
		}
	default: // replicaset, sharded
		for i, hp := range fd.Hosts {
			if hp.Host == "" {
				continue
			}
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(formatHost(hp.Host, hp.Port))
		}
	}

	// Database path
	b.WriteByte('/')
	b.WriteString(fd.DefaultDatabase)

	// Query parameters — collect non-default values
	var params []string
	addParam := func(key, value string) {
		params = append(params, key+"="+value)
	}

	// Auth mechanism
	if fd.AuthMechanism != "none" {
		if driverName, ok := authMechanismMap[fd.AuthMechanism]; ok {
			addParam("authMechanism", driverName)
		}
	}
	if fd.AuthDatabase != "" && fd.AuthDatabase != "admin" {
		addParam("authSource", url.QueryEscape(fd.AuthDatabase))
	}

	// Direct connection for standalone
	if fd.ConnectionType == "standalone" {
		addParam("directConnection", "true")
	}

	// Replica set name
	if fd.ConnectionType == "replicaset" && fd.ReplicaSetName != "" {
		addParam("replicaSet", fd.ReplicaSetName)
	}

	// TLS
	if fd.TLSEnabled {
		addParam("tls", "true")
		if fd.TLSInsecure {
			addParam("tlsAllowInvalidCertificates", "true")
		}
	}

	// Options (only non-default values)
	if fd.MaxPoolSize != 100 && fd.MaxPoolSize != 0 {
		addParam("maxPoolSize", fmt.Sprintf("%d", fd.MaxPoolSize))
	}
	if !fd.RetryWrites {
		addParam("retryWrites", "false")
	}

	// WriteConcernW: JSON deserializes numbers as float64, strings as string
	if fd.WriteConcernW != nil {
		switch v := fd.WriteConcernW.(type) {
		case float64:
			if v != 1 {
				if v == float64(int(v)) {
					addParam("w", fmt.Sprintf("%d", int(v)))
				} else {
					addParam("w", fmt.Sprintf("%g", v))
				}
			}
		case string:
			if v != "" && v != "1" {
				addParam("w", v)
			}
		}
	}

	if fd.WriteConcernJ {
		addParam("journal", "true")
	}
	if fd.WriteConcernWTimeout > 0 {
		addParam("wtimeout", fmt.Sprintf("%d", fd.WriteConcernWTimeout))
	}
	if fd.ReadPreference != "" && fd.ReadPreference != "primary" {
		addParam("readPreference", fd.ReadPreference)
	}
	if fd.AppName != "" && fd.AppName != "mongopal" {
		addParam("appName", url.QueryEscape(fd.AppName))
	}
	if len(fd.Compressors) > 0 {
		addParam("compressors", strings.Join(fd.Compressors, ","))
	}

	// Timeouts (seconds → milliseconds, only if non-default)
	if fd.ConnectTimeout != 10 && fd.ConnectTimeout != 0 {
		addParam("connectTimeoutMS", fmt.Sprintf("%d", fd.ConnectTimeout*1000))
	}
	if fd.SocketTimeout != 30 && fd.SocketTimeout != 0 {
		addParam("socketTimeoutMS", fmt.Sprintf("%d", fd.SocketTimeout*1000))
	}
	if fd.ServerSelectionTimeout != 30 && fd.ServerSelectionTimeout != 0 {
		addParam("serverSelectionTimeoutMS", fmt.Sprintf("%d", fd.ServerSelectionTimeout*1000))
	}

	if len(params) > 0 {
		b.WriteByte('?')
		b.WriteString(strings.Join(params, "&"))
	}

	return b.String()
}

// formatHost formats a host:port pair, handling IPv6 addresses.
func formatHost(host string, port int) string {
	// Wrap IPv6 in brackets if not already wrapped
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		host = "[" + host + "]"
	}

	// Omit default port
	if port == 27017 || port == 0 {
		return host
	}
	return fmt.Sprintf("%s:%d", host, port)
}

// StripVendorParams removes mongopal.* and 3t.* query parameters from a MongoDB URI.
// Uses manual string splitting to avoid url.Parse roundtrip issues.
func StripVendorParams(uri string) string {
	// Find the query string
	qIdx := strings.Index(uri, "?")
	if qIdx < 0 {
		return uri // No query string
	}

	base := uri[:qIdx]
	query := uri[qIdx+1:]

	// Split on & and filter out vendor params
	parts := strings.Split(query, "&")
	var kept []string
	for _, part := range parts {
		key := part
		if eqIdx := strings.Index(part, "="); eqIdx >= 0 {
			key = part[:eqIdx]
		}
		if strings.HasPrefix(key, "mongopal.") || strings.HasPrefix(key, "3t.") {
			continue
		}
		kept = append(kept, part)
	}

	if len(kept) == 0 {
		return base
	}
	return base + "?" + strings.Join(kept, "&")
}
