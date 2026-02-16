package bsonutil

import (
	"testing"
)

func TestToString(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want string
	}{
		{"nil", nil, ""},
		{"string", "hello", "hello"},
		{"empty string", "", ""},
		{"int32", int32(42), "42"},
		{"int64", int64(999), "999"},
		{"float64", float64(3.14), "3.14"},
		{"bool", true, "true"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToString(tt.in)
			if got != tt.want {
				t.Errorf("ToString(%v) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestToInt64(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want int64
	}{
		{"nil", nil, 0},
		{"int32", int32(42), 42},
		{"int64", int64(999), 999},
		{"float64", float64(3.7), 3},
		{"int", int(10), 10},
		{"negative int32", int32(-5), -5},
		{"string (unsupported)", "hello", 0},
		{"bool (unsupported)", true, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToInt64(tt.in)
			if got != tt.want {
				t.Errorf("ToInt64(%v) = %d, want %d", tt.in, got, tt.want)
			}
		})
	}
}

func TestToFloat64(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want float64
	}{
		{"nil", nil, 0},
		{"float64", float64(3.14), 3.14},
		{"int32", int32(42), 42.0},
		{"int64", int64(999), 999.0},
		{"int", int(10), 10.0},
		{"string (unsupported)", "hello", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToFloat64(tt.in)
			if got != tt.want {
				t.Errorf("ToFloat64(%v) = %f, want %f", tt.in, got, tt.want)
			}
		})
	}
}

func TestToBool(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want bool
	}{
		{"nil", nil, false},
		{"true", true, true},
		{"false", false, false},
		{"string (unsupported)", "true", false},
		{"int (unsupported)", int(1), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToBool(tt.in)
			if got != tt.want {
				t.Errorf("ToBool(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestToInt(t *testing.T) {
	tests := []struct {
		name string
		in   interface{}
		want int
	}{
		{"nil", nil, 0},
		{"int32", int32(42), 42},
		{"int64", int64(999), 999},
		{"float64", float64(3.7), 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ToInt(tt.in)
			if got != tt.want {
				t.Errorf("ToInt(%v) = %d, want %d", tt.in, got, tt.want)
			}
		})
	}
}

func TestInt64FromMap(t *testing.T) {
	m := map[string]interface{}{
		"count": int32(42),
		"size":  int64(1024),
		"name":  "test",
	}
	if got := Int64FromMap(m, "count"); got != 42 {
		t.Errorf("Int64FromMap(m, 'count') = %d, want 42", got)
	}
	if got := Int64FromMap(m, "size"); got != 1024 {
		t.Errorf("Int64FromMap(m, 'size') = %d, want 1024", got)
	}
	if got := Int64FromMap(m, "name"); got != 0 {
		t.Errorf("Int64FromMap(m, 'name') = %d, want 0", got)
	}
	if got := Int64FromMap(m, "missing"); got != 0 {
		t.Errorf("Int64FromMap(m, 'missing') = %d, want 0", got)
	}
}

func TestBoolFromMap(t *testing.T) {
	m := map[string]interface{}{
		"active": true,
		"done":   false,
		"name":   "test",
	}
	if got := BoolFromMap(m, "active"); !got {
		t.Errorf("BoolFromMap(m, 'active') = %v, want true", got)
	}
	if got := BoolFromMap(m, "done"); got {
		t.Errorf("BoolFromMap(m, 'done') = %v, want false", got)
	}
	if got := BoolFromMap(m, "name"); got {
		t.Errorf("BoolFromMap(m, 'name') = %v, want false", got)
	}
	if got := BoolFromMap(m, "missing"); got {
		t.Errorf("BoolFromMap(m, 'missing') = %v, want false", got)
	}
}
