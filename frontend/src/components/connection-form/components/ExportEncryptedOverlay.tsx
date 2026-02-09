import React, { useState } from 'react';

interface ExportEncryptedOverlayProps {
  bundle: string;
  decryptionKey: string;
  connectionName: string;
  onClose: () => void;
}

export default function ExportEncryptedOverlay({
  bundle,
  decryptionKey,
  connectionName,
  onClose,
}: ExportEncryptedOverlayProps): React.ReactElement {
  const [bundleCopied, setBundleCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const selectAll = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(e.currentTarget);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-background text-text border border-border rounded-lg shadow-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Export Encrypted Connection</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg leading-none">
            ✕
          </button>
        </div>

        <p className="text-xs text-text-muted">
          &ldquo;{connectionName}&rdquo; encrypted successfully. Share the bundle and key via <strong className="text-text-secondary">separate channels</strong>.
        </p>

        {/* Encrypted Bundle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Encrypted Bundle</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text-muted font-mono text-xs break-all max-h-24 overflow-y-auto cursor-text select-all"
          >
            {bundle}
          </div>
          <button
            onClick={() => handleCopy(bundle, setBundleCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {bundleCopied ? 'Copied!' : 'Copy Bundle'}
          </button>
        </div>

        {/* Decryption Key */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">Decryption Key</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text font-mono text-sm tracking-wide cursor-text select-all"
          >
            {decryptionKey}
          </div>
          <button
            onClick={() => handleCopy(decryptionKey, setKeyCopied)}
            className="px-2.5 py-1 text-xs border border-border-light hover:border-border-hover text-text-secondary hover:text-text rounded transition-colors"
          >
            {keyCopied ? 'Copied!' : 'Copy Key'}
          </button>
        </div>

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
    </div>
  );
}
