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
    <div className="border-t border-border p-4 bg-surface/50">
      <div className="flex items-center gap-2 mb-2">
        {errorCount > 0 && (
          <span className="text-sm font-medium text-error">
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
            className="block w-full text-left text-xs hover:bg-surface-hover/50 px-2 py-1 rounded transition-colors"
          >
            <span className={error.severity === 'error' ? 'text-error' : 'text-yellow-400'}>
              {error.tab}:
            </span>
            <span className="text-text-secondary ml-1">{error.message}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
