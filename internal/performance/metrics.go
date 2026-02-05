package performance

import (
	"runtime"
	"time"

	"github.com/peternagy/mongopal/internal/core"
)

// Metrics holds performance and runtime statistics
type Metrics struct {
	// Go runtime
	HeapAlloc      uint64 `json:"heapAlloc"`      // Bytes allocated and in use
	HeapSys        uint64 `json:"heapSys"`        // Bytes obtained from system
	HeapIdle       uint64 `json:"heapIdle"`       // Bytes in idle spans
	HeapInuse      uint64 `json:"heapInuse"`      // Bytes in non-idle spans
	HeapReleased   uint64 `json:"heapReleased"`   // Bytes released to OS
	StackInuse     uint64 `json:"stackInuse"`     // Bytes in stack spans
	Goroutines     int    `json:"goroutines"`     // Number of goroutines
	NumGC          uint32 `json:"numGC"`          // Number of completed GC cycles
	LastGCPauseNs  uint64 `json:"lastGCPauseNs"`  // Duration of last GC pause in nanoseconds
	TotalAllocated uint64 `json:"totalAllocated"` // Total bytes allocated (cumulative)
	Sys            uint64 `json:"sys"`            // Total bytes obtained from system

	// Connection stats
	ActiveConnections int `json:"activeConnections"` // Number of active MongoDB connections

	// Uptime
	UptimeSeconds int64 `json:"uptimeSeconds"` // App uptime in seconds

	// Timestamp
	Timestamp string `json:"timestamp"` // When metrics were collected
}

// Service provides performance metrics collection
type Service struct {
	state     *core.AppState
	startTime time.Time
}

// NewService creates a new performance metrics service
func NewService(state *core.AppState) *Service {
	return &Service{
		state:     state,
		startTime: time.Now(),
	}
}

// GetMetrics returns current performance metrics
func (s *Service) GetMetrics() *Metrics {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	// Get last GC pause duration
	var lastGCPause uint64
	if memStats.NumGC > 0 {
		// PauseNs is a circular buffer of recent GC pause times
		lastGCPause = memStats.PauseNs[(memStats.NumGC+255)%256]
	}

	// Count active connections
	activeConnections := 0
	if s.state != nil {
		s.state.Mu.RLock()
		activeConnections = len(s.state.Clients)
		s.state.Mu.RUnlock()
	}

	return &Metrics{
		HeapAlloc:         memStats.HeapAlloc,
		HeapSys:           memStats.HeapSys,
		HeapIdle:          memStats.HeapIdle,
		HeapInuse:         memStats.HeapInuse,
		HeapReleased:      memStats.HeapReleased,
		StackInuse:        memStats.StackInuse,
		Goroutines:        runtime.NumGoroutine(),
		NumGC:             memStats.NumGC,
		LastGCPauseNs:     lastGCPause,
		TotalAllocated:    memStats.TotalAlloc,
		Sys:               memStats.Sys,
		ActiveConnections: activeConnections,
		UptimeSeconds:     int64(time.Since(s.startTime).Seconds()),
		Timestamp:         time.Now().Format(time.RFC3339),
	}
}

// ForceGC triggers a garbage collection (for debugging/testing)
func (s *Service) ForceGC() {
	runtime.GC()
}
