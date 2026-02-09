import React, { useState } from 'react';

interface ImportEncryptedOverlayProps {
  onImport: (bundleJSON: string, key: string) => Promise<void>;
  onClose: () => void;
}

export default function ImportEncryptedOverlay({
  onImport,
  onClose,
}: ImportEncryptedOverlayProps): React.ReactElement {
  const [bundle, setBundle] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setError(null);
    setImporting(true);
    try {
      await onImport(bundle.trim(), key.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Import Encrypted Connection</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Bundle input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Encrypted Bundle</label>
          <textarea
            value={bundle}
            onChange={e => { setBundle(e.target.value); setError(null); }}
            className="w-full h-24 px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder='Paste the encrypted bundle here'
            autoFocus
          />
        </div>

        {/* Key input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Decryption Key</label>
          <input
            type="text"
            value={key}
            onChange={e => { setKey(e.target.value); setError(null); }}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Paste the decryption key here"
          />
        </div>

        {error && (
          <p className="text-xs text-error">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!bundle.trim() || !key.trim() || importing}
            className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/80 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Decrypting...' : 'Decrypt & Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
