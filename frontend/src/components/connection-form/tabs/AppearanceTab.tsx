import type { ConnectionFormData } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';

interface AppearanceTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  onChange: (updates: Partial<ConnectionFormData>) => void;
}

export function AppearanceTab({ data, errors: _errors, onChange }: AppearanceTabProps) {
  const colorOptions = [
    { value: '#4CC38A', label: 'Green' },
    { value: '#3B82F6', label: 'Blue' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
    { value: '#F59E0B', label: 'Amber' },
    { value: '#EF4444', label: 'Red' },
    { value: '#10B981', label: 'Emerald' },
    { value: '#6366F1', label: 'Indigo' },
    { value: '#64748B', label: 'Slate' },
  ];

  return (
    <div className="space-y-4 p-4">
      {/* Connection Color */}
      <div>
        <h3 className="text-base font-semibold text-text mb-4">Connection Color</h3>
        <p className="text-xs text-text-dim mb-3">Helps identify this connection in the sidebar and tabs</p>
        <div className="grid grid-cols-9 gap-2">
          {colorOptions.map(color => (
            <button
              key={color.value}
              onClick={() => onChange({ color: color.value })}
              className={`
                w-10 h-10 rounded-md transition-all
                ${data.color === color.value
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110'
                  : 'hover:scale-105'
                }
              `}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
        </div>
      </div>

      {/* Read-Only Mode */}
      <div className="border-t border-border pt-6">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="readOnly"
            checked={data.readOnly}
            onChange={e => onChange({ readOnly: e.target.checked })}
            className="mt-1 w-4 h-4 bg-surface border-border rounded-md focus:ring-2 focus:ring-primary"
          />
          <div>
            <label htmlFor="readOnly" className="text-sm text-text-secondary block">
              Read-Only Mode
            </label>
            <p className="text-xs text-text-dim mt-1">
              Prevents all write, update, and delete operations
            </p>
          </div>
        </div>
      </div>

      {/* Visual Preview */}
      <div className="border-t border-border pt-6">
        <h3 className="text-base font-semibold text-text mb-4">Preview</h3>
        <div className="p-4 bg-surface/50 rounded-lg border border-border">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-8 rounded-full"
              style={{ backgroundColor: data.color }}
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-text">{data.name || 'Connection Name'}</div>
              <div className="text-xs text-text-dim">
                {data.readOnly && 'Read-Only'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
