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
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Export Encrypted Connection</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          &ldquo;{connectionName}&rdquo; encrypted successfully. Share the bundle and key via <strong className="text-zinc-300">separate channels</strong>.
        </p>

        {/* Encrypted Bundle */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Encrypted Bundle</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-400 font-mono text-xs break-all max-h-24 overflow-y-auto cursor-text select-all"
          >
            {bundle}
          </div>
          <button
            onClick={() => handleCopy(bundle, setBundleCopied)}
            className="px-2.5 py-1 text-xs border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-white rounded transition-colors"
          >
            {bundleCopied ? 'Copied!' : 'Copy Bundle'}
          </button>
        </div>

        {/* Decryption Key */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Decryption Key</label>
          <div
            onClick={selectAll}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white font-mono text-sm tracking-wide cursor-text select-all"
          >
            {decryptionKey}
          </div>
          <button
            onClick={() => handleCopy(decryptionKey, setKeyCopied)}
            className="px-2.5 py-1 text-xs border border-zinc-600 hover:border-zinc-500 text-zinc-300 hover:text-white rounded transition-colors"
          >
            {keyCopied ? 'Copied!' : 'Copy Key'}
          </button>
        </div>

        {/* Warning */}
        <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          Anyone with both the bundle and key can access this connection with full credentials. Send them through separate channels.
        </p>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded-md transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
