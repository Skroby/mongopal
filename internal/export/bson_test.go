package export

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// =============================================================================
// Tool Availability Tests
// =============================================================================

func TestCheckMongodumpAvailable(t *testing.T) {
	// Just verify it returns without panicking. We can't guarantee the tool
	// is installed, so we only assert on the return type contract.
	available, path := CheckMongodumpAvailable()

	if available && path == "" {
		t.Error("available is true but path is empty")
	}
	if !available && path != "" {
		t.Error("available is false but path is non-empty")
	}
}

func TestCheckMongorestoreAvailable(t *testing.T) {
	available, path := CheckMongorestoreAvailable()

	if available && path == "" {
		t.Error("available is true but path is empty")
	}
	if !available && path != "" {
		t.Error("available is false but path is non-empty")
	}
}

func TestCheckToolAvailability(t *testing.T) {
	result := CheckToolAvailability()

	if result == nil {
		t.Fatal("expected non-nil ToolAvailability, got nil")
	}

	// If mongodump is available, version should be populated
	if result.Mongodump && result.MongodumpVersion == "" {
		// Version could be empty if --version fails, so just log it
		t.Log("mongodump available but version is empty (may be expected)")
	}

	// If mongorestore is available, version should be populated
	if result.Mongorestore && result.MongorestoreVersion == "" {
		t.Log("mongorestore available but version is empty (may be expected)")
	}

	// Cross-check consistency with individual functions
	dumpOK, _ := CheckMongodumpAvailable()
	restoreOK, _ := CheckMongorestoreAvailable()

	if result.Mongodump != dumpOK {
		t.Errorf("CheckToolAvailability.Mongodump=%v but CheckMongodumpAvailable=%v", result.Mongodump, dumpOK)
	}
	if result.Mongorestore != restoreOK {
		t.Errorf("CheckToolAvailability.Mongorestore=%v but CheckMongorestoreAvailable=%v", result.Mongorestore, restoreOK)
	}
}

// =============================================================================
// getToolVersion Tests
// =============================================================================

func TestGetToolVersion_NonexistentTool(t *testing.T) {
	// A tool path that doesn't exist should return empty string
	version := getToolVersion("/nonexistent/path/to/tool")
	if version != "" {
		t.Errorf("expected empty version for nonexistent tool, got: %q", version)
	}
}

// =============================================================================
// Regex Pattern Tests — reDumpDone
// =============================================================================

func TestReDumpDone(t *testing.T) {
	tests := []struct {
		name       string
		line       string
		wantMatch  bool
		wantDB     string
		wantColl   string
		wantCount  string
	}{
		{
			name:      "single document",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping test.users (1 document)",
			wantMatch: true,
			wantDB:    "test",
			wantColl:  "users",
			wantCount: "1",
		},
		{
			name:      "multiple documents",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping test.users (100 documents)",
			wantMatch: true,
			wantDB:    "test",
			wantColl:  "users",
			wantCount: "100",
		},
		{
			name:      "large count",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping mydb.orders (123456 documents)",
			wantMatch: true,
			wantDB:    "mydb",
			wantColl:  "orders",
			wantCount: "123456",
		},
		{
			name:      "database with dashes",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping my-db.my-coll (50 documents)",
			wantMatch: true,
			wantDB:    "my-db",
			wantColl:  "my-coll",
			wantCount: "50",
		},
		{
			name:      "unrelated line",
			line:      "2024-01-01T12:00:00.000+0000\twriting test.users to",
			wantMatch: false,
		},
		{
			name:      "empty string",
			line:      "",
			wantMatch: false,
		},
		{
			name:      "progress line",
			line:      "2024-01-01T12:00:00.000+0000\tdumping test.users",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reDumpDone.FindStringSubmatch(tt.line)
			if tt.wantMatch {
				if len(matches) < 4 {
					t.Fatalf("expected match with at least 4 groups, got %d groups: %v", len(matches), matches)
				}
				if matches[1] != tt.wantDB {
					t.Errorf("database: got %q, want %q", matches[1], tt.wantDB)
				}
				if matches[2] != tt.wantColl {
					t.Errorf("collection: got %q, want %q", matches[2], tt.wantColl)
				}
				if matches[3] != tt.wantCount {
					t.Errorf("count: got %q, want %q", matches[3], tt.wantCount)
				}
			} else {
				if len(matches) >= 4 {
					t.Errorf("expected no match, but got: %v", matches)
				}
			}
		})
	}
}

// =============================================================================
// Regex Pattern Tests — reRestoreDone
// =============================================================================

func TestReRestoreDone(t *testing.T) {
	tests := []struct {
		name         string
		line         string
		wantMatch    bool
		wantDB       string
		wantColl     string
		wantCount    string
		wantFailures string
	}{
		{
			name:         "basic restore done",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring test.users (100 documents, 0 failures)",
			wantMatch:    true,
			wantDB:       "test",
			wantColl:     "users",
			wantCount:    "100",
			wantFailures: "0",
		},
		{
			name:         "single document",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring test.users (1 document, 0 failures)",
			wantMatch:    true,
			wantDB:       "test",
			wantColl:     "users",
			wantCount:    "1",
			wantFailures: "0",
		},
		{
			name:         "with failures",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring test.users (95 documents, 5 failures)",
			wantMatch:    true,
			wantDB:       "test",
			wantColl:     "users",
			wantCount:    "95",
			wantFailures: "5",
		},
		{
			name:         "large count",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring mydb.orders (999999 documents, 0 failures)",
			wantMatch:    true,
			wantDB:       "mydb",
			wantColl:     "orders",
			wantCount:    "999999",
			wantFailures: "0",
		},
		{
			name:      "unrelated line",
			line:      "2024-01-01T12:00:00.000+0000\trestoring test.users from dump",
			wantMatch: false,
		},
		{
			name:      "empty string",
			line:      "",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reRestoreDone.FindStringSubmatch(tt.line)
			if tt.wantMatch {
				if len(matches) < 5 {
					t.Fatalf("expected match with at least 5 groups, got %d groups: %v", len(matches), matches)
				}
				if matches[1] != tt.wantDB {
					t.Errorf("database: got %q, want %q", matches[1], tt.wantDB)
				}
				if matches[2] != tt.wantColl {
					t.Errorf("collection: got %q, want %q", matches[2], tt.wantColl)
				}
				if matches[3] != tt.wantCount {
					t.Errorf("count: got %q, want %q", matches[3], tt.wantCount)
				}
				if matches[4] != tt.wantFailures {
					t.Errorf("failures: got %q, want %q", matches[4], tt.wantFailures)
				}
			} else {
				if len(matches) >= 5 {
					t.Errorf("expected no match, but got: %v", matches)
				}
			}
		})
	}
}

// =============================================================================
// Regex Pattern Tests — reRestoreSum
// =============================================================================

func TestReRestoreSum(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantMatch bool
		wantCount string
	}{
		{
			name:      "basic summary",
			line:      "2024-01-01T12:00:00.000+0000\t100 document(s) restored successfully. 0 document(s) failed to restore.",
			wantMatch: true,
			wantCount: "100",
		},
		{
			name:      "single document",
			line:      "1 document(s) restored successfully",
			wantMatch: true,
			wantCount: "1",
		},
		{
			name:      "large count",
			line:      "500000 document(s) restored successfully",
			wantMatch: true,
			wantCount: "500000",
		},
		{
			name:      "unrelated line",
			line:      "2024-01-01T12:00:00.000+0000\tfinished restoring test.users",
			wantMatch: false,
		},
		{
			name:      "empty string",
			line:      "",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reRestoreSum.FindStringSubmatch(tt.line)
			if tt.wantMatch {
				if len(matches) < 2 {
					t.Fatalf("expected match with at least 2 groups, got %d groups: %v", len(matches), matches)
				}
				if matches[1] != tt.wantCount {
					t.Errorf("count: got %q, want %q", matches[1], tt.wantCount)
				}
			} else {
				if len(matches) >= 2 {
					t.Errorf("expected no match, but got: %v", matches)
				}
			}
		})
	}
}

// =============================================================================
// Regex Pattern Tests — reRestoreFailed
// =============================================================================

func TestReRestoreFailed(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantMatch bool
		wantCount string
	}{
		{
			name:      "basic failure summary",
			line:      "2024-01-01T12:00:00.000+0000\t5 document(s) failed to restore.",
			wantMatch: true,
			wantCount: "5",
		},
		{
			name:      "zero failures",
			line:      "0 document(s) failed to restore.",
			wantMatch: true,
			wantCount: "0",
		},
		{
			name:      "unrelated line",
			line:      "2024-01-01T12:00:00.000+0000\tfinished restoring test.users",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reRestoreFailed.FindStringSubmatch(tt.line)
			if tt.wantMatch {
				if len(matches) < 2 {
					t.Fatalf("expected match with at least 2 groups, got %d groups: %v", len(matches), matches)
				}
				if matches[1] != tt.wantCount {
					t.Errorf("count: got %q, want %q", matches[1], tt.wantCount)
				}
			} else {
				if len(matches) >= 2 {
					t.Errorf("expected no match, but got: %v", matches)
				}
			}
		})
	}
}

// =============================================================================
// Regex Pattern Tests — reContinueError
// =============================================================================

func TestReContinueError(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantMatch bool
	}{
		{
			name:      "duplicate key error",
			line:      `2026-02-11T00:39:06.761+0000	continuing through error: E11000 duplicate key error collection: test_largedocs.mixed_types index: _id_ dup key: { _id: ObjectId('69897a6cd96026e7312913e1') }`,
			wantMatch: true,
		},
		{
			name:      "unrelated line",
			line:      "2024-01-01T12:00:00.000+0000\tfinished restoring test.users",
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matched := reContinueError.MatchString(tt.line)
			if matched != tt.wantMatch {
				t.Errorf("reContinueError.MatchString(%q) = %v, want %v", tt.line, matched, tt.wantMatch)
			}
		})
	}
}

// =============================================================================
// Inline Arg Building Tests
// =============================================================================

func TestBuildMongodumpArgs(t *testing.T) {
	// Replicates the arg-building logic from ExportWithMongodump.
	// Uses --archive=<path> --gzip for direct file write (zero memory buffering).
	buildArgs := func(uri, archivePath, db, collection string) []string {
		args := []string{
			"--uri=" + uri,
			"--archive=" + archivePath,
			"--gzip",
		}
		if db != "" {
			args = append(args, "--db="+db)
		}
		if collection != "" {
			args = append(args, "--collection="+collection)
		}
		return args
	}

	tests := []struct {
		name        string
		uri         string
		archivePath string
		db          string
		collection  string
		wantArgs    []string
	}{
		{
			name:        "basic URI only (full dump)",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/export.archive",
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/export.archive", "--gzip"},
		},
		{
			name:        "with database filter",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/testdb.archive",
			db:          "testdb",
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/testdb.archive", "--gzip", "--db=testdb"},
		},
		{
			name:        "with database and collection",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/testdb.archive",
			db:          "testdb",
			collection:  "users",
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/testdb.archive", "--gzip", "--db=testdb", "--collection=users"},
		},
		{
			name:        "full dump with credentials",
			uri:         "mongodb://user:pass@host:27017/?authSource=admin",
			archivePath: "/tmp/full.archive",
			wantArgs:    []string{"--uri=mongodb://user:pass@host:27017/?authSource=admin", "--archive=/tmp/full.archive", "--gzip"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args := buildArgs(tt.uri, tt.archivePath, tt.db, tt.collection)
			if len(args) != len(tt.wantArgs) {
				t.Fatalf("arg count: got %d, want %d\n  got:  %v\n  want: %v", len(args), len(tt.wantArgs), args, tt.wantArgs)
			}
			for i := range args {
				if args[i] != tt.wantArgs[i] {
					t.Errorf("arg[%d]: got %q, want %q", i, args[i], tt.wantArgs[i])
				}
			}
		})
	}
}

func TestBuildMongorestoreArgs_Dir(t *testing.T) {
	// Replicate the arg-building logic from restoreFromDir
	buildArgs := func(uri, inputPath, db, collection string, drop, gzipFlag, dryRun bool) []string {
		args := []string{
			"--uri=" + uri,
			"--dir=" + inputPath,
		}
		if db != "" {
			args = append(args, "--db="+db)
		}
		if collection != "" {
			args = append(args, "--collection="+collection)
		}
		if drop {
			args = append(args, "--drop")
		}
		if gzipFlag {
			args = append(args, "--gzip")
		}
		if dryRun {
			args = append(args, "--dryRun")
		}
		return args
	}

	tests := []struct {
		name       string
		uri        string
		inputPath  string
		db         string
		collection string
		drop       bool
		gzipFlag   bool
		dryRun     bool
		wantArgs   []string
	}{
		{
			name:      "basic URI and input path",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump"},
		},
		{
			name:      "with database override",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			db:        "targetdb",
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--db=targetdb"},
		},
		{
			name:       "with collection",
			uri:        "mongodb://localhost:27017",
			inputPath:  "/tmp/dump",
			db:         "testdb",
			collection: "users",
			wantArgs:   []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--db=testdb", "--collection=users"},
		},
		{
			name:      "with drop flag",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			drop:      true,
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--drop"},
		},
		{
			name:      "with gzip",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			gzipFlag:  true,
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--gzip"},
		},
		{
			name:      "with dryRun",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			dryRun:    true,
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--dryRun"},
		},
		{
			name:      "all flags combined",
			uri:       "mongodb://localhost:27017",
			inputPath: "/tmp/dump",
			db:        "mydb",
			drop:      true,
			gzipFlag:  true,
			dryRun:    true,
			wantArgs:  []string{"--uri=mongodb://localhost:27017", "--dir=/tmp/dump", "--db=mydb", "--drop", "--gzip", "--dryRun"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args := buildArgs(tt.uri, tt.inputPath, tt.db, tt.collection, tt.drop, tt.gzipFlag, tt.dryRun)
			if len(args) != len(tt.wantArgs) {
				t.Fatalf("arg count: got %d, want %d\n  got:  %v\n  want: %v", len(args), len(tt.wantArgs), args, tt.wantArgs)
			}
			for i := range args {
				if args[i] != tt.wantArgs[i] {
					t.Errorf("arg[%d]: got %q, want %q", i, args[i], tt.wantArgs[i])
				}
			}
		})
	}
}

func TestBuildMongorestoreArgs_Archive(t *testing.T) {
	// Replicates the arg-building logic from restoreFromArchive.
	// Uses --archive=<file> --gzip (mongorestore reads file directly).
	buildArgs := func(uri, archivePath, db, collection string, drop, dryRun bool) []string {
		args := []string{
			"--uri=" + uri,
			"--archive=" + archivePath,
			"--gzip",
		}
		if db != "" {
			args = append(args, "--db="+db)
		}
		if collection != "" {
			args = append(args, "--collection="+collection)
		}
		if drop {
			args = append(args, "--drop")
		}
		if dryRun {
			args = append(args, "--dryRun")
		}
		return args
	}

	tests := []struct {
		name        string
		uri         string
		archivePath string
		db          string
		collection  string
		drop        bool
		dryRun      bool
		wantArgs    []string
	}{
		{
			name:        "basic archive restore",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/dump.archive",
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/dump.archive", "--gzip"},
		},
		{
			name:        "archive with database override",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/dump.archive",
			db:          "targetdb",
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/dump.archive", "--gzip", "--db=targetdb"},
		},
		{
			name:        "archive with drop",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/dump.archive",
			drop:        true,
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/dump.archive", "--gzip", "--drop"},
		},
		{
			name:        "archive with all flags",
			uri:         "mongodb://localhost:27017",
			archivePath: "/tmp/dump.archive",
			db:          "mydb",
			drop:        true,
			dryRun:      true,
			wantArgs:    []string{"--uri=mongodb://localhost:27017", "--archive=/tmp/dump.archive", "--gzip", "--db=mydb", "--drop", "--dryRun"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args := buildArgs(tt.uri, tt.archivePath, tt.db, tt.collection, tt.drop, tt.dryRun)
			if len(args) != len(tt.wantArgs) {
				t.Fatalf("arg count: got %d, want %d\n  got:  %v\n  want: %v", len(args), len(tt.wantArgs), args, tt.wantArgs)
			}
			for i := range args {
				if args[i] != tt.wantArgs[i] {
					t.Errorf("arg[%d]: got %q, want %q", i, args[i], tt.wantArgs[i])
				}
			}
		})
	}
}

// =============================================================================
// Mongodump Job Construction Tests
// =============================================================================

func TestMongodumpJobConstruction(t *testing.T) {
	// The ExportWithMongodump function constructs jobs from the options.
	// We test this logic independently.
	type dumpJob struct {
		db         string
		collection string
	}

	buildJobs := func(database string, databases []string, collections []string) []dumpJob {
		var jobs []dumpJob
		if database != "" && len(collections) > 0 {
			for _, coll := range collections {
				jobs = append(jobs, dumpJob{db: database, collection: coll})
			}
		} else if database != "" {
			jobs = append(jobs, dumpJob{db: database})
		} else if len(databases) > 0 {
			for _, db := range databases {
				jobs = append(jobs, dumpJob{db: db})
			}
		} else {
			jobs = append(jobs, dumpJob{})
		}
		return jobs
	}

	t.Run("single database", func(t *testing.T) {
		jobs := buildJobs("testdb", nil, nil)
		if len(jobs) != 1 {
			t.Fatalf("expected 1 job, got %d", len(jobs))
		}
		if jobs[0].db != "testdb" || jobs[0].collection != "" {
			t.Errorf("unexpected job: %+v", jobs[0])
		}
	})

	t.Run("single database with collections", func(t *testing.T) {
		jobs := buildJobs("testdb", nil, []string{"users", "orders", "logs"})
		if len(jobs) != 3 {
			t.Fatalf("expected 3 jobs, got %d", len(jobs))
		}
		for i, coll := range []string{"users", "orders", "logs"} {
			if jobs[i].db != "testdb" {
				t.Errorf("job[%d] db: got %q, want %q", i, jobs[i].db, "testdb")
			}
			if jobs[i].collection != coll {
				t.Errorf("job[%d] collection: got %q, want %q", i, jobs[i].collection, coll)
			}
		}
	})

	t.Run("multiple databases", func(t *testing.T) {
		jobs := buildJobs("", []string{"db1", "db2", "db3"}, nil)
		if len(jobs) != 3 {
			t.Fatalf("expected 3 jobs, got %d", len(jobs))
		}
		for i, db := range []string{"db1", "db2", "db3"} {
			if jobs[i].db != db {
				t.Errorf("job[%d] db: got %q, want %q", i, jobs[i].db, db)
			}
			if jobs[i].collection != "" {
				t.Errorf("job[%d] collection: expected empty, got %q", i, jobs[i].collection)
			}
		}
	})

	t.Run("full dump (no db filter)", func(t *testing.T) {
		jobs := buildJobs("", nil, nil)
		if len(jobs) != 1 {
			t.Fatalf("expected 1 job, got %d", len(jobs))
		}
		if jobs[0].db != "" || jobs[0].collection != "" {
			t.Errorf("expected empty job for full dump, got: %+v", jobs[0])
		}
	})

	t.Run("database takes priority over databases when collections set", func(t *testing.T) {
		// When Database is set with Collections, Databases field is ignored
		jobs := buildJobs("primary", []string{"secondary"}, []string{"coll1"})
		if len(jobs) != 1 {
			t.Fatalf("expected 1 job, got %d", len(jobs))
		}
		if jobs[0].db != "primary" || jobs[0].collection != "coll1" {
			t.Errorf("unexpected job: %+v", jobs[0])
		}
	})
}

// =============================================================================
// ScanImportDir Tests
// =============================================================================

func TestScanImportDir(t *testing.T) {
	t.Run("lists files with sizes", func(t *testing.T) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "db1.archive"), []byte("aaaa"), 0644)
		os.WriteFile(filepath.Join(dir, "db2.archive"), []byte("bb"), 0644)
		os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("hello"), 0644)

		entries, err := ScanImportDir(dir)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(entries) != 3 {
			t.Fatalf("expected 3 entries, got %d", len(entries))
		}

		// Build a map for easier lookup
		m := make(map[string]int64)
		for _, e := range entries {
			m[e.Name] = e.Size
		}
		if m["db1.archive"] != 4 {
			t.Errorf("db1.archive size: got %d, want 4", m["db1.archive"])
		}
		if m["db2.archive"] != 2 {
			t.Errorf("db2.archive size: got %d, want 2", m["db2.archive"])
		}
		if m["readme.txt"] != 5 {
			t.Errorf("readme.txt size: got %d, want 5", m["readme.txt"])
		}
	})

	t.Run("skips directories", func(t *testing.T) {
		dir := t.TempDir()
		os.MkdirAll(filepath.Join(dir, "subdir"), 0755)
		os.WriteFile(filepath.Join(dir, "file.archive"), []byte("x"), 0644)

		entries, err := ScanImportDir(dir)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(entries) != 1 {
			t.Fatalf("expected 1 entry, got %d", len(entries))
		}
		if entries[0].Name != "file.archive" {
			t.Errorf("expected file.archive, got %s", entries[0].Name)
		}
	})

	t.Run("empty directory", func(t *testing.T) {
		dir := t.TempDir()
		entries, err := ScanImportDir(dir)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(entries) != 0 {
			t.Errorf("expected 0 entries, got %d", len(entries))
		}
	})

	t.Run("nonexistent directory", func(t *testing.T) {
		_, err := ScanImportDir("/nonexistent/path/xyz")
		if err == nil {
			t.Error("expected error for nonexistent directory")
		}
	})
}

// =============================================================================
// dirContainsArchiveFiles Tests
// =============================================================================

func TestDirContainsArchiveFiles(t *testing.T) {
	t.Run("directory with archive files", func(t *testing.T) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "db1.archive"), []byte("test"), 0644)
		os.WriteFile(filepath.Join(dir, "db2.archive"), []byte("test"), 0644)

		if !dirContainsArchiveFiles(dir) {
			t.Error("expected true for directory with .archive files")
		}
	})

	t.Run("directory with BSON files only", func(t *testing.T) {
		dir := t.TempDir()
		subdir := filepath.Join(dir, "testdb")
		os.MkdirAll(subdir, 0755)
		os.WriteFile(filepath.Join(subdir, "users.bson"), []byte("test"), 0644)

		if dirContainsArchiveFiles(dir) {
			t.Error("expected false for directory with only BSON files in subdirectories")
		}
	})

	t.Run("empty directory", func(t *testing.T) {
		dir := t.TempDir()

		if dirContainsArchiveFiles(dir) {
			t.Error("expected false for empty directory")
		}
	})

	t.Run("mixed files", func(t *testing.T) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "db1.archive"), []byte("test"), 0644)
		os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("test"), 0644)

		if !dirContainsArchiveFiles(dir) {
			t.Error("expected true for directory with at least one .archive file")
		}
	})

	t.Run("nonexistent directory", func(t *testing.T) {
		if dirContainsArchiveFiles("/nonexistent/path") {
			t.Error("expected false for nonexistent directory")
		}
	})
}

// =============================================================================
// Constants and Config Tests
// =============================================================================

func TestStripURIDatabase(t *testing.T) {
	tests := []struct {
		name     string
		uri      string
		expected string
	}{
		{
			name:     "URI with database",
			uri:      "mongodb://localhost:27017/admin",
			expected: "mongodb://localhost:27017/",
		},
		{
			name:     "URI with database and query params",
			uri:      "mongodb://localhost:27017/mydb?authSource=admin&retryWrites=true",
			expected: "mongodb://localhost:27017/?authSource=admin&retryWrites=true",
		},
		{
			name:     "URI without database",
			uri:      "mongodb://localhost:27017/",
			expected: "mongodb://localhost:27017/",
		},
		{
			name:     "URI without trailing slash",
			uri:      "mongodb://localhost:27017",
			expected: "mongodb://localhost:27017",
		},
		{
			name:     "SRV URI with database",
			uri:      "mongodb+srv://user:pass@cluster.example.com/testdb?retryWrites=true",
			expected: "mongodb+srv://user:pass@cluster.example.com/?retryWrites=true",
		},
		{
			name:     "URI with credentials and database",
			uri:      "mongodb://user:p%40ss@host:27017/admin",
			expected: "mongodb://user:p%40ss@host:27017/",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := stripURIDatabase(tt.uri)
			if result != tt.expected {
				t.Errorf("stripURIDatabase(%q) = %q, want %q", tt.uri, result, tt.expected)
			}
		})
	}
}

func TestToolDownloadURL(t *testing.T) {
	if toolDownloadURL == "" {
		t.Error("toolDownloadURL should not be empty")
	}
	if toolDownloadURL != "https://www.mongodb.com/try/download/database-tools" {
		t.Errorf("unexpected download URL: %q", toolDownloadURL)
	}
}

// =============================================================================
// dirContainsGzipFiles Tests
// =============================================================================

func TestDirContainsGzipFiles(t *testing.T) {
	t.Run("directory with .gz files", func(t *testing.T) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "data.bson.gz"), []byte("gzip data"), 0644)

		if !dirContainsGzipFiles(dir) {
			t.Error("expected true for directory with .gz files")
		}
	})

	t.Run("directory without .gz files", func(t *testing.T) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "data.bson"), []byte("bson data"), 0644)

		if dirContainsGzipFiles(dir) {
			t.Error("expected false for directory without .gz files")
		}
	})

	t.Run("nested directory with .gz files", func(t *testing.T) {
		dir := t.TempDir()
		subdir := filepath.Join(dir, "mydb")
		os.MkdirAll(subdir, 0755)
		os.WriteFile(filepath.Join(subdir, "users.bson.gz"), []byte("gzip data"), 0644)

		if !dirContainsGzipFiles(dir) {
			t.Error("expected true for nested directory with .gz files")
		}
	})

	t.Run("empty directory", func(t *testing.T) {
		dir := t.TempDir()

		if dirContainsGzipFiles(dir) {
			t.Error("expected false for empty directory")
		}
	})

	t.Run("deeply nested beyond max depth", func(t *testing.T) {
		dir := t.TempDir()
		// Create a chain of 7 nested directories (exceeding maxDepth of 5)
		current := dir
		for i := 0; i < 7; i++ {
			current = filepath.Join(current, fmt.Sprintf("level%d", i))
			os.MkdirAll(current, 0755)
		}
		os.WriteFile(filepath.Join(current, "deep.bson.gz"), []byte("gzip data"), 0644)

		if dirContainsGzipFiles(dir) {
			t.Error("expected false when .gz files are beyond max depth")
		}
	})

	t.Run("nonexistent directory", func(t *testing.T) {
		if dirContainsGzipFiles("/nonexistent/path") {
			t.Error("expected false for nonexistent directory")
		}
	})
}

// =============================================================================
// Non-greedy regex tests for dotted collection names
// =============================================================================

func TestReDumpDone_DottedCollectionName(t *testing.T) {
	tests := []struct {
		name      string
		line      string
		wantDB    string
		wantColl  string
		wantCount string
	}{
		{
			name:      "dotted collection name",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping mydb.my.collection (50 documents)",
			wantDB:    "mydb",
			wantColl:  "my.collection",
			wantCount: "50",
		},
		{
			name:      "double-dotted collection name",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping mydb.a.b.c (10 documents)",
			wantDB:    "mydb",
			wantColl:  "a.b.c",
			wantCount: "10",
		},
		{
			name:      "simple db.coll",
			line:      "2024-01-01T12:00:00.000+0000\tdone dumping test.users (100 documents)",
			wantDB:    "test",
			wantColl:  "users",
			wantCount: "100",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reDumpDone.FindStringSubmatch(tt.line)
			if len(matches) < 4 {
				t.Fatalf("expected match with at least 4 groups, got %d groups: %v", len(matches), matches)
			}
			if matches[1] != tt.wantDB {
				t.Errorf("database: got %q, want %q", matches[1], tt.wantDB)
			}
			if matches[2] != tt.wantColl {
				t.Errorf("collection: got %q, want %q", matches[2], tt.wantColl)
			}
			if matches[3] != tt.wantCount {
				t.Errorf("count: got %q, want %q", matches[3], tt.wantCount)
			}
		})
	}
}

func TestReRestoreDone_DottedCollectionName(t *testing.T) {
	tests := []struct {
		name         string
		line         string
		wantDB       string
		wantColl     string
		wantCount    string
		wantFailures string
	}{
		{
			name:         "dotted collection name",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring mydb.my.collection (50 documents, 0 failures)",
			wantDB:       "mydb",
			wantColl:     "my.collection",
			wantCount:    "50",
			wantFailures: "0",
		},
		{
			name:         "simple db.coll",
			line:         "2024-01-01T12:00:00.000+0000\tfinished restoring test.users (100 documents, 2 failures)",
			wantDB:       "test",
			wantColl:     "users",
			wantCount:    "100",
			wantFailures: "2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reRestoreDone.FindStringSubmatch(tt.line)
			if len(matches) < 5 {
				t.Fatalf("expected match with at least 5 groups, got %d groups: %v", len(matches), matches)
			}
			if matches[1] != tt.wantDB {
				t.Errorf("database: got %q, want %q", matches[1], tt.wantDB)
			}
			if matches[2] != tt.wantColl {
				t.Errorf("collection: got %q, want %q", matches[2], tt.wantColl)
			}
			if matches[3] != tt.wantCount {
				t.Errorf("count: got %q, want %q", matches[3], tt.wantCount)
			}
			if matches[4] != tt.wantFailures {
				t.Errorf("failures: got %q, want %q", matches[4], tt.wantFailures)
			}
		})
	}
}

func TestReArchivePrelude(t *testing.T) {
	tests := []struct {
		name     string
		line     string
		wantDB   string
		wantColl string
		match    bool
	}{
		{
			name:     "basic prelude",
			line:     "2026-02-11T12:10:16.448+0000\tarchive prelude test_largedocs.many_documents",
			wantDB:   "test_largedocs",
			wantColl: "many_documents",
			match:    true,
		},
		{
			name:     "prelude with dotted collection",
			line:     "2026-02-11T12:10:16.448+0000\tarchive prelude mydb.system.profile",
			wantDB:   "mydb",
			wantColl: "system.profile",
			match:    true,
		},
		{
			name:  "unrelated line",
			line:  "2026-02-11T12:10:16.448+0000\tpreparing collections to restore from",
			match: false,
		},
		{
			name:  "empty string",
			line:  "",
			match: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matches := reArchivePrelude.FindStringSubmatch(tt.line)
			if tt.match {
				if len(matches) < 3 {
					t.Fatalf("expected match with at least 3 groups, got %d groups: %v", len(matches), matches)
				}
				if matches[1] != tt.wantDB {
					t.Errorf("database: got %q, want %q", matches[1], tt.wantDB)
				}
				if matches[2] != tt.wantColl {
					t.Errorf("collection: got %q, want %q", matches[2], tt.wantColl)
				}
			} else {
				if len(matches) > 0 {
					t.Errorf("expected no match, got %v", matches)
				}
			}
		})
	}
}
