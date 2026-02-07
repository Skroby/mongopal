import type { ValidationError, TabId } from '../ConnectionFormTypes';

interface ValidationSummaryProps {
  errors: ValidationError[];
  onJumpToError: (tabId: TabId, field: string) => void;
}

export function ValidationSummary({ errors, onJumpToError }: ValidationSummaryProps) {
  if (errors.length === 0) {
    return null;
  }

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;

  return (
    <div className="border-t border-zinc-700 p-4 bg-zinc-800/50">
      <div className="flex items-center gap-2 mb-2">
        {errorCount > 0 && (
          <span className="text-sm font-medium text-red-400">
            {errorCount} {errorCount === 1 ? 'error' : 'errors'}
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-sm font-medium text-yellow-400">
            {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
          </span>
        )}
      </div>
      <div className="space-y-1 max-h-24 overflow-y-auto">
        {errors.map((error, index) => (
          <button
            key={`${error.field}-${index}`}
            onClick={() => onJumpToError(error.tab, error.field)}
            className="block w-full text-left text-xs hover:bg-zinc-700/50 px-2 py-1 rounded transition-colors"
          >
            <span className={error.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}>
              {error.tab}:
            </span>
            <span className="text-zinc-300 ml-1">{error.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
