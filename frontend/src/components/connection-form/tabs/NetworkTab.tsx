import { ChangeEvent, useRef } from 'react';
import type { ConnectionFormData } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';
import { FieldWithError } from '../components/FieldWithError';
import { PasswordField } from '../components/PasswordField';

interface NetworkTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  onChange: (updates: Partial<ConnectionFormData>) => void;
  sshPasswordExists?: boolean;
  onLoadSSHPassword?: () => Promise<string>;
  sshPassphraseExists?: boolean;
  onLoadSSHPassphrase?: () => Promise<string>;
  socks5PasswordExists?: boolean;
  onLoadSOCKS5Password?: () => Promise<string>;
  tlsKeyPasswordExists?: boolean;
  onLoadTLSKeyPassword?: () => Promise<string>;
  showAdvanced?: boolean;
  onEnableAdvanced?: () => void;
}

export function NetworkTab({
  data,
  errors,
  onChange,
  sshPasswordExists,
  onLoadSSHPassword,
  sshPassphraseExists,
  onLoadSSHPassphrase,
  socks5PasswordExists,
  onLoadSOCKS5Password,
  tlsKeyPasswordExists,
  onLoadTLSKeyPassword,
  showAdvanced,
  onEnableAdvanced,
}: NetworkTabProps) {
  const getError = (field: string) => errors.find(e => e.field === field && e.severity === 'error')?.message;
  const getWarning = (field: string) => errors.find(e => e.field === field && e.severity === 'warning')?.message;

  const sshKeyInputRef = useRef<HTMLInputElement>(null);
  const caCertInputRef = useRef<HTMLInputElement>(null);
  const clientCertInputRef = useRef<HTMLInputElement>(null);
  const clientKeyInputRef = useRef<HTMLInputElement>(null);

  const handleFileRead = async (e: ChangeEvent<HTMLInputElement>, field: keyof ConnectionFormData) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      onChange({ [field]: content });
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Advanced sections hint */}
      {!showAdvanced && (
        <div className="p-4 bg-surface/50 border border-border rounded-md">
          <p className="text-sm text-text-muted">
            TLS/SSL, SSH tunnels, and SOCKS5 proxy settings are available in{' '}
            <button
              onClick={onEnableAdvanced}
              className="text-primary hover:text-primary/80 underline"
            >
              Advanced Options
            </button>
            .
          </p>
        </div>
      )}

      {/* TLS/SSL Section (Advanced) */}
      {showAdvanced && (
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text">TLS/SSL</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={data.tlsEnabled}
              onChange={e => onChange({ tlsEnabled: e.target.checked })}
              className="sr-only peer"
              data-testid="tls-enabled"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            <span className="sr-only">Enable TLS/SSL</span>
          </label>
        </div>

        {data.tlsEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/30">
            {/* Allow Invalid Certificates */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tlsInsecure"
                checked={data.tlsInsecure}
                onChange={e => onChange({ tlsInsecure: e.target.checked })}
                className="w-4 h-4 bg-surface border-border rounded focus:ring-2 focus:ring-primary"
              />
              <label htmlFor="tlsInsecure" className="text-sm text-text-secondary">
                Allow invalid certificates (insecure)
              </label>
            </div>
            {data.tlsInsecure && getWarning('tlsInsecure') && (
              <p className="text-xs text-yellow-400 ml-6 flex items-center gap-1">
                <span className="inline-block w-1 h-1 rounded-full bg-yellow-400" />
                {getWarning('tlsInsecure')}
              </p>
            )}

            {/* CA Certificate */}
            <FieldWithError
              label="CA Certificate"
              helpText="Certificate Authority certificate (PEM format)"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.tlsCACert ? '✓ Certificate loaded' : ''}
                  readOnly
                  placeholder="No certificate"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-text"
                />
                <input
                  ref={caCertInputRef}
                  type="file"
                  accept=".pem,.crt,.cer"
                  onChange={e => handleFileRead(e, 'tlsCACert')}
                  className="hidden"
                />
                <button
                  onClick={() => caCertInputRef.current?.click()}
                  className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-text text-sm rounded-md transition-colors"
                >
                  Browse
                </button>
                {data.tlsCACert && (
                  <button
                    onClick={() => onChange({ tlsCACert: '' })}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    title="Clear certificate"
                  >
                    ✕
                  </button>
                )}
              </div>
            </FieldWithError>

            {/* Client Certificate */}
            <FieldWithError
              label="Client Certificate"
              helpText="Client certificate for mutual TLS (PEM format)"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.tlsClientCert ? '✓ Certificate loaded' : ''}
                  readOnly
                  placeholder="No certificate"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-text"
                />
                <input
                  ref={clientCertInputRef}
                  type="file"
                  accept=".pem,.crt,.cer"
                  onChange={e => handleFileRead(e, 'tlsClientCert')}
                  className="hidden"
                />
                <button
                  onClick={() => clientCertInputRef.current?.click()}
                  className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-text text-sm rounded-md transition-colors"
                >
                  Browse
                </button>
                {data.tlsClientCert && (
                  <button
                    onClick={() => onChange({ tlsClientCert: '' })}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    title="Clear certificate"
                  >
                    ✕
                  </button>
                )}
              </div>
            </FieldWithError>

            {/* Client Key */}
            <FieldWithError
              label="Client Key"
              helpText="Private key for client certificate (PEM format)"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={data.tlsClientKey ? '✓ Key loaded' : ''}
                  readOnly
                  placeholder="No key"
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-text"
                />
                <input
                  ref={clientKeyInputRef}
                  type="file"
                  accept=".pem,.key"
                  onChange={e => handleFileRead(e, 'tlsClientKey')}
                  className="hidden"
                />
                <button
                  onClick={() => clientKeyInputRef.current?.click()}
                  className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-text text-sm rounded-md transition-colors"
                >
                  Browse
                </button>
                {data.tlsClientKey && (
                  <button
                    onClick={() => onChange({ tlsClientKey: '' })}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    title="Clear key"
                  >
                    ✕
                  </button>
                )}
              </div>
            </FieldWithError>

            {/* Client Key Password */}
            {data.tlsClientKey && (
              <FieldWithError
                label="Client Key Password"
                helpText="Password for encrypted private key (if required)"
              >
                <PasswordField
                  value={data.tlsClientKeyPassword || ''}
                  onChange={value => onChange({ tlsClientKeyPassword: value })}
                  className="w-full px-2 py-1.5 pr-10 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  passwordExists={tlsKeyPasswordExists}
                  onLoadPassword={onLoadTLSKeyPassword}
                />
              </FieldWithError>
            )}
          </div>
        )}
      </div>
      )}

      {/* SSH Tunnel Section (Advanced) */}
      {showAdvanced && (
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text">SSH Tunnel</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={data.sshEnabled}
              onChange={e => onChange({ sshEnabled: e.target.checked })}
              className="sr-only peer"
              data-testid="ssh-enabled"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            <span className="sr-only">Enable SSH Tunnel</span>
          </label>
        </div>

        {data.sshEnabled && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/30">
            {getWarning('sshEnabled') && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                <p className="text-sm text-yellow-300">{getWarning('sshEnabled')}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FieldWithError
                label="SSH Host"
                error={getError('sshHost')}
                required
              >
                <input
                  type="text"
                  value={data.sshHost || ''}
                  onChange={e => onChange({ sshHost: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="ssh.example.com"
                  data-testid="ssh-host"
                  id="field-sshHost"
                />
              </FieldWithError>

              <FieldWithError
                label="SSH Port"
                error={getError('sshPort')}
                required
              >
                <input
                  type="number"
                  value={data.sshPort}
                  onChange={e => onChange({ sshPort: parseInt(e.target.value, 10) || 22 })}
                  className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={1}
                  max={65535}
                  id="field-sshPort"
                />
              </FieldWithError>
            </div>

            <FieldWithError
              label="SSH Username"
              error={getError('sshUser')}
              required
            >
              <input
                type="text"
                value={data.sshUser || ''}
                onChange={e => onChange({ sshUser: e.target.value })}
                className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="ubuntu"
                id="field-sshUser"
              />
            </FieldWithError>

            {/* SSH Auth Method - Radio Button Group pattern (exclusive selection) */}
            <FieldWithError label="Authentication Method" required>
              <div className="flex gap-2 p-1 bg-surface rounded-lg" role="radiogroup">
                {(['password', 'privatekey'] as const).map(method => (
                  <button
                    key={method}
                    onClick={() => onChange({ sshAuthMethod: method })}
                    className={`
                      flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors
                      ${data.sshAuthMethod === method
                        ? 'bg-white text-background'
                        : 'text-text-muted hover:text-text hover:bg-surface-hover'
                      }
                    `}
                    role="radio"
                    aria-checked={data.sshAuthMethod === method}
                  >
                    {method === 'password' ? 'Password' : 'Private Key'}
                  </button>
                ))}
              </div>
            </FieldWithError>

            {data.sshAuthMethod === 'password' ? (
              <FieldWithError
                label="SSH Password"
                error={getError('sshPassword')}
                required
              >
                <PasswordField
                  value={data.sshPassword || ''}
                  onChange={value => onChange({ sshPassword: value })}
                  className="w-full px-2 py-1.5 pr-10 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  passwordExists={sshPasswordExists}
                  onLoadPassword={onLoadSSHPassword}
                />
              </FieldWithError>
            ) : (
              <>
                <FieldWithError
                  label="SSH Private Key"
                  error={getError('sshPrivateKey')}
                  helpText="OpenSSH or PEM format private key"
                  required
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={data.sshPrivateKey ? '✓ Key loaded' : ''}
                      readOnly
                      placeholder="No key"
                      className="flex-1 px-3 py-2 bg-surface border border-border rounded-md text-text"
                    />
                    <input
                      ref={sshKeyInputRef}
                      type="file"
                      accept=".pem,.key"
                      onChange={e => handleFileRead(e, 'sshPrivateKey')}
                      className="hidden"
                    />
                    <button
                      onClick={() => sshKeyInputRef.current?.click()}
                      className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-text text-sm rounded-md transition-colors"
                    >
                      Browse
                    </button>
                    {data.sshPrivateKey && (
                      <button
                        onClick={() => onChange({ sshPrivateKey: '' })}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                        title="Clear key"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </FieldWithError>

                {data.sshPrivateKey && (
                  <FieldWithError
                    label="Key Passphrase"
                    helpText="Leave empty if key is not encrypted"
                  >
                    <PasswordField
                      value={data.sshPassphrase || ''}
                      onChange={value => onChange({ sshPassphrase: value })}
                      className="w-full px-2 py-1.5 pr-10 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      passwordExists={sshPassphraseExists}
                      onLoadPassword={onLoadSSHPassphrase}
                    />
                  </FieldWithError>
                )}
              </>
            )}
          </div>
        )}
      </div>

      )}

      {/* SOCKS5 Proxy Section (Advanced) */}
      {showAdvanced && (
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-text">SOCKS5 Proxy</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={data.socks5Enabled}
              onChange={e => onChange({ socks5Enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            <span className="sr-only">Enable SOCKS5 Proxy</span>
          </label>
        </div>

        {data.socks5Enabled && (
          <div className="space-y-4 pl-4 border-l-2 border-primary/30">
            <div className="grid grid-cols-2 gap-4">
              <FieldWithError
                label="Proxy Host"
                error={getError('socks5Host')}
                required
              >
                <input
                  type="text"
                  value={data.socks5Host || ''}
                  onChange={e => onChange({ socks5Host: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="proxy.example.com"
                  id="field-socks5Host"
                />
              </FieldWithError>

              <FieldWithError
                label="Proxy Port"
                error={getError('socks5Port')}
                required
              >
                <input
                  type="number"
                  value={data.socks5Port}
                  onChange={e => onChange({ socks5Port: parseInt(e.target.value, 10) || 1080 })}
                  className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  min={1}
                  max={65535}
                  id="field-socks5Port"
                />
              </FieldWithError>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="socks5RequiresAuth"
                checked={data.socks5RequiresAuth}
                onChange={e => onChange({ socks5RequiresAuth: e.target.checked })}
                className="w-4 h-4 bg-surface border-border rounded focus:ring-2 focus:ring-primary"
              />
              <label htmlFor="socks5RequiresAuth" className="text-sm text-text-secondary">
                Proxy requires authentication
              </label>
            </div>

            {data.socks5RequiresAuth && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <FieldWithError
                  label="Proxy Username"
                  error={getError('socks5User')}
                  required
                >
                  <input
                    type="text"
                    value={data.socks5User || ''}
                    onChange={e => onChange({ socks5User: e.target.value })}
                    className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="proxyuser"
                    id="field-socks5User"
                  />
                </FieldWithError>

                <FieldWithError
                  label="Proxy Password"
                  error={getError('socks5Password')}
                  required
                >
                  <PasswordField
                    value={data.socks5Password || ''}
                    onChange={value => onChange({ socks5Password: value })}
                    className="w-full px-2 py-1.5 pr-10 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    passwordExists={socks5PasswordExists}
                    onLoadPassword={onLoadSOCKS5Password}
                  />
                </FieldWithError>
              </div>
            )}
          </div>
        )}
      </div>

      )}

      {/* Timeouts Section (always visible) */}
      <div>
        <h3 className="text-base font-semibold text-text mb-4">Timeouts</h3>
        <div className="space-y-4">
          <FieldWithError
            label="Connect Timeout"
            error={getError('connectTimeout')}
            helpText="Maximum time to wait for initial connection (seconds)"
          >
            <input
              type="number"
              value={data.connectTimeout}
              onChange={e => onChange({ connectTimeout: parseInt(e.target.value, 10) || 10 })}
              className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
              max={300}
              id="field-connectTimeout"
            />
          </FieldWithError>

          <FieldWithError
            label="Socket Timeout"
            error={getError('socketTimeout')}
            helpText="Maximum time to wait for socket operations (seconds)"
          >
            <input
              type="number"
              value={data.socketTimeout}
              onChange={e => onChange({ socketTimeout: parseInt(e.target.value, 10) || 30 })}
              className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
              max={300}
              id="field-socketTimeout"
            />
          </FieldWithError>

          <FieldWithError
            label="Server Selection Timeout"
            error={getError('serverSelectionTimeout')}
            helpText="Maximum time to wait for server selection (seconds)"
          >
            <input
              type="number"
              value={data.serverSelectionTimeout}
              onChange={e => onChange({ serverSelectionTimeout: parseInt(e.target.value, 10) || 30 })}
              className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              min={0}
              max={300}
              id="field-serverSelectionTimeout"
            />
          </FieldWithError>
        </div>
      </div>
    </div>
  );
}
