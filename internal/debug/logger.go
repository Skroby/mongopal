package debug

import (
	"context"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Categories for debug logging (must match frontend DEBUG_CATEGORIES)
const (
	CategoryConnection  = "connection"
	CategoryQuery       = "query"
	CategoryDocument    = "document"
	CategorySchema      = "schema"
	CategoryExport      = "export"
	CategoryImport      = "import"
	CategoryUI          = "ui"
	CategoryWails       = "wails"
	CategoryPerformance = "performance"
)

// Logger provides debug logging that emits events to the frontend
type Logger struct {
	ctx     context.Context
	enabled bool
	mu      sync.RWMutex
}

// Global logger instance
var globalLogger *Logger
var once sync.Once

// Init initializes the global debug logger with the Wails context
func Init(ctx context.Context) {
	once.Do(func() {
		globalLogger = &Logger{
			ctx:     ctx,
			enabled: false,
		}
	})
	// Update context if called again (e.g., after app restart)
	if globalLogger != nil {
		globalLogger.mu.Lock()
		globalLogger.ctx = ctx
		globalLogger.mu.Unlock()
	}
}

// SetEnabled enables or disables debug logging
func SetEnabled(enabled bool) {
	if globalLogger == nil {
		return
	}
	globalLogger.mu.Lock()
	globalLogger.enabled = enabled
	globalLogger.mu.Unlock()
}

// IsEnabled returns whether debug logging is enabled
func IsEnabled() bool {
	if globalLogger == nil {
		return false
	}
	globalLogger.mu.RLock()
	defer globalLogger.mu.RUnlock()
	return globalLogger.enabled
}

// Log emits a debug log event to the frontend
// category: one of the Category* constants
// message: short one-liner summary
// details: optional map with additional context (can be nil)
func Log(category, message string, details map[string]interface{}) {
	if globalLogger == nil {
		return
	}

	globalLogger.mu.RLock()
	enabled := globalLogger.enabled
	ctx := globalLogger.ctx
	globalLogger.mu.RUnlock()

	if !enabled || ctx == nil {
		return
	}

	// Emit event to frontend
	runtime.EventsEmit(ctx, "debug:log", category, message, details)
}

// Convenience functions for each category

// LogConnection logs a connection-related debug message
func LogConnection(message string, details map[string]interface{}) {
	Log(CategoryConnection, message, details)
}

// LogQuery logs a query-related debug message
func LogQuery(message string, details map[string]interface{}) {
	Log(CategoryQuery, message, details)
}

// LogDocument logs a document-related debug message
func LogDocument(message string, details map[string]interface{}) {
	Log(CategoryDocument, message, details)
}

// LogExport logs an export-related debug message
func LogExport(message string, details map[string]interface{}) {
	Log(CategoryExport, message, details)
}

// LogImport logs an import-related debug message
func LogImport(message string, details map[string]interface{}) {
	Log(CategoryImport, message, details)
}

// LogPerformance logs a performance-related debug message
func LogPerformance(message string, details map[string]interface{}) {
	Log(CategoryPerformance, message, details)
}

// LogSchema logs a schema-related debug message
func LogSchema(message string, details map[string]interface{}) {
	Log(CategorySchema, message, details)
}
