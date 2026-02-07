import { describe, it, expect } from 'vitest';
import { generateURIFromForm, parseURIIntoForm, parse3TParams, parseMultiURIText, stripVendorParams, parseURIWithName } from './ConnectionFormURIUtils';
import type { ConnectionFormData } from './ConnectionFormTypes';
import { DEFAULT_FORM_DATA } from './ConnectionFormTypes';

const baseForm: ConnectionFormData = {
  ...DEFAULT_FORM_DATA,
  id: 'test-id',
  name: 'Test',
  hosts: [{ host: 'localhost', port: 27017 }],
  username: 'admin',
  password: 'secret',
};

describe('Auth mechanism mapping — generation', () => {
  it.each([
    ['scram-sha-1', 'SCRAM-SHA-1'],
    ['scram-sha-256', 'SCRAM-SHA-256'],
    ['x509', 'MONGODB-X509'],
    ['mongodb-aws', 'MONGODB-AWS'],
    ['kerberos', 'GSSAPI'],
  ] as const)('maps %s → %s in URI', (formValue, driverValue) => {
    const form = { ...baseForm, authMechanism: formValue as ConnectionFormData['authMechanism'] };
    const uri = generateURIFromForm(form);
    expect(uri).toContain(`authMechanism=${driverValue}`);
  });

  it('omits authMechanism when set to none', () => {
    const form = { ...baseForm, authMechanism: 'none' as const };
    const uri = generateURIFromForm(form);
    expect(uri).not.toContain('authMechanism');
  });
});

describe('Auth mechanism mapping — parsing', () => {
  it.each([
    ['SCRAM-SHA-1', 'scram-sha-1'],
    ['SCRAM-SHA-256', 'scram-sha-256'],
    ['MONGODB-X509', 'x509'],
    ['MONGODB-AWS', 'mongodb-aws'],
    ['GSSAPI', 'kerberos'],
  ] as const)('maps %s → %s from URI', (driverValue, formValue) => {
    const uri = `mongodb://admin:secret@localhost:27017/?authMechanism=${driverValue}`;
    const result = parseURIIntoForm(uri);
    expect(result.authMechanism).toBe(formValue);
  });

  it('defaults to none when no authMechanism and no username', () => {
    const uri = 'mongodb://localhost:27017/';
    const result = parseURIIntoForm(uri);
    expect(result.authMechanism).toBe('none');
  });

  it('defaults to scram-sha-256 when username present but no authMechanism', () => {
    const uri = 'mongodb://admin:secret@localhost:27017/';
    const result = parseURIIntoForm(uri);
    expect(result.authMechanism).toBe('scram-sha-256');
  });

  it('falls back to none for unknown mechanism', () => {
    const uri = 'mongodb://admin:secret@localhost:27017/?authMechanism=UNKNOWN';
    const result = parseURIIntoForm(uri);
    expect(result.authMechanism).toBe('none');
  });
});

describe('Auth mechanism round-trip', () => {
  it.each([
    'scram-sha-1',
    'scram-sha-256',
    'x509',
    'mongodb-aws',
    'kerberos',
  ] as const)('round-trips %s through generate → parse', (mechanism) => {
    const form = { ...baseForm, authMechanism: mechanism as ConnectionFormData['authMechanism'] };
    const uri = generateURIFromForm(form);
    const parsed = parseURIIntoForm(uri);
    expect(parsed.authMechanism).toBe(mechanism);
  });
});

describe('GenerateURIOptions', () => {
  it('excludes credentials when includeCredentials is false', () => {
    const uri = generateURIFromForm(baseForm, { includeCredentials: false });
    expect(uri).not.toContain('admin');
    expect(uri).not.toContain('secret');
    expect(uri).toMatch(/^mongodb:\/\/localhost/);
  });

  it('includes credentials by default', () => {
    const uri = generateURIFromForm(baseForm);
    expect(uri).toContain('admin');
    expect(uri).toContain('secret');
  });

  it('excludes MongoPal params when includeMongoPalParams is false', () => {
    const form = { ...baseForm, sshEnabled: true, sshHost: 'bastion.example.com', sshUser: 'tunnel' };
    const uriWith = generateURIFromForm(form, { includeMongoPalParams: true });
    const uriWithout = generateURIFromForm(form, { includeMongoPalParams: false });
    expect(uriWith).toContain('mongopal.ssh.enabled=true');
    expect(uriWithout).not.toContain('mongopal.ssh');
  });
});

// ---------------------------------------------------------------------------
// parse3TParams
// ---------------------------------------------------------------------------

describe('parse3TParams', () => {
  it('extracts SSH settings from 3T params', () => {
    const params = new URLSearchParams(
      '3t.ssh=true&3t.sshAddress=bastion.example.com&3t.sshPort=2222&3t.sshUser=deployer&3t.sshAuthMode=privateKey&3t.sshPKPath=/home/user/.ssh/id_rsa'
    );
    const result = parse3TParams(params);
    expect(result.sshEnabled).toBe(true);
    expect(result.sshHost).toBe('bastion.example.com');
    expect(result.sshPort).toBe(2222);
    expect(result.sshUser).toBe('deployer');
    expect(result.sshAuthMethod).toBe('privatekey');
    expect(result.sshPrivateKey).toBe('/home/user/.ssh/id_rsa');
  });

  it('maps sshAuthMode=password correctly', () => {
    const params = new URLSearchParams('3t.ssh=true&3t.sshAuthMode=password');
    const result = parse3TParams(params);
    expect(result.sshAuthMethod).toBe('password');
  });

  it('sets tlsEnabled from 3t.sslTlsVersion when tls param not present', () => {
    const params = new URLSearchParams('3t.sslTlsVersion=TLS');
    const result = parse3TParams(params);
    expect(result.tlsEnabled).toBe(true);
  });

  it('does not override tls when already set via standard param', () => {
    const params = new URLSearchParams('tls=true&3t.sslTlsVersion=TLS');
    const result = parse3TParams(params);
    // tlsEnabled should NOT be set by 3T since standard param already handles it
    expect(result.tlsEnabled).toBeUndefined();
  });

  it('ignores unknown 3T params', () => {
    const params = new URLSearchParams('3t.uriVersion=3&3t.databases=admin&3t.alwaysShowCollections=true');
    const result = parse3TParams(params);
    expect(Object.keys(result).length).toBe(0);
  });

  it('enables SSH when sshAddress is present even without 3t.ssh=true', () => {
    const params = new URLSearchParams('3t.sshAddress=bastion.example.com');
    const result = parse3TParams(params);
    expect(result.sshEnabled).toBe(true);
    expect(result.sshHost).toBe('bastion.example.com');
  });
});

// ---------------------------------------------------------------------------
// parseURIWithName
// ---------------------------------------------------------------------------

describe('parseURIWithName', () => {
  it('extracts 3t.connection.name as connectionName', () => {
    const uri = 'mongodb://root@localhost:49931/admin?3t.connection.name=MyCluster&3t.uriVersion=3';
    const result = parseURIWithName(uri);
    expect(result.connectionName).toBe('MyCluster');
    expect(result.formData.username).toBe('root');
  });

  it('returns undefined connectionName when no 3T name param', () => {
    const uri = 'mongodb://localhost:27017/';
    const result = parseURIWithName(uri);
    expect(result.connectionName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseURIIntoForm — 3T param integration
// ---------------------------------------------------------------------------

describe('parseURIIntoForm — 3T integration', () => {
  it('merges 3T SSH params into form data', () => {
    const uri = 'mongodb://root@host1:27017/admin?3t.ssh=true&3t.sshAddress=bastion&3t.sshPort=2222&3t.sshUser=tunnel';
    const result = parseURIIntoForm(uri);
    expect(result.sshEnabled).toBe(true);
    expect(result.sshHost).toBe('bastion');
    expect(result.sshPort).toBe(2222);
    expect(result.sshUser).toBe('tunnel');
  });
});

// ---------------------------------------------------------------------------
// stripVendorParams
// ---------------------------------------------------------------------------

describe('stripVendorParams', () => {
  it('removes all 3t.* params from URI', () => {
    const uri = 'mongodb://root@host:27017/admin?authSource=admin&3t.connection.name=Test&3t.ssh=true&3t.uriVersion=3';
    const result = stripVendorParams(uri);
    expect(result).toBe('mongodb://root@host:27017/admin?authSource=admin');
    expect(result).not.toContain('3t.');
  });

  it('removes mongopal.* params from URI', () => {
    const uri = 'mongodb://host:27017/?mongopal.ssh.enabled=true&mongopal.ssh.host=bastion';
    const result = stripVendorParams(uri);
    expect(result).toBe('mongodb://host:27017/');
    expect(result).not.toContain('mongopal.');
  });

  it('returns URI unchanged when no vendor params', () => {
    const uri = 'mongodb://host:27017/mydb?authSource=admin&tls=true';
    expect(stripVendorParams(uri)).toBe(uri);
  });

  it('handles URI with no query string', () => {
    const uri = 'mongodb://host:27017/mydb';
    expect(stripVendorParams(uri)).toBe(uri);
  });

  it('removes trailing ? when all params are vendor params', () => {
    const uri = 'mongodb://host:27017/admin?3t.connection.name=Test&3t.uriVersion=3';
    const result = stripVendorParams(uri);
    expect(result).toBe('mongodb://host:27017/admin');
  });
});

// ---------------------------------------------------------------------------
// parseMultiURIText
// ---------------------------------------------------------------------------

describe('parseMultiURIText', () => {
  it('parses a single URI', () => {
    const result = parseMultiURIText('mongodb://localhost:27017');
    expect(result).toHaveLength(1);
    expect(result[0].uri).toBe('mongodb://localhost:27017');
    expect(result[0].parsed.connectionType).toBe('standalone');
  });

  it('parses multiple URIs with comments', () => {
    const text = `
// Subscription
mongodb://user:pass@sub-host:27017/admin?3t.connection.name=Subscription

// Williams Cluster
mongodb://root@williams:49931/admin?3t.connection.name=WilliamsCluster
    `;
    const result = parseMultiURIText(text);
    expect(result).toHaveLength(2);
    expect(result[0].connectionName).toBe('Subscription');
    expect(result[1].connectionName).toBe('WilliamsCluster');
  });

  it('uses comment as connection name when 3T name not present', () => {
    const text = `
// My Local Server
mongodb://localhost:27017
    `;
    const result = parseMultiURIText(text);
    expect(result).toHaveLength(1);
    expect(result[0].connectionName).toBe('My Local Server');
  });

  it('prefers 3T connection name over comment', () => {
    const text = `
// Comment Name
mongodb://host:27017/?3t.connection.name=3TName
    `;
    const result = parseMultiURIText(text);
    expect(result[0].connectionName).toBe('3TName');
  });

  it('returns empty array for blank input', () => {
    expect(parseMultiURIText('')).toHaveLength(0);
    expect(parseMultiURIText('  \n  \n  ')).toHaveLength(0);
  });

  it('returns empty array for comment-only input', () => {
    expect(parseMultiURIText('// just a comment\n// another')).toHaveLength(0);
  });

  it('ignores non-URI non-comment lines', () => {
    const text = `
// Server
mongodb://host1:27017
some random text
mongodb://host2:27017
    `;
    const result = parseMultiURIText(text);
    expect(result).toHaveLength(2);
  });

  it('handles Studio 3T full export format', () => {
    const text = `
// Subscription
mongodb://subscription_user:pwd123@sub-cluster.mongodb.net:27017/admin?authSource=admin&3t.connection.name=Subscription&3t.ssh=true&3t.sshAddress=bastion.example.com&3t.sshPort=22&3t.sshUser=deploy&3t.sshAuthMode=privateKey&3t.sshPKPath=/home/user/.ssh/id_rsa&3t.uriVersion=3

// Local Dev
mongodb://root@localhost:49931/admin?3t.connection.name=LocalDev&3t.uriVersion=3&3t.databases=admin
    `;
    const result = parseMultiURIText(text);
    expect(result).toHaveLength(2);

    // First entry — has SSH
    expect(result[0].connectionName).toBe('Subscription');
    expect(result[0].parsed.sshEnabled).toBe(true);
    expect(result[0].parsed.sshHost).toBe('bastion.example.com');
    expect(result[0].parsed.sshUser).toBe('deploy');
    expect(result[0].parsed.sshAuthMethod).toBe('privatekey');
    expect(result[0].parsed.sshPrivateKey).toBe('/home/user/.ssh/id_rsa');

    // Second entry — simple
    expect(result[1].connectionName).toBe('LocalDev');
    expect(result[1].parsed.username).toBe('root');
  });

  it('handles mongodb+srv URIs', () => {
    const result = parseMultiURIText('mongodb+srv://user:pass@cluster0.abc.mongodb.net/mydb');
    expect(result).toHaveLength(1);
    expect(result[0].parsed.connectionType).toBe('srv');
  });

  it('resets comment tracking across blank lines', () => {
    const text = `
// First comment

mongodb://host:27017
    `;
    const result = parseMultiURIText(text);
    expect(result).toHaveLength(1);
    // Blank line between comment and URI should reset the comment
    expect(result[0].connectionName).toBeUndefined();
  });
});
