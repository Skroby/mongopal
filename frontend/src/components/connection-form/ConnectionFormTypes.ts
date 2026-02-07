// Types for the advanced connection form (F074)

export type ConnectionType = 'standalone' | 'replicaset' | 'sharded' | 'srv';
export type AuthMechanism = 'none' | 'scram-sha-1' | 'scram-sha-256' | 'x509' | 'mongodb-aws' | 'kerberos';
export type FormMode = 'form' | 'uri';
export type TabId = 'connection' | 'authentication' | 'network' | 'options' | 'safety' | 'appearance';

export interface HostPort {
  host: string;
  port: number;
}

export interface ConnectionFormData {
  // Base fields
  id: string;
  name: string;
  folderId?: string;
  color: string;
  readOnly: boolean;

  // Connection tab
  connectionType: ConnectionType;
  hosts: HostPort[]; // For standalone/replicaset
  srvHostname: string; // For SRV
  replicaSetName?: string; // For replicaset
  defaultDatabase?: string;

  // Authentication tab
  authMechanism: AuthMechanism;
  username?: string;
  password?: string;
  authDatabase?: string;

  // TLS/SSL (Network tab)
  tlsEnabled: boolean;
  tlsInsecure: boolean;
  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
  tlsClientKeyPassword?: string;

  // Network tab - SSH Tunnel
  sshEnabled: boolean;
  sshHost?: string;
  sshPort: number;
  sshUser?: string;
  sshAuthMethod: 'password' | 'privatekey';
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;

  // Network tab - SOCKS5 Proxy
  socks5Enabled: boolean;
  socks5Host?: string;
  socks5Port: number;
  socks5RequiresAuth: boolean;
  socks5User?: string;
  socks5Password?: string;

  // Network tab - Timeouts
  connectTimeout: number; // seconds
  socketTimeout: number; // seconds
  serverSelectionTimeout: number; // seconds

  // Options tab
  maxPoolSize: number;
  retryWrites: boolean;
  writeConcernW?: string | number;
  writeConcernJ: boolean;
  writeConcernWTimeout?: number;
  readPreference: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  appName: string;
  compressors: string[]; // ['snappy', 'zlib', 'zstd']

  // Safety tab
  destructiveDelay: number; // seconds
  requireDeleteConfirmation: boolean;
}

export interface ValidationError {
  field: string;
  tab: TabId;
  message: string;
  severity: 'error' | 'warning';
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  hint?: string;
  serverVersion?: string;
  topology?: string;
  latency?: number;
  tlsEnabled?: boolean;
  replicaSet?: string;
}

export interface TabInfo {
  id: TabId;
  label: string;
  errorCount: number;
  warningCount: number;
}

// Default values
export const DEFAULT_FORM_DATA: Omit<ConnectionFormData, 'id' | 'name'> = {
  folderId: '',
  color: '#4CC38A',
  readOnly: false,

  // Connection
  connectionType: 'standalone',
  hosts: [{ host: 'localhost', port: 27017 }],
  srvHostname: '',
  replicaSetName: '',
  defaultDatabase: '',

  // Authentication
  authMechanism: 'none',
  username: '',
  password: '',
  authDatabase: 'admin',

  // TLS
  tlsEnabled: false,
  tlsInsecure: false,
  tlsCACert: '',
  tlsClientCert: '',
  tlsClientKey: '',
  tlsClientKeyPassword: '',

  // SSH
  sshEnabled: false,
  sshHost: '',
  sshPort: 22,
  sshUser: '',
  sshAuthMethod: 'password',
  sshPassword: '',
  sshPrivateKey: '',
  sshPassphrase: '',

  // SOCKS5
  socks5Enabled: false,
  socks5Host: '',
  socks5Port: 1080,
  socks5RequiresAuth: false,
  socks5User: '',
  socks5Password: '',

  // Timeouts
  connectTimeout: 10,
  socketTimeout: 30,
  serverSelectionTimeout: 30,

  // Options
  maxPoolSize: 100,
  retryWrites: true,
  writeConcernW: 1,
  writeConcernJ: false,
  writeConcernWTimeout: 0,
  readPreference: 'primary',
  appName: 'mongopal',
  compressors: [],

  // Safety
  destructiveDelay: 0,
  requireDeleteConfirmation: false,
};
