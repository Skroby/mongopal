
interface FieldWithErrorProps {
  label: string;
  error?: string;
  warning?: string;
  required?: boolean;
  children: React.ReactNode;
  helpText?: string;
  id?: string;
}

export function FieldWithError({ label, error, warning, required, children, helpText, id }: FieldWithErrorProps) {
  return (
    <div className="space-y-1.5" id={id}>
      {label && (
        <label className={`block text-sm font-medium ${required ? 'text-white' : 'text-zinc-300'}`}>
          {label}
          {required && <span className="text-red-400 ml-1 font-bold">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-red-400" />
          {error}
        </p>
      )}
      {!error && warning && (
        <p className="text-xs text-yellow-400 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-yellow-400" />
          {warning}
        </p>
      )}
      {!error && !warning && helpText && (
        <p className="text-xs text-zinc-500">{helpText}</p>
      )}
    </div>
  );
}
