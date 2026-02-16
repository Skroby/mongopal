// Package bsonutil provides shared BSON type conversion helpers.
// These functions safely convert BSON values (which may arrive as int32, int64,
// float64, etc.) into Go types without panicking on unexpected types.
package bsonutil

import "fmt"

// ToString converts a BSON value to string. Returns "" for nil.
// Non-string values are formatted with fmt.Sprintf.
func ToString(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

// ToInt64 converts a BSON numeric value to int64. Returns 0 for nil or
// unrecognised types. Handles int32, int64, float64, and int.
func ToInt64(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch n := v.(type) {
	case int32:
		return int64(n)
	case int64:
		return n
	case float64:
		return int64(n)
	case int:
		return int64(n)
	default:
		return 0
	}
}

// ToFloat64 converts a BSON numeric value to float64. Returns 0 for nil or
// unrecognised types. Handles float64, int32, int64, and int.
func ToFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return n
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case int:
		return float64(n)
	default:
		return 0
	}
}

// ToBool converts a BSON value to bool. Returns false for nil or non-bool types.
func ToBool(v interface{}) bool {
	if v == nil {
		return false
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

// ToInt converts a BSON numeric value to int. Returns 0 for nil or
// unrecognised types. Handles int32, int64, float64, and int.
func ToInt(v interface{}) int {
	return int(ToInt64(v))
}

// Int64FromMap extracts an int64 value from a map by key.
// Returns 0 if the key is missing or the value is not a recognised numeric type.
func Int64FromMap(m map[string]interface{}, key string) int64 {
	return ToInt64(m[key])
}

// BoolFromMap extracts a bool value from a map by key.
// Returns false if the key is missing or the value is not bool.
func BoolFromMap(m map[string]interface{}, key string) bool {
	return ToBool(m[key])
}
