package credential

import (
	"net/url"
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
