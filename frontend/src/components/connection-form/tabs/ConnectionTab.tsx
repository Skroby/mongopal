import type { ConnectionFormData, ConnectionType, HostPort } from '../ConnectionFormTypes';
import type { ValidationError } from '../ConnectionFormTypes';
import { FieldWithError } from '../components/FieldWithError';

interface ConnectionTabProps {
  data: ConnectionFormData;
  errors: ValidationError[];
  folders: Array<{ id: string; name: string }>;
  onChange: (updates: Partial<ConnectionFormData>) => void;
  showAdvanced?: boolean;
}

export function ConnectionTab({ data, errors, folders, onChange, showAdvanced }: ConnectionTabProps) {
  const getError = (field: string) => errors.find(e => e.field === field && e.severity === 'error')?.message;

  const handleConnectionTypeChange = (type: ConnectionType) => {
    const updates: Partial<ConnectionFormData> = { connectionType: type };

    // Initialize hosts if empty for non-SRV types
    if ((type === 'standalone' || type === 'replicaset' || type === 'sharded') && data.hosts.length === 0) {
      updates.hosts = [{ host: 'localhost', port: 27017 }];
    }

    // Initialize srvHostname if empty for SRV type
    if (type === 'srv' && !data.srvHostname) {
      updates.srvHostname = '';
    }

    onChange(updates);
  };

  const handleHostChange = (index: number, field: keyof HostPort, value: string | number) => {
    const newHosts = [...data.hosts];
    newHosts[index] = { ...newHosts[index], [field]: value };
    onChange({ hosts: newHosts });
  };

  const addHost = () => {
    onChange({ hosts: [...data.hosts, { host: '', port: 27017 }] });
  };

  const removeHost = (index: number) => {
    if (data.hosts.length > 1) {
      const newHosts = data.hosts.filter((_, i) => i !== index);
      onChange({ hosts: newHosts });
    }
  };

  return (
    <div className="space-y-4 p-4">
      {/* Connection Name */}
      <FieldWithError
        label="Connection Name"
        error={getError('name')}
        required
      >
        <input
          type="text"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
          className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="My MongoDB Connection"
          data-testid="connection-name"
        />
      </FieldWithError>

      {/* Folder */}
      <FieldWithError label="Folder">
        <select
          value={data.folderId || ''}
          onChange={e => onChange({ folderId: e.target.value })}
          className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">No folder</option>
          {folders.map(folder => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </FieldWithError>

      {/* Connection Type */}
      <FieldWithError label="Connection Type" required>
        <select
          value={data.connectionType}
          onChange={e => handleConnectionTypeChange(e.target.value as ConnectionType)}
          className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          data-testid="connection-type-select"
        >
          <option value="standalone">Standalone</option>
          <option value="replicaset">Replica Set</option>
          <option value="sharded">Sharded Cluster</option>
          <option value="srv">DNS SRV</option>
        </select>
      </FieldWithError>

      {/* Conditional rendering based on connection type */}
      {data.connectionType === 'srv' ? (
        <FieldWithError
          label="SRV Hostname"
          error={getError('srvHostname')}
          helpText="e.g., cluster0.mongodb.net"
          required
        >
          <input
            type="text"
            value={data.srvHostname}
            onChange={e => onChange({ srvHostname: e.target.value })}
            className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="cluster0.mongodb.net"
            data-testid="srv-hostname"
          />
        </FieldWithError>
      ) : (
        <>
          {/* Hosts */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-white">
              {data.connectionType === 'replicaset' && 'Replica Set Hosts'}
              {data.connectionType === 'sharded' && 'Mongos Routers'}
              {data.connectionType === 'standalone' && 'Host'}
              <span className="text-red-400 ml-1 font-bold">*</span>
            </label>
            {data.hosts.map((host, index) => {
              // In basic mode, only show the first host (unless multi-host type)
              const isMultiHostType = data.connectionType === 'replicaset' || data.connectionType === 'sharded';
              if (!showAdvanced && !isMultiHostType && index > 0) return null;
              return (
                <div key={index} className="flex gap-2 items-start p-3 bg-zinc-800/50 rounded-md border border-zinc-700">
                  <FieldWithError
                    label=""
                    error={getError(`hosts[${index}].host`)}
                  >
                    <input
                      type="text"
                      value={host.host}
                      onChange={e => handleHostChange(index, 'host', e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="localhost or 192.168.1.1"
                    />
                  </FieldWithError>
                  <FieldWithError
                    label=""
                    error={getError(`hosts[${index}].port`)}
                  >
                    <input
                      type="number"
                      value={host.port}
                      onChange={e => handleHostChange(index, 'port', parseInt(e.target.value, 10) || 27017)}
                      className="w-24 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      min={1}
                      max={65535}
                    />
                  </FieldWithError>
                  {(data.connectionType === 'replicaset' || data.connectionType === 'sharded') && data.hosts.length > 1 && (
                    <button
                      onClick={() => removeHost(index)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                      title="Remove host"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {(data.connectionType === 'replicaset' || data.connectionType === 'sharded') && (
              <button
                onClick={addHost}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-md transition-colors w-full"
              >
                + Add Host
              </button>
            )}
          </div>

          {/* Replica Set Name */}
          {data.connectionType === 'replicaset' && (
            <FieldWithError
              label="Replica Set Name"
              error={getError('replicaSetName')}
              helpText="e.g., rs0"
              required
            >
              <input
                type="text"
                value={data.replicaSetName || ''}
                onChange={e => onChange({ replicaSetName: e.target.value })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="rs0"
                data-testid="replica-set-name"
              />
            </FieldWithError>
          )}
        </>
      )}

      {/* Default Database */}
      <FieldWithError
        label="Default Database"
        helpText="Optional - database to use for authentication"
      >
        <input
          type="text"
          value={data.defaultDatabase || ''}
          onChange={e => onChange({ defaultDatabase: e.target.value })}
          className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="mydb"
        />
      </FieldWithError>
    </div>
  );
}
