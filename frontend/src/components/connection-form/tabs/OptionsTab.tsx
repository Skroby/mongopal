import type { ConnectionFormData } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';
import { FieldWithError } from '../components/FieldWithError';

interface OptionsTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  onChange: (updates: Partial<ConnectionFormData>) => void;
  showAdvanced?: boolean;
}

export function OptionsTab({ data, errors, onChange, showAdvanced }: OptionsTabProps) {
  const getError = (field: string) => errors.find(e => e.field === field && e.severity === 'error')?.message;

  const compressorOptions = [
    { value: 'snappy', label: 'Snappy' },
    { value: 'zlib', label: 'Zlib' },
    { value: 'zstd', label: 'Zstandard' },
  ];

  const toggleCompressor = (compressor: string) => {
    const current = data.compressors || [];
    const updated = current.includes(compressor)
      ? current.filter(c => c !== compressor)
      : [...current, compressor];
    onChange({ compressors: updated });
  };

  return (
    <div className="space-y-4 p-4">
      {/* Info Banner */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-md">
        <p className="text-sm text-blue-300">
          These settings control MongoDB driver behavior. Default values work for most use cases.
        </p>
      </div>

      {/* Connection Pool */}
      <div className="border-b border-zinc-700 pb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Connection Pool</h3>
        <FieldWithError
          label="Max Pool Size"
          error={getError('maxPoolSize')}
          helpText="Maximum number of connections in the pool"
        >
          <select
            value={data.maxPoolSize}
            onChange={e => onChange({ maxPoolSize: parseInt(e.target.value, 10) })}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100 (default)</option>
            <option value={200}>200</option>
          </select>
        </FieldWithError>
      </div>

      {/* Write Operations */}
      <div className="border-b border-zinc-700 pb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Write Operations</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="retryWrites"
              checked={data.retryWrites}
              onChange={e => onChange({ retryWrites: e.target.checked })}
              className="w-4 h-4 bg-zinc-800 border-zinc-700 rounded focus:ring-2 focus:ring-accent"
            />
            <label htmlFor="retryWrites" className="text-sm text-zinc-300">
              Retry writes on network errors (recommended)
            </label>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4">
              <FieldWithError
                label="Write Concern (w)"
                helpText="Number of nodes to acknowledge writes"
              >
                <input
                  type="text"
                  value={data.writeConcernW || ''}
                  onChange={e => onChange({ writeConcernW: e.target.value || 1 })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="1, majority, or number"
                />
              </FieldWithError>

              <FieldWithError
                label="Journal (j)"
                helpText="Wait for journal commit"
              >
                <select
                  value={data.writeConcernJ ? 'true' : 'false'}
                  onChange={e => onChange({ writeConcernJ: e.target.value === 'true' })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="false">False</option>
                  <option value="true">True</option>
                </select>
              </FieldWithError>

              <FieldWithError
                label="Timeout (ms)"
                error={getError('writeConcernWTimeout')}
                helpText="Write concern timeout"
              >
                <input
                  type="number"
                  value={data.writeConcernWTimeout || 0}
                  onChange={e => onChange({ writeConcernWTimeout: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  min={0}
                />
              </FieldWithError>
            </div>
          )}
        </div>
      </div>

      {/* Read Operations */}
      <div className="border-b border-zinc-700 pb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Read Operations</h3>
        <FieldWithError
          label="Read Preference"
          helpText="Where to read documents from in a replica set"
        >
          <select
            value={data.readPreference}
            onChange={e => onChange({ readPreference: e.target.value as ConnectionFormData['readPreference'] })}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="primary">Primary (default)</option>
            <option value="primaryPreferred">Primary Preferred</option>
            <option value="secondary">Secondary</option>
            <option value="secondaryPreferred">Secondary Preferred</option>
            <option value="nearest">Nearest</option>
          </select>
        </FieldWithError>
      </div>

      {/* Other Settings (Advanced) */}
      {showAdvanced && (
      <div>
        <h3 className="text-sm font-semibold text-white mb-4">Other Settings</h3>
        <div className="space-y-4">
          <FieldWithError
            label="Application Name"
            helpText="Identifier for this application in server logs"
          >
            <input
              type="text"
              value={data.appName}
              onChange={e => onChange({ appName: e.target.value })}
              className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="mongopal"
            />
          </FieldWithError>

          <FieldWithError
            label="Compressors"
            helpText="Network compression algorithms (order matters)"
          >
            <div className="flex flex-wrap gap-2">
              {compressorOptions.map(comp => {
                const isSelected = (data.compressors || []).includes(comp.value);
                return (
                  <button
                    key={comp.value}
                    onClick={() => toggleCompressor(comp.value)}
                    className={`
                      px-4 py-2 rounded-md text-sm font-medium border transition-colors
                      ${isSelected
                        ? 'bg-accent/20 border-accent text-accent font-semibold'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
                      }
                    `}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 mr-1.5 inline" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {comp.label}
                  </button>
                );
              })}
            </div>
            {data.compressors && data.compressors.length > 0 && (
              <p className="text-xs text-zinc-500 mt-2">
                Selected: {data.compressors.join(', ')}
              </p>
            )}
          </FieldWithError>
        </div>
      </div>
      )}
    </div>
  );
}
