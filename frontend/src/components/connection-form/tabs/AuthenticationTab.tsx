import type { ConnectionFormData, AuthMechanism } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';
import { FieldWithError } from '../components/FieldWithError';
import { PasswordField } from '../components/PasswordField';

interface AuthenticationTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  onChange: (updates: Partial<ConnectionFormData>) => void;
  passwordExists?: boolean;
  onLoadPassword?: () => Promise<string>;
  showAdvanced?: boolean;
}

export function AuthenticationTab({
  data,
  errors,
  onChange,
  passwordExists,
  onLoadPassword,
  showAdvanced,
}: AuthenticationTabProps) {
  const getError = (field: string) => errors.find(e => e.field === field && e.severity === 'error')?.message;

  const authMechanisms: { value: AuthMechanism; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'scram-sha-1', label: 'SCRAM-SHA-1' },
    { value: 'scram-sha-256', label: 'SCRAM-SHA-256' },
    { value: 'x509', label: 'X.509 Certificate' },
    { value: 'mongodb-aws', label: 'MongoDB AWS (IAM)' },
    { value: 'kerberos', label: 'Kerberos (GSSAPI)' },
  ];

  const handleAuthMechanismChange = (mechanism: AuthMechanism) => {
    const updates: Partial<ConnectionFormData> = { authMechanism: mechanism };

    // Auto-set authSource for specific mechanisms
    if (mechanism === 'mongodb-aws') {
      updates.authDatabase = '$external';
    } else if (mechanism === 'x509') {
      updates.authDatabase = '$external';
    }

    onChange(updates);
  };

  const requiresCredentials = data.authMechanism !== 'none' && data.authMechanism !== 'mongodb-aws';

  return (
    <div className="space-y-4 p-4">
      {/* Authentication Mechanism */}
      <FieldWithError
        label="Authentication Mechanism"
        error={getError('authMechanism')}
        required
      >
        <select
          value={data.authMechanism}
          onChange={e => handleAuthMechanismChange(e.target.value as AuthMechanism)}
          className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="auth-mechanism"
          id="field-authMechanism"
        >
          {authMechanisms.map(mech => (
            <option key={mech.value} value={mech.value}>
              {mech.label}
            </option>
          ))}
        </select>
      </FieldWithError>

      {/* Credentials (for most mechanisms) */}
      {requiresCredentials && (
        <>
          <FieldWithError
            label="Username"
            error={getError('username')}
            required
          >
            <input
              type="text"
              value={data.username || ''}
              onChange={e => onChange({ username: e.target.value })}
              className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="admin"
              data-testid="username"
              id="field-username"
            />
          </FieldWithError>

          {data.authMechanism !== 'x509' && (
            <FieldWithError
              label="Password"
              error={getError('password')}
              helpText="Leave empty to keep existing password when editing"
            >
              <PasswordField
                value={data.password || ''}
                onChange={value => onChange({ password: value })}
                className="w-full px-2 py-1.5 pr-10 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                autoComplete="new-password"
                passwordExists={passwordExists}
                onLoadPassword={onLoadPassword}
              />
            </FieldWithError>
          )}

          {showAdvanced && (
            <FieldWithError
              label="Authentication Database"
              error={getError('authDatabase')}
              helpText="Database name used to authenticate (default: admin)"
            >
              <input
                type="text"
                value={data.authDatabase || 'admin'}
                onChange={e => onChange({ authDatabase: e.target.value })}
                className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin"
                disabled={data.authMechanism === 'mongodb-aws' || data.authMechanism === 'x509'}
                id="field-authDatabase"
              />
            </FieldWithError>
          )}
        </>
      )}

      {/* AWS IAM info */}
      {data.authMechanism === 'mongodb-aws' && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-md">
          <p className="text-sm text-blue-300">
            MongoDB AWS authentication uses credentials from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
            or IAM roles. No credentials are stored in this connection.
          </p>
        </div>
      )}

      {/* X.509 requires TLS notice */}
      {data.authMechanism === 'x509' && !data.tlsEnabled && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <p className="text-sm text-yellow-300">
            X.509 authentication requires TLS to be enabled. Go to the Network tab to configure TLS/SSL.
          </p>
        </div>
      )}
    </div>
  );
}
