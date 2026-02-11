package export

import (
	"bufio"
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/peternagy/mongopal/internal/types"
)

// stripURIDatabase removes the database path from a MongoDB URI to avoid
// conflicts with --db flags. e.g. "mongodb://host:27017/admin?..." becomes
// "mongodb://host:27017/?...". This is needed because mongodump/mongorestore
// reject URIs that specify a database when --db is also provided.
func stripURIDatabase(uri string) string {
	parsed, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	// mongodb+srv:// URIs also work with url.Parse
	if parsed.Path != "" && parsed.Path != "/" {
		parsed.Path = "/"
	}
	return parsed.String()
}

// mongodump/mongorestore progress line patterns.
var (
	reDumpDone        = regexp.MustCompile(`done dumping (\S+?)\.(\S+) \((\d+) documents?\)`)
	reRestoreDone     = regexp.MustCompile(`finished restoring (\S+?)\.(\S+) \((\d+) document\S* (\d+) failure`)
	reRestoreSum      = regexp.MustCompile(`(\d+) document\(s\) restored successfully`)
	reRestoreFailed   = regexp.MustCompile(`(\d+) document\(s\) failed to restore`)
	reContinueError   = regexp.MustCompile(`continuing through error:`)
	reArchivePrelude  = regexp.MustCompile(`archive prelude (\S+?)\.(\S+)`)
)

const toolDownloadURL = "https://www.mongodb.com/try/download/database-tools"

// CheckMongodumpAvailable checks if mongodump is on PATH. Returns (available, path).
func CheckMongodumpAvailable() (bool, string) {
	if path, err := exec.LookPath("mongodump"); err == nil {
		return true, path
	}
	return false, ""
}

// CheckMongorestoreAvailable checks if mongorestore is on PATH. Returns (available, path).
func CheckMongorestoreAvailable() (bool, string) {
	if path, err := exec.LookPath("mongorestore"); err == nil {
		return true, path
	}
	return false, ""
}

// getToolVersion runs `<tool> --version` and returns the first line of output.
func getToolVersion(toolPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, toolPath, "--version").CombinedOutput()
	if err != nil {
		return ""
	}
	// First non-empty line
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			return line
		}
	}
	return ""
}

// CheckToolAvailability returns availability of all external BSON CLI tools.
func CheckToolAvailability() *types.ToolAvailability {
	result := &types.ToolAvailability{}

	if ok, path := CheckMongodumpAvailable(); ok {
		result.Mongodump = true
		result.MongodumpVersion = getToolVersion(path)
	}
	if ok, path := CheckMongorestoreAvailable(); ok {
		result.Mongorestore = true
		result.MongorestoreVersion = getToolVersion(path)
	}

	return result
}

// GetBSONImportDirPath opens a native directory dialog for selecting a mongodump output directory.
func (s *Service) GetBSONImportDirPath() (string, error) {
	selected, err := runtime.OpenDirectoryDialog(s.state.Ctx, runtime.OpenDialogOptions{
		Title: "Select Directory to Restore",
	})
	if err != nil {
		return "", fmt.Errorf("failed to open directory dialog: %w", err)
	}
	return selected, nil
}

// ScanImportDir lists all files in a directory with their sizes.
func ScanImportDir(dirPath string) ([]types.ImportDirEntry, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	var result []types.ImportDirEntry
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		result = append(result, types.ImportDirEntry{
			Name: e.Name(),
			Size: info.Size(),
		})
	}
	return result, nil
}

// PreviewArchive runs mongorestore --dryRun --verbose on an archive file and parses
// "archive prelude db.coll" lines to discover databases and collections inside.
// Requires a valid connection URI because mongorestore connects to the server even in dry-run mode.
func (s *Service) PreviewArchive(connID, archivePath string) (*types.ArchivePreview, error) {
	available, toolPath := CheckMongorestoreAvailable()
	if !available {
		return nil, fmt.Errorf("mongorestore not found. Install MongoDB Database Tools: %s", toolDownloadURL)
	}

	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection URI: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	args := []string{
		"--uri=" + uri,
		"--archive=" + archivePath,
		"--gzip",
		"--dryRun",
		"--verbose",
	}

	cmd := exec.CommandContext(ctx, toolPath, args...)

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start mongorestore: %w", err)
	}

	// Parse "archive prelude db.coll" lines emitted by --verbose.
	// These come from the archive header and list every namespace.
	dbMap := make(map[string]*types.ArchivePreviewDatabase)
	var dbOrder []string
	// Track seen collections to avoid duplicates (prelude may list bson + metadata entries)
	seenColls := make(map[string]struct{})
	var stderrLines []string

	done := make(chan error, 1)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			stderrLines = append(stderrLines, line)
			if len(stderrLines) > 20 {
				stderrLines = stderrLines[1:]
			}

			if matches := reArchivePrelude.FindStringSubmatch(line); len(matches) >= 3 {
				dbName := matches[1]
				collName := matches[2]
				key := dbName + "." + collName
				if _, seen := seenColls[key]; seen {
					continue
				}
				seenColls[key] = struct{}{}

				if _, ok := dbMap[dbName]; !ok {
					dbMap[dbName] = &types.ArchivePreviewDatabase{
						Name:        dbName,
						Collections: []types.ArchivePreviewCollection{},
					}
					dbOrder = append(dbOrder, dbName)
				}
				dbMap[dbName].Collections = append(dbMap[dbName].Collections, types.ArchivePreviewCollection{
					Name: collName,
				})
			}
		}
		done <- scanner.Err()
	}()

	waitErr := cmd.Wait()
	<-done

	// If mongorestore failed and we got no results, return the error
	if waitErr != nil && len(dbOrder) == 0 {
		if len(stderrLines) > 0 {
			return nil, fmt.Errorf("mongorestore preview failed: %s", strings.Join(stderrLines, "\n"))
		}
		return nil, fmt.Errorf("mongorestore preview failed: %w", waitErr)
	}

	// Build ordered result
	result := &types.ArchivePreview{
		Databases: make([]types.ArchivePreviewDatabase, 0, len(dbOrder)),
	}
	for _, name := range dbOrder {
		result.Databases = append(result.Databases, *dbMap[name])
	}

	return result, nil
}

// ExportWithMongodump exports databases/collections using the mongodump CLI.
// Uses --archive=<file> to write directly to disk with zero memory buffering.
//   - Single target (one DB, one collection, or full dump): produces a single .archive file
//   - Multi-DB selective: creates a directory containing one .archive per database
func (s *Service) ExportWithMongodump(connID string, opts types.MongodumpOptions) error {
	available, toolPath := CheckMongodumpAvailable()
	if !available {
		return fmt.Errorf("mongodump not found. Install MongoDB Database Tools: %s", toolDownloadURL)
	}

	// Get connection URI
	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return err
	}

	// Determine output path
	filePath := opts.OutputPath
	if filePath == "" {
		selected, err := runtime.SaveFileDialog(s.state.Ctx, runtime.SaveDialogOptions{
			DefaultFilename: "mongodump-export.archive",
			Title:           "Save mongodump Export",
		})
		if err != nil {
			return fmt.Errorf("failed to open save dialog: %w", err)
		}
		if selected == "" {
			s.state.EmitEvent("export:cancelled", nil)
			return nil
		}
		filePath = selected
	}

	// Build the list of dump invocations.
	type dumpJob struct {
		db                 string
		collection         string
		excludeCollections []string
	}

	var jobs []dumpJob

	if len(opts.DatabaseCollections) > 0 {
		// Multi-DB partial selection: each database gets its own job with exclusions
		for db, excluded := range opts.DatabaseCollections {
			jobs = append(jobs, dumpJob{db: db, excludeCollections: excluded})
		}
	} else if opts.Database != "" && len(opts.ExcludeCollections) > 0 {
		// Single job with --excludeCollection flags → one archive
		jobs = append(jobs, dumpJob{db: opts.Database, excludeCollections: opts.ExcludeCollections})
	} else if opts.Database != "" && len(opts.Collections) > 0 {
		for _, coll := range opts.Collections {
			jobs = append(jobs, dumpJob{db: opts.Database, collection: coll})
		}
	} else if opts.Database != "" {
		jobs = append(jobs, dumpJob{db: opts.Database})
	} else if len(opts.Databases) > 0 {
		for _, db := range opts.Databases {
			jobs = append(jobs, dumpJob{db: db})
		}
	} else {
		jobs = append(jobs, dumpJob{})
	}

	// Create cancellable context
	exportID := fmt.Sprintf("bson-%s-%d", connID, time.Now().UnixNano())
	exportCtx, exportCancel := context.WithCancel(context.Background())
	s.state.SetExportCancel(exportID, exportCancel)
	s.state.ResetExportPause()
	defer s.state.ClearExportCancel(exportID)
	defer s.state.ResetExportPause()

	totalJobs := len(jobs)

	// Multi-DB: create a directory with one .archive per DB.
	// Single target: write directly to a single .archive file.
	multiDB := len(jobs) > 1
	if multiDB {
		// Strip any file extension from filePath to use as directory name
		dirPath := filePath
		for _, ext := range []string{".archive", ".gz"} {
			if strings.HasSuffix(strings.ToLower(dirPath), ext) {
				dirPath = dirPath[:len(dirPath)-len(ext)]
				break
			}
		}
		filePath = dirPath

		if err := os.MkdirAll(filePath, 0755); err != nil {
			return fmt.Errorf("failed to create output directory: %w", err)
		}
	} else {
		// Ensure .archive extension for single target
		if !strings.HasSuffix(strings.ToLower(filePath), ".archive") {
			filePath += ".archive"
		}
	}

	cleanupExport := func() {
		if multiDB {
			os.RemoveAll(filePath)
		} else {
			os.Remove(filePath)
		}
	}

	for jobIdx, job := range jobs {
		// Check cancellation between jobs
		select {
		case <-exportCtx.Done():
			cleanupExport()
			s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
			return fmt.Errorf("export cancelled")
		default:
		}

		// Determine the archive file path for this job
		var archivePath string
		if multiDB {
			if job.collection != "" {
				archivePath = filepath.Join(filePath, job.db+"."+job.collection+".archive")
			} else {
				archivePath = filepath.Join(filePath, job.db+".archive")
			}
		} else {
			archivePath = filePath
		}

		// Build args — use --archive=<file> + --gzip for direct file write
		connURI := uri
		if job.db != "" {
			connURI = stripURIDatabase(uri)
		}
		args := []string{
			"--uri=" + connURI,
			"--archive=" + archivePath,
			"--gzip",
		}
		if job.db != "" {
			args = append(args, "--db="+job.db)
		}
		if job.collection != "" {
			args = append(args, "--collection="+job.collection)
		}
		for _, excl := range job.excludeCollections {
			args = append(args, "--excludeCollection="+excl)
		}

		// Emit progress
		s.state.EmitEvent("export:progress", types.ExportProgress{
			ExportID:      exportID,
			Phase:         "exporting",
			Database:      job.db,
			Collection:    job.collection,
			Current:       int64(jobIdx),
			Total:         -1,
			DatabaseIndex: jobIdx + 1,
			DatabaseTotal: totalJobs,
		})

		cmd := exec.CommandContext(exportCtx, toolPath, args...)

		// Capture stderr for progress parsing
		stderrPipe, err := cmd.StderrPipe()
		if err != nil {
			return fmt.Errorf("failed to create stderr pipe: %w", err)
		}

		if err := cmd.Start(); err != nil {
			return fmt.Errorf("failed to start mongodump: %w", err)
		}

		var stderrLines []string
		done := make(chan struct{})
		go func() {
			defer close(done)
			scanner := bufio.NewScanner(stderrPipe)
			for scanner.Scan() {
				line := scanner.Text()
				stderrLines = append(stderrLines, line)
				if len(stderrLines) > 10 {
					stderrLines = stderrLines[1:]
				}
				if matches := reDumpDone.FindStringSubmatch(line); len(matches) >= 4 {
					s.state.EmitEvent("export:progress", types.ExportProgress{
						ExportID:      exportID,
						Phase:         "exporting",
						Database:      matches[1],
						Collection:    matches[2],
						Current:       0,
						Total:         -1,
						DatabaseIndex: jobIdx + 1,
						DatabaseTotal: totalJobs,
					})
				}
			}
		}()

		err = cmd.Wait()
		<-done

		if err != nil {
			select {
			case <-exportCtx.Done():
				cleanupExport()
				s.state.EmitEvent("export:cancelled", map[string]interface{}{"exportId": exportID})
				return fmt.Errorf("export cancelled")
			default:
			}
			if len(stderrLines) > 0 {
				return fmt.Errorf("mongodump failed: %s", strings.Join(stderrLines, "\n"))
			}
			return fmt.Errorf("mongodump failed: %w", err)
		}
	}

	s.state.EmitEvent("export:complete", map[string]interface{}{
		"exportId": exportID,
		"filePath": filePath,
	})
	return nil
}

// ImportWithMongorestore imports data using the mongorestore CLI.
// Supports three input types:
//   - Directory of .archive files: MongoPal multi-DB export (restores each .archive)
//   - Directory of BSON files: raw mongodump output (uses --dir)
//   - .archive: single mongodump archive file (uses --archive=<file> --gzip)
func (s *Service) ImportWithMongorestore(connID string, opts types.MongorestoreOptions) (*types.ImportResult, error) {
	available, toolPath := CheckMongorestoreAvailable()
	if !available {
		return nil, fmt.Errorf("mongorestore not found. Install MongoDB Database Tools: %s", toolDownloadURL)
	}

	// Get connection URI
	uri, err := s.connStore.GetConnectionURI(connID)
	if err != nil {
		return nil, err
	}

	// Determine input path
	inputPath := opts.InputPath
	if inputPath == "" {
		return nil, fmt.Errorf("input path is required")
	}

	// Create cancellable context
	importCtx, importCancel := context.WithCancel(context.Background())
	s.state.SetImportCancel(importCancel)
	s.state.ResetImportPause()
	defer s.state.ClearImportCancel()
	defer s.state.ResetImportPause()

	// Detect input type and dispatch
	info, err := os.Stat(inputPath)
	if err != nil {
		return nil, fmt.Errorf("input path not accessible: %w", err)
	}

	if info.IsDir() {
		return s.restoreFromDir(importCtx, toolPath, uri, inputPath, opts)
	}
	// Single .archive file
	return s.restoreFromArchive(importCtx, toolPath, uri, inputPath, opts)
}

// dirContainsArchiveFiles checks if a directory contains .archive files.
func dirContainsArchiveFiles(dirPath string) bool {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".archive") {
			return true
		}
	}
	return false
}

// dirContainsGzipFiles checks if a directory (recursively) contains .gz files,
// indicating the mongodump output was created with --gzip.
// maxDepth limits recursion depth (default 5) to prevent unbounded traversal.
func dirContainsGzipFiles(dirPath string) bool {
	return dirContainsGzipFilesDepth(dirPath, 5)
}

func dirContainsGzipFilesDepth(dirPath string, maxDepth int) bool {
	if maxDepth <= 0 {
		return false
	}
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.IsDir() {
			// Skip symlinks to prevent cycles
			if e.Type()&os.ModeSymlink != 0 {
				continue
			}
			if dirContainsGzipFilesDepth(filepath.Join(dirPath, e.Name()), maxDepth-1) {
				return true
			}
			continue
		}
		if strings.HasSuffix(e.Name(), ".gz") {
			return true
		}
	}
	return false
}

// restoreFromDir restores from a directory. Detects whether it contains
// .archive files (MongoPal multi-DB export) or BSON files (raw mongodump).
func (s *Service) restoreFromDir(ctx context.Context, toolPath, uri, inputPath string, opts types.MongorestoreOptions) (*types.ImportResult, error) {
	if dirContainsArchiveFiles(inputPath) {
		return s.restoreFromArchiveDir(ctx, toolPath, uri, inputPath, opts)
	}

	// Raw mongodump directory — use --dir
	connURI := uri
	if opts.Database != "" {
		connURI = stripURIDatabase(uri)
	}
	args := []string{
		"--uri=" + connURI,
		"--dir=" + inputPath,
	}
	if opts.Database != "" {
		args = append(args, "--db="+opts.Database)
	}
	if opts.Collection != "" {
		args = append(args, "--collection="+opts.Collection)
	}
	if opts.Drop {
		args = append(args, "--drop")
	}
	// Auto-detect gzip: mongodump --gzip produces .bson.gz / .metadata.json.gz
	if dirContainsGzipFiles(inputPath) {
		args = append(args, "--gzip")
	}
	if opts.DryRun {
		args = append(args, "--dryRun")
	}

	return s.runMongorestore(ctx, toolPath, args)
}

// restoreFromArchiveDir restores from a directory of .archive files (MongoPal multi-DB export).
func (s *Service) restoreFromArchiveDir(ctx context.Context, toolPath, uri, dirPath string, opts types.MongorestoreOptions) (*types.ImportResult, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	// Build a set of selected files for fast lookup
	selectedFiles := make(map[string]struct{}, len(opts.Files))
	for _, f := range opts.Files {
		selectedFiles[f] = struct{}{}
	}

	combined := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
		Errors:    []string{},
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".archive") {
			continue
		}
		// If specific files were requested, skip those not in the set
		if len(selectedFiles) > 0 {
			if _, ok := selectedFiles[entry.Name()]; !ok {
				continue
			}
		}

		// Check cancellation between archives
		select {
		case <-ctx.Done():
			s.state.EmitEvent("import:cancelled", nil)
			return combined, fmt.Errorf("import cancelled")
		default:
		}

		archivePath := filepath.Join(dirPath, entry.Name())
		result, err := s.restoreFromArchive(ctx, toolPath, uri, archivePath, opts)
		if err != nil {
			combined.Errors = append(combined.Errors, fmt.Sprintf("%s: %v", entry.Name(), err))
		}
		if result != nil {
			combined.DocumentsInserted += result.DocumentsInserted
			combined.DocumentsFailed += result.DocumentsFailed
			combined.Databases = append(combined.Databases, result.Databases...)
			combined.Errors = append(combined.Errors, result.Errors...)
		}
	}

	s.state.EmitEvent("import:complete", map[string]interface{}{
		"documentsInserted": combined.DocumentsInserted,
		"documentsFailed":   combined.DocumentsFailed,
	})
	return combined, nil
}

// restoreFromArchive restores from a single .archive file using --archive=<file> --gzip.
func (s *Service) restoreFromArchive(ctx context.Context, toolPath, uri, archivePath string, opts types.MongorestoreOptions) (*types.ImportResult, error) {
	connURI := uri
	if opts.Database != "" {
		connURI = stripURIDatabase(uri)
	}
	args := []string{
		"--uri=" + connURI,
		"--archive=" + archivePath,
		"--gzip",
	}
	if opts.Database != "" {
		args = append(args, "--db="+opts.Database)
	}
	if opts.Collection != "" {
		args = append(args, "--collection="+opts.Collection)
	}
	if opts.Drop {
		args = append(args, "--drop")
	}
	if opts.DryRun {
		args = append(args, "--dryRun")
	}
	for _, ns := range opts.NsInclude {
		args = append(args, "--nsInclude="+ns)
	}

	return s.runMongorestore(ctx, toolPath, args)
}

// runMongorestore executes a single mongorestore command, parsing stderr for progress.
func (s *Service) runMongorestore(ctx context.Context, toolPath string, args []string) (*types.ImportResult, error) {
	s.state.EmitEvent("import:progress", types.ExportProgress{
		Phase:   "importing",
		Current: 0,
		Total:   -1,
	})

	cmd := exec.CommandContext(ctx, toolPath, args...)

	// Capture stderr for progress parsing
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start mongorestore: %w", err)
	}

	// Parse stderr for progress
	result := &types.ImportResult{
		Databases: []types.DatabaseImportResult{},
		Errors:    []string{},
	}

	// Track per-database results
	dbResults := make(map[string]*types.DatabaseImportResult)
	var stderrLines []string
	// Deduplicate "continuing through error" lines — keep unique messages only
	seenErrors := make(map[string]struct{})

	done := make(chan error, 1)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			// Keep last 10 lines for error context
			stderrLines = append(stderrLines, line)
			if len(stderrLines) > 10 {
				stderrLines = stderrLines[1:]
			}

			// Parse "finished restoring db.coll (N documents, M failures)"
			if matches := reRestoreDone.FindStringSubmatch(line); len(matches) >= 5 {
				dbName := matches[1]
				collName := matches[2]
				var docCount, failCount int64
				fmt.Sscanf(matches[3], "%d", &docCount)
				fmt.Sscanf(matches[4], "%d", &failCount)

				if _, ok := dbResults[dbName]; !ok {
					dbResults[dbName] = &types.DatabaseImportResult{
						Name:        dbName,
						Collections: []types.CollectionImportResult{},
					}
				}
				dbResults[dbName].Collections = append(dbResults[dbName].Collections, types.CollectionImportResult{
					Name:              collName,
					DocumentsInserted: docCount,
				})
				result.DocumentsInserted += docCount
				result.DocumentsFailed += failCount

				s.state.EmitEvent("import:progress", types.ExportProgress{
					Phase:      "importing",
					Database:   dbName,
					Collection: collName,
					Current:    docCount,
					Total:      -1,
				})
			}

			// Parse summary line "N document(s) restored successfully"
			if matches := reRestoreSum.FindStringSubmatch(line); len(matches) >= 2 {
				fmt.Sscanf(matches[1], "%d", &result.DocumentsInserted)
			}
			// Parse summary line "N document(s) failed to restore"
			if matches := reRestoreFailed.FindStringSubmatch(line); len(matches) >= 2 {
				fmt.Sscanf(matches[1], "%d", &result.DocumentsFailed)
			}

			// Capture errors from stderr — deduplicate repetitive lines
			if reContinueError.MatchString(line) || strings.Contains(line, "Failed") {
				// For "continuing through error" lines, extract the core error message
				if _, seen := seenErrors[line]; !seen {
					seenErrors[line] = struct{}{}
					result.Errors = append(result.Errors, line)
				}
			}
		}
		done <- scanner.Err()
	}()

	waitErr := cmd.Wait()
	scanErr := <-done

	// Build final database results
	for _, dbr := range dbResults {
		result.Databases = append(result.Databases, *dbr)
	}

	if waitErr != nil {
		// Check if it was cancelled
		select {
		case <-ctx.Done():
			s.state.EmitEvent("import:cancelled", nil)
			return result, fmt.Errorf("import cancelled")
		default:
		}
		// Include stderr output for diagnosis
		if len(stderrLines) > 0 {
			return result, fmt.Errorf("mongorestore failed: %s", strings.Join(stderrLines, "\n"))
		}
		return result, fmt.Errorf("mongorestore failed: %w", waitErr)
	}

	if scanErr != nil {
		return result, fmt.Errorf("mongorestore stderr read error: %w", scanErr)
	}

	s.state.EmitEvent("import:complete", map[string]interface{}{
		"documentsInserted": result.DocumentsInserted,
	})
	return result, nil
}
