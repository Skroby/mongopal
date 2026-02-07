// URI generation and parsing utilities for connection form

import type { ConnectionFormData, ConnectionType } from './ConnectionFormTypes';

export interface GenerateURIOptions {
  includeCredentials?: boolean;
  includeMongoPalParams?: boolean;
}

/**
 * Generates a MongoDB URI from form data.
 * Includes custom mongopal.* parameters for SSH and SOCKS5 settings.
 */
export function generateURIFromForm(data: ConnectionFormData, options?: GenerateURIOptions): string {
  const includeCredentials = options?.includeCredentials ?? true;
  const includeMongoPalParams = options?.includeMongoPalParams ?? true;
  const protocol = data.connectionType === 'srv' ? 'mongodb+srv://' : 'mongodb://';

  // Build credentials part
  let credentials = '';
  if (data.username && includeCredentials) {
    credentials = encodeURIComponent(data.username);
    if (data.password) {
      credentials += ':' + encodeURIComponent(data.password);
    }
    credentials += '@';
  }

  // Build hosts part
  let hosts = '';
  if (data.connectionType === 'srv') {
    hosts = data.srvHostname;
  } else if (data.connectionType === 'standalone') {
    const { host, port } = data.hosts[0] || { host: 'localhost', port: 27017 };
    hosts = formatHost(host, port);
  } else if (data.connectionType === 'replicaset' || data.connectionType === 'sharded') {
    hosts = data.hosts
      .filter(h => h.host) // Filter out empty hosts
      .map(h => formatHost(h.host, h.port))
      .join(',');
  }

  // Build database part
  const database = data.defaultDatabase || '';

  // Build query parameters
  const params = new URLSearchParams();

  // Authentication params — map to exact MongoDB driver values
  const authMechanismToDriver: Record<string, string> = {
    'scram-sha-1': 'SCRAM-SHA-1',
    'scram-sha-256': 'SCRAM-SHA-256',
    'x509': 'MONGODB-X509',
    'mongodb-aws': 'MONGODB-AWS',
    'kerberos': 'GSSAPI',
  };
  if (data.authMechanism !== 'none' && authMechanismToDriver[data.authMechanism]) {
    params.append('authMechanism', authMechanismToDriver[data.authMechanism]);
  }
  if (data.authDatabase && data.authDatabase !== 'admin') {
    params.append('authSource', data.authDatabase);
  }

  // Replica set name
  if (data.connectionType === 'replicaset' && data.replicaSetName) {
    params.append('replicaSet', data.replicaSetName);
  }

  // TLS params
  if (data.tlsEnabled) {
    params.append('tls', 'true');
    if (data.tlsInsecure) {
      params.append('tlsAllowInvalidCertificates', 'true');
    }
  }

  // Options params (omit defaults)
  if (data.maxPoolSize !== 100) {
    params.append('maxPoolSize', data.maxPoolSize.toString());
  }
  if (!data.retryWrites) {
    params.append('retryWrites', 'false');
  }
  if (data.writeConcernW !== undefined && data.writeConcernW !== 1) {
    params.append('w', data.writeConcernW.toString());
  }
  if (data.writeConcernJ) {
    params.append('journal', 'true');
  }
  if (data.writeConcernWTimeout) {
    params.append('wtimeout', data.writeConcernWTimeout.toString());
  }
  if (data.readPreference !== 'primary') {
    params.append('readPreference', data.readPreference);
  }
  if (data.appName !== 'mongopal') {
    params.append('appName', data.appName);
  }
  if (data.compressors.length > 0) {
    params.append('compressors', data.compressors.join(','));
  }

  // Timeouts (only if non-default)
  if (data.connectTimeout !== 10) {
    params.append('connectTimeoutMS', (data.connectTimeout * 1000).toString());
  }
  if (data.socketTimeout !== 30) {
    params.append('socketTimeoutMS', (data.socketTimeout * 1000).toString());
  }
  if (data.serverSelectionTimeout !== 30) {
    params.append('serverSelectionTimeoutMS', (data.serverSelectionTimeout * 1000).toString());
  }

  // MongoPal-specific parameters (SSH, SOCKS5, etc.)
  if (includeMongoPalParams) {
    if (data.sshEnabled) {
      params.append('mongopal.ssh.enabled', 'true');
      if (data.sshHost) params.append('mongopal.ssh.host', data.sshHost);
      if (data.sshPort !== 22) params.append('mongopal.ssh.port', data.sshPort.toString());
      if (data.sshUser) params.append('mongopal.ssh.user', data.sshUser);
      params.append('mongopal.ssh.authMethod', data.sshAuthMethod);
    }

    if (data.socks5Enabled) {
      params.append('mongopal.socks5.enabled', 'true');
      if (data.socks5Host) params.append('mongopal.socks5.host', data.socks5Host);
      if (data.socks5Port !== 1080) params.append('mongopal.socks5.port', data.socks5Port.toString());
      if (data.socks5RequiresAuth) {
        params.append('mongopal.socks5.requiresAuth', 'true');
      }
    }
  }

  // Build final URI
  const queryString = params.toString();
  const uri = `${protocol}${credentials}${hosts}/${database}${queryString ? '?' + queryString : ''}`;

  return uri;
}

/**
 * Formats a host:port pair, handling IPv6 addresses.
 */
function formatHost(host: string, port: number): string {
  // Auto-detect IPv6 and wrap in brackets
  if (host.includes(':') && !host.startsWith('[')) {
    host = `[${host}]`;
  }

  // Omit port if it's the default (27017) and not SRV
  if (port === 27017) {
    return host;
  }

  return `${host}:${port}`;
}

/**
 * Result of parsing a URI, including optional connection name from vendor params.
 */
export interface ParsedURIResult {
  formData: Partial<ConnectionFormData>;
  connectionName?: string;
}

/**
 * Parses a MongoDB URI into form data.
 * This is a simplified parser - for complex URIs, we should delegate to backend.
 */
export function parseURIIntoForm(uri: string): Partial<ConnectionFormData> {
  try {
    // Basic validation
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI: must start with mongodb:// or mongodb+srv://');
    }

    const isSRV = uri.startsWith('mongodb+srv://');
    const protocol = isSRV ? 'mongodb+srv://' : 'mongodb://';
    const withoutProtocol = uri.substring(protocol.length);

    // Split into parts: [credentials@]hosts[/database][?options]
    const atIndex = withoutProtocol.indexOf('@');
    let credentials = '';
    let remainder = withoutProtocol;

    if (atIndex !== -1) {
      credentials = withoutProtocol.substring(0, atIndex);
      remainder = withoutProtocol.substring(atIndex + 1);
    }

    // Parse credentials
    let username = '';
    let password = '';
    if (credentials) {
      const colonIndex = credentials.indexOf(':');
      if (colonIndex !== -1) {
        username = decodeURIComponent(credentials.substring(0, colonIndex));
        password = decodeURIComponent(credentials.substring(colonIndex + 1));
      } else {
        username = decodeURIComponent(credentials);
      }
    }

    // Split remainder into hosts, database, and query
    const slashIndex = remainder.indexOf('/');
    let hostsStr = remainder;
    let database = '';
    let queryStr = '';

    if (slashIndex !== -1) {
      hostsStr = remainder.substring(0, slashIndex);
      const afterSlash = remainder.substring(slashIndex + 1);
      const questionIndex = afterSlash.indexOf('?');
      if (questionIndex !== -1) {
        database = afterSlash.substring(0, questionIndex);
        queryStr = afterSlash.substring(questionIndex + 1);
      } else {
        database = afterSlash;
      }
    }

    // Parse query parameters
    const params = new URLSearchParams(queryStr);

    // Parse hosts
    const connectionType: ConnectionType = isSRV ? 'srv' :
      (params.get('replicaSet')) ? 'replicaset' :
      (hostsStr.includes(',')) ? 'sharded' : 'standalone';

    const hosts = hostsStr.split(',').map(hostPort => {
      const bracketMatch = hostPort.match(/^\[([^\]]+)\]:?(\d+)?$/);
      if (bracketMatch) {
        // IPv6
        return {
          host: bracketMatch[1],
          port: bracketMatch[2] ? parseInt(bracketMatch[2], 10) : 27017,
        };
      } else {
        const parts = hostPort.split(':');
        return {
          host: parts[0],
          port: parts[1] ? parseInt(parts[1], 10) : 27017,
        };
      }
    });

    // Parse auth mechanism — map MongoDB driver values back to frontend values
    const driverToAuthMechanism: Record<string, ConnectionFormData['authMechanism']> = {
      'SCRAM-SHA-1': 'scram-sha-1',
      'SCRAM-SHA-256': 'scram-sha-256',
      'MONGODB-X509': 'x509',
      'MONGODB-AWS': 'mongodb-aws',
      'GSSAPI': 'kerberos',
    };
    const authMechanismStr = params.get('authMechanism');
    let authMechanism: ConnectionFormData['authMechanism'] = 'none';
    if (authMechanismStr) {
      authMechanism = driverToAuthMechanism[authMechanismStr] || 'none';
    } else if (username) {
      authMechanism = 'scram-sha-256'; // Default
    }

    const formData: Partial<ConnectionFormData> = {
      connectionType,
      username,
      password,
      defaultDatabase: database,
      authMechanism,
      authDatabase: params.get('authSource') || 'admin',

      // Hosts
      ...(isSRV ? { srvHostname: hostsStr } : { hosts }),
      replicaSetName: params.get('replicaSet') || '',

      // TLS
      tlsEnabled: params.get('tls') === 'true' || params.get('ssl') === 'true',
      tlsInsecure: params.get('tlsAllowInvalidCertificates') === 'true' || params.get('tlsInsecure') === 'true',

      // Options
      maxPoolSize: params.get('maxPoolSize') ? parseInt(params.get('maxPoolSize')!, 10) : 100,
      retryWrites: params.get('retryWrites') !== 'false',
      readPreference: (params.get('readPreference') as ConnectionFormData['readPreference']) || 'primary',
      appName: params.get('appName') || 'mongopal',
      compressors: params.get('compressors')?.split(',') || [],

      // Write concern
      writeConcernW: params.get('w') || 1,
      writeConcernJ: params.get('journal') === 'true',
      writeConcernWTimeout: params.get('wtimeout') ? parseInt(params.get('wtimeout')!, 10) : 0,

      // Timeouts (convert from milliseconds to seconds)
      connectTimeout: params.get('connectTimeoutMS') ? parseInt(params.get('connectTimeoutMS')!, 10) / 1000 : 10,
      socketTimeout: params.get('socketTimeoutMS') ? parseInt(params.get('socketTimeoutMS')!, 10) / 1000 : 30,
      serverSelectionTimeout: params.get('serverSelectionTimeoutMS') ? parseInt(params.get('serverSelectionTimeoutMS')!, 10) / 1000 : 30,

      // MongoPal-specific parameters
      sshEnabled: params.get('mongopal.ssh.enabled') === 'true',
      sshHost: params.get('mongopal.ssh.host') || '',
      sshPort: params.get('mongopal.ssh.port') ? parseInt(params.get('mongopal.ssh.port')!, 10) : 22,
      sshUser: params.get('mongopal.ssh.user') || '',
      sshAuthMethod: (params.get('mongopal.ssh.authMethod') as 'password' | 'privatekey') || 'password',

      socks5Enabled: params.get('mongopal.socks5.enabled') === 'true',
      socks5Host: params.get('mongopal.socks5.host') || '',
      socks5Port: params.get('mongopal.socks5.port') ? parseInt(params.get('mongopal.socks5.port')!, 10) : 1080,
      socks5RequiresAuth: params.get('mongopal.socks5.requiresAuth') === 'true',
    };

    // Merge Studio 3T params (overrides only if present)
    const vendorOverrides = parse3TParams(params);
    Object.assign(formData, vendorOverrides);

    return formData;
  } catch (error) {
    throw new Error(`Failed to parse URI: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parses a URI and returns both form data and an optional connection name
 * extracted from vendor params (e.g. 3t.connection.name).
 */
export function parseURIWithName(uri: string): ParsedURIResult {
  const formData = parseURIIntoForm(uri);

  // Extract connection name from 3T params
  let connectionName: string | undefined;
  try {
    const queryStr = uri.split('?')[1];
    if (queryStr) {
      const params = new URLSearchParams(queryStr);
      const name = params.get('3t.connection.name');
      if (name) connectionName = name;
    }
  } catch {
    // ignore
  }

  return { formData, connectionName };
}

/**
 * Extracts Studio 3T vendor params from URLSearchParams and maps them
 * to MongoPal ConnectionFormData fields. Only returns fields that have
 * non-default values. Unknown 3T params are silently ignored.
 */
export function parse3TParams(params: URLSearchParams): Partial<ConnectionFormData> {
  const result: Partial<ConnectionFormData> = {};

  // SSH settings
  if (params.get('3t.ssh') === 'true') {
    result.sshEnabled = true;
  }
  const sshAddr = params.get('3t.sshAddress');
  if (sshAddr) {
    result.sshEnabled = true;
    result.sshHost = sshAddr;
  }
  const sshPort = params.get('3t.sshPort');
  if (sshPort) {
    result.sshPort = parseInt(sshPort, 10);
  }
  const sshUser = params.get('3t.sshUser');
  if (sshUser) {
    result.sshUser = sshUser;
  }
  const sshAuthMode = params.get('3t.sshAuthMode');
  if (sshAuthMode === 'privateKey') {
    result.sshAuthMethod = 'privatekey';
  } else if (sshAuthMode === 'password') {
    result.sshAuthMethod = 'password';
  }
  const sshPKPath = params.get('3t.sshPKPath');
  if (sshPKPath) {
    result.sshPrivateKey = sshPKPath;
  }

  // TLS hint from 3T (only if not already set by standard tls=true)
  const sslTlsVersion = params.get('3t.sslTlsVersion');
  if (sslTlsVersion && params.get('tls') !== 'true' && params.get('ssl') !== 'true') {
    result.tlsEnabled = true;
  }

  return result;
}

/**
 * Removes all vendor-specific query params (3t.*, mongopal.*) from a URI
 * to produce a clean MongoDB URI for storage.
 */
export function stripVendorParams(uri: string): string {
  const qIndex = uri.indexOf('?');
  if (qIndex === -1) return uri;

  const base = uri.substring(0, qIndex);
  const queryStr = uri.substring(qIndex + 1);
  const params = new URLSearchParams(queryStr);

  const keysToRemove: string[] = [];
  params.forEach((_val, key) => {
    if (key.startsWith('3t.') || key.startsWith('mongopal.')) {
      keysToRemove.push(key);
    }
  });
  keysToRemove.forEach(k => params.delete(k));

  const remaining = params.toString();
  return remaining ? `${base}?${remaining}` : base;
}

/**
 * Parses multi-line text that may contain multiple MongoDB URIs with comment lines.
 * Supports Studio 3T export format with `// comment` lines.
 *
 * Returns an array of parsed results, one per URI found.
 */
export function parseMultiURIText(text: string): Array<{
  uri: string;
  parsed: Partial<ConnectionFormData>;
  connectionName?: string;
}> {
  const lines = text.split('\n');
  const entries: Array<{ uri: string; comment?: string }> = [];
  let lastComment: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      lastComment = undefined;
      continue;
    }
    if (line.startsWith('//')) {
      // Extract comment text (potential connection name)
      lastComment = line.replace(/^\/\/\s*/, '').trim() || undefined;
      continue;
    }
    if (line.startsWith('mongodb://') || line.startsWith('mongodb+srv://')) {
      entries.push({ uri: line, comment: lastComment });
      lastComment = undefined;
    }
    // Non-URI, non-comment lines are ignored
  }

  return entries.map(({ uri, comment }) => {
    const { formData, connectionName: vendorName } = parseURIWithName(uri);
    // Prefer 3T connection name, then comment, then undefined
    const connectionName = vendorName || comment || undefined;
    return { uri, parsed: formData, connectionName };
  });
}
