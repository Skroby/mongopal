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
      <label className="block text-sm font-medium text-zinc-300">
        Generated Connection URI
      </label>
      <div className="relative">
        <input
          type="text"
          value={uri}
          readOnly
          className="w-full px-3 py-2 pr-20 bg-zinc-800 border border-zinc-700 rounded-md text-white font-mono text-sm"
          data-testid="generated-uri"
        />
        <button
          onClick={handleCopy}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
