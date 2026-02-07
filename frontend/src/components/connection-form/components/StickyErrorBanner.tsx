import type { ValidationError, TabId } from '../ConnectionFormTypes';

interface StickyErrorBannerProps {
  errors: ValidationError[];
  onJumpToError: (tabId: TabId, field: string) => void;
}

export function StickyErrorBanner({ errors, onJumpToError }: StickyErrorBannerProps) {
  const criticalErrors = errors.filter(e => e.severity === 'error');
  if (criticalErrors.length === 0) return null;

  const firstError = criticalErrors[0];

  return (
    <div className="sticky top-0 z-10 bg-red-900/90 border-b-2 border-red-500 px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-white">
            {criticalErrors.length} error{criticalErrors.length !== 1 && 's'} preventing save
          </span>
        </div>
        <button
          onClick={() => onJumpToError(firstError.tab, firstError.field)}
          className="text-sm text-red-200 hover:text-white underline"
        >
          Jump to first error
        </button>
      </div>
    </div>
  );
}
