import { useState } from 'react';

interface URIDisplayProps {
  uri: string;
}

export function URIDisplay({ uri }: URIDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-text-secondary">
        Generated Connection URI
      </label>
      <div className="relative">
        <input
          type="text"
          value={uri}
          readOnly
          className="w-full px-3 py-2 pr-20 bg-surface border border-border rounded-md text-text font-mono text-sm"
          data-testid="generated-uri"
        />
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-surface-hover hover:bg-surface-active text-text text-xs rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
