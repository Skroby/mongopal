import type { ConnectionFormData } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';
import { FieldWithError } from '../components/FieldWithError';

interface SafetyTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  onChange: (updates: Partial<ConnectionFormData>) => void;
}

export function SafetyTab({ data, errors, onChange }: SafetyTabProps) {
  const getError = (field: string) => errors.find(e => e.field === field && e.severity === 'error')?.message;

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-base font-semibold text-white mb-4">Destructive Operation Safety</h3>
      <div className="space-y-4">
        <FieldWithError
          label="Delay Before Destructive Operations"
          error={getError('destructiveDelay')}
          helpText="Countdown in seconds before drop/delete operations execute"
          required
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={10}
              value={data.destructiveDelay}
              onChange={e => onChange({ destructiveDelay: parseInt(e.target.value, 10) })}
              className="flex-1 accent-accent"
              id="field-destructiveDelay"
            />
            <div className="w-16 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-white text-center">
              {data.destructiveDelay}s
            </div>
          </div>
        </FieldWithError>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="requireDeleteConfirmation"
            checked={data.requireDeleteConfirmation}
            onChange={e => onChange({ requireDeleteConfirmation: e.target.checked })}
            className="mt-1 w-4 h-4 bg-zinc-800 border-zinc-700 rounded focus:ring-2 focus:ring-accent"
          />
          <div>
            <label htmlFor="requireDeleteConfirmation" className="text-sm text-zinc-300 block">
              Require typing "DELETE" to confirm destructive operations
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              Forces manual confirmation before dropping databases or collections
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
