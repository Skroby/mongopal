import { useState } from 'react';

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoComplete?: string;
  testId?: string;
  passwordExists?: boolean; // Indicates password is stored but not loaded
  onLoadPassword?: () => Promise<string>; // Callback to load the actual password
}

export function PasswordField({
  value,
  onChange,
  placeholder = '••••••••',
  className = '',
  autoComplete = 'new-password',
  testId,
  passwordExists = false,
  onLoadPassword,
}: PasswordFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleRevealClick = async () => {
    if (isRevealed) {
      // Just hide again
      setIsRevealed(false);
      return;
    }

    setIsAuthenticating(true);

    try {
      // Check if already authenticated within grace period
      // @ts-ignore - Wails binding
      const isAuthenticated = await window.go.main.App.IsAuthenticatedForPasswordReveal();

      if (!isAuthenticated) {
        // Need to authenticate
        // @ts-ignore - Wails binding
        await window.go.main.App.AuthenticateForPasswordReveal();
      }

      // Authentication successful
      // If password exists but not loaded, load it now
      if (passwordExists && !value && onLoadPassword) {
        const loadedPassword = await onLoadPassword();
        onChange(loadedPassword);
      }

      // Reveal password
      setIsRevealed(true);

      // Auto-hide after 30 seconds
      setTimeout(() => {
        setIsRevealed(false);
      }, 30000);
    } catch (error) {
      console.error('Authentication failed:', error);
      // Show user-friendly message
      alert('Authentication failed. Password not revealed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="relative">
      <input
        type={isRevealed ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        autoComplete={autoComplete}
        data-testid={testId}
      />
      <button
        type="button"
        onClick={handleRevealClick}
        disabled={isAuthenticating || (!value && !passwordExists)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={isRevealed ? 'Hide password' : 'Reveal password (requires authentication)'}
      >
        {isAuthenticating ? (
          <span className="text-xs">...</span>
        ) : isRevealed ? (
          // Eye slash icon (hidden)
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          // Eye icon (visible)
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}
