import React, { useState, useEffect } from 'react';
import { generateURIFromForm, parseMultiURIText, stripVendorParams } from '../ConnectionFormURIUtils';
import { DEFAULT_FORM_DATA } from '../ConnectionFormTypes';
import type { ConnectionFormData } from '../ConnectionFormTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportProps {
  mode: 'export';
  connectionId: string;
  connectionName: string;
  onClose: () => void;
}

interface ImportProps {
  mode: 'import';
  /** Called after a successful import (URI or encrypted). */
  onImported: () => void;
  onClose: () => void;
}

interface BulkExportConnection {
  id: string;
  name: string;
  folderId?: string;
}

interface BulkExportFolder {
  id: string;
  name: string;
  parentId?: string;
}

interface BulkExportProps {
  mode: 'bulk-export';
  connections: BulkExportConnection[];
  folders: BulkExportFolder[];
  onClose: () => void;
}

export type ConnectionShareOverlayProps = ExportProps | ImportProps | BulkExportProps;

// ---------------------------------------------------------------------------
// Go bindings facade
// ---------------------------------------------------------------------------

interface GoBindings {
  GetExtendedConnection?: (connId: string) => Promise<{
    formData?: string;
    mongoUri?: string;
    mongoPassword?: string;
    [k: string]: unknown;
  }>;
  ExportEncryptedConnection?: (connId: string) => Promise<{ bundle: string; key: string }>;
  ExportEncryptedConnections?: (connIds: string[]) => Promise<{
    version: number;
    connections: Array<{ name: string; bundle: string }>;
    key: string;
  }>;
  DecryptConnectionImport?: (bundleJSON: string, key: string) => Promise<string>;
  SaveExtendedConnection?: (conn: unknown) => Promise<void>;
  AuthenticateForPasswordReveal?: () => Promise<void>;
}

const getGo = (): GoBindings | undefined =>
  window.go?.main?.App as GoBindings | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const selectAll = (e: React.MouseEvent<HTMLDivElement>) => {
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(e.currentTarget);
  sel?.removeAllRanges();
  sel?.addRange(range);
};

const copyToClipboard = async (
  text: string,
  setCopied: (v: boolean) => void,
) => {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // clipboard unavailable
  }
};

// ---------------------------------------------------------------------------
// Export Section
// ---------------------------------------------------------------------------

function ExportSection({
  connectionId,
  onClose,
}: {
  connectionId: string;
  onClose: () => void;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [bundle, setBundle] = useState<string | null>(null);
  const [decryptionKey, setDecryptionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uriCopied, setUriCopied] = useState(false);
  const [bundleCopied, setBundleCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const go = getGo();
      if (!go?.GetExtendedConnection || !go?.ExportEncryptedConnection) {
        setError('Backend bindings not available');
        setLoading(false);
        return;
      }

      try {
        // Load connection & build URI in parallel with encrypted export
        const [extConn, encResult] = await Promise.all([
          go.GetExtendedConnection(connectionId),
          go.ExportEncryptedConnection(connectionId),
        ]);

        if (cancelled) return;

        // Build URI from stored form data
        let builtUri = '';
        if (extConn.formData) {
          try {
            const fd = JSON.parse(extConn.formData) as ConnectionFormData;
            builtUri = generateURIFromForm(fd, { includeCredentials: true });
          } catch {
            // fallback to stored mongoUri
          }
        }
        if (!builtUri && extConn.mongoUri) {
          builtUri = extConn.mongoUri;
        }

        setUri(builtUri || null);
        setBundle(encResult.bundle);
        setDecryptionKey(encResult.key);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [connectionId]);

  if (loading) {
    return (
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M12 2a10 10 0 019.5 6.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
          Loading connection data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-5">
        <p className="text-sm text-error">{error}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface-active text-text rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {/* Connection String */}
      {uri && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Connection String</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-secondary font-mono text-xs break-all max-h-20 overflow-y-auto cursor-text select-all"
          >
            {uri}
          </div>
          <button
            onClick={() => copyToClipboard(uri, setUriCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {uriCopied ? 'Copied!' : 'Copy URI'}
          </button>
        </div>
      )}

      {/* Divider */}
      {uri && <div className="border-t border-dashed border-border" />}

      {/* Encrypted Bundle */}
      {bundle && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Encrypted Bundle</label>
          <p className="text-xs text-text-dim">Full config including SSH, TLS, and proxy credentials.</p>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-muted font-mono text-xs break-all max-h-24 overflow-y-auto cursor-text select-all"
          >
            {bundle}
          </div>
          <button
            onClick={() => copyToClipboard(bundle, setBundleCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {bundleCopied ? 'Copied!' : 'Copy Bundle'}
          </button>
        </div>
      )}

      {/* Decryption Key */}
      {decryptionKey && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Decryption Key</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-sm tracking-wide cursor-text select-all"
          >
            {decryptionKey}
          </div>
          <button
            onClick={() => copyToClipboard(decryptionKey, setKeyCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {keyCopied ? 'Copied!' : 'Copy Key'}
          </button>
        </div>
      )}

      {/* Warning */}
      <p className="text-xs text-warning/80 bg-warning/10 border border-warning/20 rounded px-3 py-2">
        Anyone with both the bundle and key can access this connection with full credentials. Send them through separate channels.
      </p>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface-active text-text rounded-md transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Section
// ---------------------------------------------------------------------------

interface ImportResult {
  total: number;
  succeeded: number;
  results: Array<{ name: string; ok: boolean; error?: string }>;
}

function ImportSection({
  onImported,
  onClose,
}: {
  onImported: () => void;
  onClose: () => void;
}) {
  // URI import
  const [uriText, setUriText] = useState('');
  const [uriError, setUriError] = useState<string | null>(null);
  const [uriImporting, setUriImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Encrypted import
  const [bundle, setBundle] = useState('');
  const [key, setKey] = useState('');
  const [encError, setEncError] = useState<string | null>(null);
  const [encImporting, setEncImporting] = useState(false);
  const [encImportResult, setEncImportResult] = useState<ImportResult | null>(null);

  const handleURIImport = async () => {
    const trimmedText = uriText.trim();
    if (!trimmedText) return;
    setUriError(null);
    setImportResult(null);
    setUriImporting(true);

    try {
      const entries = parseMultiURIText(trimmedText);
      if (entries.length === 0) {
        setUriError('No valid MongoDB URIs found in the input');
        return;
      }

      const go = getGo();
      if (!go?.SaveExtendedConnection) throw new Error('Backend bindings not available');

      // Single URI — same behavior as before (immediate success/error)
      if (entries.length === 1) {
        const { uri, parsed, connectionName } = entries[0];
        const cleanUri = stripVendorParams(uri);
        const formData: ConnectionFormData = {
          ...DEFAULT_FORM_DATA,
          ...parsed,
          id: crypto.randomUUID(),
          name: connectionName || deriveNameFromURI(uri),
        };
        const extConn = buildExtendedConnection(formData, cleanUri);
        await go.SaveExtendedConnection(extConn);
        onImported();
        return;
      }

      // Multiple URIs — import all, collect results
      const results: ImportResult['results'] = [];
      for (const { uri, parsed, connectionName } of entries) {
        const name = connectionName || deriveNameFromURI(uri);
        try {
          const cleanUri = stripVendorParams(uri);
          const formData: ConnectionFormData = {
            ...DEFAULT_FORM_DATA,
            ...parsed,
            id: crypto.randomUUID(),
            name,
          };
          const extConn = buildExtendedConnection(formData, cleanUri);
          await go.SaveExtendedConnection(extConn);
          results.push({ name, ok: true });
        } catch (err) {
          results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }

      const succeeded = results.filter(r => r.ok).length;
      setImportResult({ total: entries.length, succeeded, results });

      // If at least one succeeded, notify parent
      if (succeeded > 0) {
        onImported();
      }
    } catch (err) {
      setUriError(err instanceof Error ? err.message : String(err));
    } finally {
      setUriImporting(false);
    }
  };

  const handleEncryptedImport = async () => {
    setEncError(null);
    setEncImporting(true);
    setEncImportResult(null);

    try {
      const go = getGo();
      if (!go?.DecryptConnectionImport || !go?.SaveExtendedConnection) {
        throw new Error('Backend bindings not available');
      }

      const trimmedBundle = bundle.trim();
      const trimmedKey = key.trim();

      // Detect multi-connection bundle format: { version: 1, connections: [...] }
      let parsed: { version?: number; connections?: Array<{ name: string; bundle: string }> } | null = null;
      try {
        const obj = JSON.parse(trimmedBundle);
        if (obj && obj.version === 1 && Array.isArray(obj.connections)) {
          parsed = obj;
        }
      } catch { /* not JSON or not bulk format — treat as single bundle */ }

      if (parsed?.connections && parsed.connections.length > 0) {
        // Multi-connection import: parse keys from "Name: key" lines
        const keyMap = new Map<string, string>();
        for (const line of trimmedKey.split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0) {
            const name = line.substring(0, colonIdx).trim();
            const k = line.substring(colonIdx + 1).trim();
            if (name && k) keyMap.set(name, k);
          }
        }

        // If only one key provided and multiple connections, treat it as a shared key
        const singleKey = keyMap.size === 0 ? trimmedKey : null;

        const results: ImportResult['results'] = [];
        for (const conn of parsed.connections) {
          const connKey = singleKey || keyMap.get(conn.name);
          if (!connKey) {
            results.push({ name: conn.name, ok: false, error: 'No matching decryption key found' });
            continue;
          }
          try {
            const decrypted = await go.DecryptConnectionImport(conn.bundle, connKey);
            const connData = JSON.parse(decrypted);
            await go.SaveExtendedConnection(connData);
            results.push({ name: conn.name, ok: true });
          } catch (err) {
            results.push({ name: conn.name, ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }

        const succeeded = results.filter(r => r.ok).length;
        setEncImportResult({ total: parsed.connections.length, succeeded, results });
        if (succeeded > 0) onImported();
      } else {
        // Single bundle import (original behavior)
        const decrypted = await go.DecryptConnectionImport(trimmedBundle, trimmedKey);
        const connData = JSON.parse(decrypted);
        await go.SaveExtendedConnection(connData);
        onImported();
      }
    } catch (err) {
      setEncError(err instanceof Error ? err.message : String(err));
    } finally {
      setEncImporting(false);
    }
  };

  return (
    <div className="space-y-4 p-5">
      {/* URI Import */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Connection String</label>
        <textarea
          value={uriText}
          onChange={e => { setUriText(e.target.value); setUriError(null); setImportResult(null); }}
          className={`w-full h-32 px-3 py-2 bg-surface border rounded-md text-text font-mono text-xs resize-none focus:outline-none focus:ring-2 ${
            uriError ? 'border-red-500 focus:ring-red-500' : 'border-border focus:ring-primary'
          }`}
          placeholder="mongodb://localhost:27017 or paste multiple URIs..."
          autoFocus
        />
        {uriError && <p className="text-xs text-error">{uriError}</p>}

        {/* Multi-URI import result summary */}
        {importResult && (
          <div className="text-xs bg-surface border border-border rounded-md p-3 space-y-1.5">
            <p className={`font-medium ${importResult.succeeded === importResult.total ? 'text-success' : 'text-warning'}`}>
              Imported {importResult.succeeded} of {importResult.total} connections
            </p>
            <ul className="space-y-0.5">
              {importResult.results.map((r, i) => (
                <li key={i} className={r.ok ? 'text-success' : 'text-error'}>
                  {r.ok ? '\u2713' : '\u2717'} {r.name}{r.error ? `: ${r.error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleURIImport}
          disabled={!uriText.trim() || uriImporting}
          className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/80 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uriImporting ? 'Importing...' : 'Import from URI'}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-border" />

      {/* Encrypted Import */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Encrypted Bundle</label>
        <textarea
          value={bundle}
          onChange={e => { setBundle(e.target.value); setEncError(null); setEncImportResult(null); }}
          className="w-full h-20 px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Paste a single bundle or a bulk export JSON..."
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Decryption Key(s)</label>
        <textarea
          value={key}
          onChange={e => { setKey(e.target.value); setEncError(null); setEncImportResult(null); }}
          rows={2}
          className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Single key, or one per line: Name: key"
        />
      </div>
      {encError && <p className="text-xs text-error">{encError}</p>}

      {/* Encrypted import result summary */}
      {encImportResult && (
        <div className="text-xs bg-surface border border-border rounded-md p-3 space-y-1.5">
          <p className={`font-medium ${encImportResult.succeeded === encImportResult.total ? 'text-success' : 'text-warning'}`}>
            Imported {encImportResult.succeeded} of {encImportResult.total} connections
          </p>
          <ul className="space-y-0.5">
            {encImportResult.results.map((r, i) => (
              <li key={i} className={r.ok ? 'text-success' : 'text-error'}>
                {r.ok ? '\u2713' : '\u2717'} {r.name}{r.error ? `: ${r.error}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={handleEncryptedImport}
        disabled={!bundle.trim() || !key.trim() || encImporting}
        className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/80 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {encImporting ? 'Decrypting...' : 'Decrypt & Import'}
      </button>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Export Section
// ---------------------------------------------------------------------------

type BulkExportFormat = 'encrypted' | 'uri-list';

function BulkExportSection({
  connections,
  folders,
  onClose,
}: {
  connections: BulkExportConnection[];
  folders: BulkExportFolder[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(connections.map(c => c.id)),
  );
  const [format, setFormat] = useState<BulkExportFormat>('encrypted');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<string | null>(null);
  const [decryptionKey, setDecryptionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const allSelected = selected.size === connections.length;
  const noneSelected = selected.size === 0;

  // Build folder tree for grouped display
  const folderMap = new Map(folders.map(f => [f.id, f]));
  const rootConns = connections.filter(c => !c.folderId);
  const connsByFolder = new Map<string, BulkExportConnection[]>();
  for (const c of connections) {
    if (c.folderId) {
      const list = connsByFolder.get(c.folderId) || [];
      list.push(c);
      connsByFolder.set(c.folderId, list);
    }
  }

  // Resolve full folder path (breadcrumb) for display
  const getFolderPath = (folderId: string): string => {
    const parts: string[] = [];
    let cur: string | undefined = folderId;
    while (cur) {
      const f = folderMap.get(cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parentId;
    }
    return parts.join(' / ');
  };

  // Collect folders that have connections (directly), sorted by path
  const foldersWithConns = [...connsByFolder.keys()]
    .map(fid => ({ id: fid, path: getFolderPath(fid) }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(connections.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    const selectedConns = connections.filter(c => selected.has(c.id));
    if (selectedConns.length === 0) return;

    const go = getGo();
    setExporting(true);
    setError(null);
    setProgress({ current: 0, total: selectedConns.length });

    try {
      if (format === 'encrypted') {
        if (!go?.ExportEncryptedConnections) {
          throw new Error('Backend bindings not available');
        }
        setProgress({ current: 0, total: 1 }); // single backend call
        const bulk = await go.ExportEncryptedConnections(selectedConns.map(c => c.id));
        setProgress({ current: 1, total: 1 });
        setResult(JSON.stringify({ version: 1, connections: bulk.connections }, null, 2));
        setDecryptionKey(bulk.key);
      } else {
        // URI list exposes credentials in plain text — require OS auth first
        if (!go?.GetExtendedConnection || !go?.AuthenticateForPasswordReveal) {
          throw new Error('Backend bindings not available');
        }
        await go.AuthenticateForPasswordReveal();

        const lines: string[] = [];
        for (let i = 0; i < selectedConns.length; i++) {
          setProgress({ current: i + 1, total: selectedConns.length });
          const ext = await go.GetExtendedConnection(selectedConns[i].id);
          let uri = '';
          if (ext.formData) {
            try {
              const fd = JSON.parse(ext.formData) as ConnectionFormData;
              uri = generateURIFromForm(fd, { includeCredentials: true });
            } catch { /* fallback */ }
          }
          if (!uri && ext.mongoUri) uri = ext.mongoUri;
          if (i > 0) lines.push('');
          lines.push(`// ${selectedConns[i].name}`);
          lines.push(uri || '// (no URI available)');
        }
        setResult(lines.join('\n'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  // Phase 2 — results
  if (result !== null) {
    const selectedCount = connections.filter(c => selected.has(c.id)).length;
    return (
      <div className="space-y-4 p-5">
        <p className="text-sm text-text-secondary">
          Exported {selectedCount} connection{selectedCount !== 1 ? 's' : ''}
        </p>

        {/* Bundle or URI list */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">
            {format === 'encrypted' ? 'Encrypted Bundle' : 'URI List'}
          </label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-muted font-mono text-xs break-all max-h-48 overflow-y-auto cursor-text select-all whitespace-pre-wrap"
          >
            {result}
          </div>
          <button
            onClick={() => copyToClipboard(result, setCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {copied ? 'Copied!' : format === 'encrypted' ? 'Copy Bundle' : 'Copy to Clipboard'}
          </button>
        </div>

        {/* Decryption key (encrypted format only) */}
        {decryptionKey && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Decryption Key</label>
            <div
              onClick={selectAll}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-sm tracking-wide cursor-text select-all"
            >
              {decryptionKey}
            </div>
            <button
              onClick={() => copyToClipboard(decryptionKey, setKeyCopied)}
              className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
            >
              {keyCopied ? 'Copied!' : 'Copy Key'}
            </button>
          </div>
        )}

        <p className="text-xs text-warning/80 bg-warning/10 border border-warning/20 rounded px-3 py-2">
          {format === 'encrypted'
            ? 'Anyone with both the bundle and key can access these connections. Send them through separate channels.'
            : 'URIs contain credentials in plain text. Share securely.'}
        </p>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface-active text-text rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Phase 1 — selection
  return (
    <div className="space-y-4 p-5">
      {/* Format picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Format</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
            <input
              type="radio"
              name="bulk-export-format"
              checked={format === 'encrypted'}
              onChange={() => setFormat('encrypted')}
              className="accent-primary"
            />
            Encrypted Bundle
          </label>
          <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
            <input
              type="radio"
              name="bulk-export-format"
              checked={format === 'uri-list'}
              onChange={() => setFormat('uri-list')}
              className="accent-primary"
            />
            URI List
          </label>
        </div>
      </div>

      {/* Connection list */}
      <div className="space-y-1.5">
        <label
          className="flex items-center gap-1.5 text-xs font-medium text-text-secondary cursor-pointer"
          onClick={toggleAll}
        >
          <input
            type="checkbox"
            checked={allSelected}
            readOnly
            className="accent-primary"
          />
          Select All ({connections.length} connection{connections.length !== 1 ? 's' : ''})
        </label>

        <div className="border border-border rounded-md max-h-48 overflow-y-auto">
          {/* Root (unfiled) connections */}
          {rootConns.map(conn => (
            <label
              key={conn.id}
              className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface cursor-pointer border-b border-border/50 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={selected.has(conn.id)}
                onChange={() => toggleOne(conn.id)}
                className="accent-primary"
              />
              {conn.name}
            </label>
          ))}

          {/* Folder groups */}
          {foldersWithConns.map(({ id: fid, path }) => {
            const conns = connsByFolder.get(fid) || [];
            return (
              <div key={fid}>
                <div className="px-3 py-1.5 text-xs font-medium text-text-dim bg-surface/50 border-b border-border/50 flex items-center gap-1.5">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                  {path}
                </div>
                {conns.map(conn => (
                  <label
                    key={conn.id}
                    className="flex items-center gap-2 pl-6 pr-3 py-2 text-sm text-text-secondary hover:bg-surface cursor-pointer border-b border-border/50 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(conn.id)}
                      onChange={() => toggleOne(conn.id)}
                      className="accent-primary"
                    />
                    {conn.name}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {exporting && (
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M12 2a10 10 0 019.5 6.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
          Exporting {progress.current} of {progress.total}...
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleExport}
          disabled={noneSelected || exporting}
          className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/80 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? 'Exporting...' : `Export ${selected.size}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveNameFromURI(uri: string, connectionName?: string): string {
  if (connectionName) return connectionName;
  try {
    const protocol = uri.startsWith('mongodb+srv://') ? 'mongodb+srv://' : 'mongodb://';
    const withoutProtocol = uri.substring(protocol.length);
    const atIndex = withoutProtocol.indexOf('@');
    const hostPart = atIndex >= 0 ? withoutProtocol.substring(atIndex + 1) : withoutProtocol;
    const host = hostPart.split('/')[0].split(',')[0].split(':')[0];
    return host || 'Imported Connection';
  } catch {
    return 'Imported Connection';
  }
}

function buildExtendedConnection(formData: ConnectionFormData, mongoUri: string) {
  return {
    id: formData.id,
    name: formData.name,
    folderId: formData.folderId || '',
    color: formData.color || '#4CC38A',
    readOnly: formData.readOnly || false,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date(0).toISOString(),
    mongoUri,
    mongoPassword: formData.password || '',
    sshEnabled: formData.sshEnabled || false,
    sshHost: formData.sshHost || '',
    sshPort: formData.sshPort || 22,
    sshUser: formData.sshUser || '',
    sshPassword: formData.sshPassword || '',
    sshPrivateKey: formData.sshPrivateKey || '',
    sshPassphrase: formData.sshPassphrase || '',
    tlsEnabled: formData.tlsEnabled || false,
    tlsInsecure: formData.tlsInsecure || false,
    tlsCAFile: formData.tlsCACert || '',
    tlsCertFile: formData.tlsClientCert || '',
    tlsKeyFile: formData.tlsClientKey || '',
    tlsKeyPassword: formData.tlsClientKeyPassword || '',
    socks5Enabled: formData.socks5Enabled || false,
    socks5Host: formData.socks5Host || '',
    socks5Port: formData.socks5Port || 1080,
    socks5User: formData.socks5User || '',
    socks5Password: formData.socks5Password || '',
    destructiveDelay: formData.destructiveDelay || 0,
    requireDeleteConfirmation: formData.requireDeleteConfirmation || false,
    formData: JSON.stringify(formData),
  };
}

// ---------------------------------------------------------------------------
// Main Overlay
// ---------------------------------------------------------------------------

export default function ConnectionShareOverlay(
  props: ConnectionShareOverlayProps,
): React.ReactElement {
  const title =
    props.mode === 'export'
      ? `Export "${(props as ExportProps).connectionName}"`
      : props.mode === 'bulk-export'
        ? 'Export Connections'
        : 'Import Connection';

  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <h3 className="text-sm font-medium text-text">{title}</h3>
          <button
            onClick={props.onClose}
            className="text-text-muted hover:text-text text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {props.mode === 'export' ? (
            <ExportSection
              connectionId={(props as ExportProps).connectionId}
              onClose={props.onClose}
            />
          ) : props.mode === 'bulk-export' ? (
            <BulkExportSection
              connections={(props as BulkExportProps).connections}
              folders={(props as BulkExportProps).folders}
              onClose={props.onClose}
            />
          ) : (
            <ImportSection
              onImported={(props as ImportProps).onImported}
              onClose={props.onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
