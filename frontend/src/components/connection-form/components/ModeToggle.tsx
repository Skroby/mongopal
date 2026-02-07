import type { FormMode } from '../ConnectionFormTypes';

interface ModeToggleProps {
  mode: FormMode;
  onModeChange: (mode: FormMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
      <button
        onClick={() => onModeChange('form')}
        className={`
          px-4 py-1.5 rounded-md text-sm font-medium transition-colors
          ${mode === 'form'
            ? 'bg-accent text-white'
            : 'text-zinc-400 hover:text-white'
          }
        `}
      >
        Form
      </button>
      <button
        onClick={() => onModeChange('uri')}
        className={`
          px-4 py-1.5 rounded-md text-sm font-medium transition-colors
          ${mode === 'uri'
            ? 'bg-accent text-white'
            : 'text-zinc-400 hover:text-white'
          }
        `}
      >
        URI
      </button>
    </div>
  );
}
