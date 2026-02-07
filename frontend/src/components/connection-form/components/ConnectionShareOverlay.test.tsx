import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConnectionShareOverlay from './ConnectionShareOverlay';

// ---------------------------------------------------------------------------
// Mock Go bindings
// ---------------------------------------------------------------------------

const mockGetExtendedConnection = vi.fn();
const mockExportEncryptedConnection = vi.fn();
const mockExportEncryptedConnections = vi.fn();
const mockDecryptConnectionImport = vi.fn();
const mockSaveExtendedConnection = vi.fn();
const mockAuthenticateForPasswordReveal = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateForPasswordReveal.mockResolvedValue(undefined);
  (window as any).go = {
    main: {
      App: {
        GetExtendedConnection: mockGetExtendedConnection,
        ExportEncryptedConnection: mockExportEncryptedConnection,
        ExportEncryptedConnections: mockExportEncryptedConnections,
        DecryptConnectionImport: mockDecryptConnectionImport,
        SaveExtendedConnection: mockSaveExtendedConnection,
        AuthenticateForPasswordReveal: mockAuthenticateForPasswordReveal,
      },
    },
  };
});

afterEach(() => {
  delete (window as any).go;
});

// ---------------------------------------------------------------------------
// Export mode
// ---------------------------------------------------------------------------

describe('ConnectionShareOverlay — export mode', () => {
  const exportProps = {
    mode: 'export' as const,
    connectionId: 'conn-123',
    connectionName: 'My Server',
    onClose: vi.fn(),
  };

  it('renders the export title with connection name', () => {
    mockGetExtendedConnection.mockResolvedValue({ formData: null, mongoUri: 'mongodb://localhost' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'enc-bundle', key: 'dec-key' });

    render(<ConnectionShareOverlay {...exportProps} />);
    expect(screen.getByText('Export "My Server"')).toBeTruthy();
  });

  it('shows loading state then renders URI, bundle, and key', async () => {
    const formData = JSON.stringify({
      id: 'conn-123', name: 'My Server',
      connectionType: 'standalone',
      hosts: [{ host: 'db.example.com', port: 27017 }],
      srvHostname: '', username: 'admin', password: 's3cret',
      authMechanism: 'scram-sha-256', authDatabase: 'admin',
      defaultDatabase: '', replicaSetName: '',
      tlsEnabled: false, tlsInsecure: false,
      sshEnabled: false, socks5Enabled: false,
      maxPoolSize: 100, retryWrites: true, readPreference: 'primary',
      appName: 'mongopal', compressors: [],
      connectTimeout: 10, socketTimeout: 30, serverSelectionTimeout: 30,
      writeConcernW: 1, writeConcernJ: false, writeConcernWTimeout: 0,
      sshPort: 22, sshAuthMethod: 'password',
      socks5Port: 1080, socks5RequiresAuth: false,
      destructiveDelay: 0, requireDeleteConfirmation: false,
      color: '#4CC38A', readOnly: false, folderId: '',
    });

    mockGetExtendedConnection.mockResolvedValue({ formData, mongoUri: 'mongodb://db.example.com' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'eyJ2Ijox...', key: 'a1b2c3d4' });

    render(<ConnectionShareOverlay {...exportProps} />);

    // Loading shown initially
    expect(screen.getByText('Loading connection data...')).toBeTruthy();

    // After loading, shows URI, bundle, key
    await waitFor(() => {
      expect(screen.getByText('Copy URI')).toBeTruthy();
      expect(screen.getByText('Copy Bundle')).toBeTruthy();
      expect(screen.getByText('Copy Key')).toBeTruthy();
    });

    // Bundle and key text present
    expect(screen.getByText('eyJ2Ijox...')).toBeTruthy();
    expect(screen.getByText('a1b2c3d4')).toBeTruthy();
  });

  it('shows error when backend fails', async () => {
    mockGetExtendedConnection.mockRejectedValue(new Error('Auth cancelled'));
    mockExportEncryptedConnection.mockRejectedValue(new Error('Auth cancelled'));

    render(<ConnectionShareOverlay {...exportProps} />);

    await waitFor(() => {
      expect(screen.getByText('Auth cancelled')).toBeTruthy();
    });
  });

  it('calls onClose when Done is clicked', async () => {
    mockGetExtendedConnection.mockResolvedValue({ mongoUri: 'mongodb://localhost' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'b', key: 'k' });

    render(<ConnectionShareOverlay {...exportProps} />);

    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    fireEvent.click(screen.getByText('Done'));
    expect(exportProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    mockGetExtendedConnection.mockResolvedValue({ mongoUri: 'mongodb://localhost' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'b', key: 'k' });

    render(<ConnectionShareOverlay {...exportProps} />);

    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.textContent === '✕');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(exportProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('copies URI to clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    mockGetExtendedConnection.mockResolvedValue({ mongoUri: 'mongodb://host1:27017' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'b', key: 'k' });

    render(<ConnectionShareOverlay {...exportProps} />);

    await waitFor(() => expect(screen.getByText('Copy URI')).toBeTruthy());
    fireEvent.click(screen.getByText('Copy URI'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });

  it('renders security warning', async () => {
    mockGetExtendedConnection.mockResolvedValue({ mongoUri: 'mongodb://localhost' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'b', key: 'k' });

    render(<ConnectionShareOverlay {...exportProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Anyone with both the bundle and key/)).toBeTruthy();
    });
  });

  it('falls back to mongoUri when formData is missing', async () => {
    mockGetExtendedConnection.mockResolvedValue({ mongoUri: 'mongodb://fallback-host:27017/mydb' });
    mockExportEncryptedConnection.mockResolvedValue({ bundle: 'b', key: 'k' });

    render(<ConnectionShareOverlay {...exportProps} />);

    await waitFor(() => {
      expect(screen.getByText('mongodb://fallback-host:27017/mydb')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Import mode
// ---------------------------------------------------------------------------

describe('ConnectionShareOverlay — import mode', () => {
  const importProps = {
    mode: 'import' as const,
    onImported: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders the import title', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    expect(screen.getByText('Import Connection')).toBeTruthy();
  });

  it('renders URI input and encrypted bundle/key inputs', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    expect(screen.getByPlaceholderText(/paste multiple URIs/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...')).toBeTruthy();
    expect(screen.getByPlaceholderText('Single key, or one per line: Name: key')).toBeTruthy();
  });

  it('disables Import from URI when URI field is empty', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    const btn = screen.getByText('Import from URI');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('enables Import from URI when URI is entered', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'mongodb://localhost:27017' },
    });
    const btn = screen.getByText('Import from URI');
    expect(btn).toHaveProperty('disabled', false);
  });

  it('imports from URI successfully', async () => {
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'mongodb://myhost:27017/testdb' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(1);
      expect(importProps.onImported).toHaveBeenCalledTimes(1);
    });

    // Check the saved connection has correct host-derived name
    const saved = mockSaveExtendedConnection.mock.calls[0][0];
    expect(saved.name).toBe('myhost');
    expect(saved.mongoUri).toBe('mongodb://myhost:27017/testdb');
  });

  it('shows error for invalid URI', async () => {
    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'http://not-a-mongo-uri' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(screen.getByText('No valid MongoDB URIs found in the input')).toBeTruthy();
    });
    expect(importProps.onImported).not.toHaveBeenCalled();
  });

  it('disables Decrypt & Import when bundle or key is empty', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', true);

    // Only bundle filled
    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: '{"v":1}' },
    });
    expect(screen.getByText('Decrypt & Import')).toHaveProperty('disabled', true);
  });

  it('enables Decrypt & Import when both fields are filled', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: '{"v":1}' },
    });
    fireEvent.change(screen.getByPlaceholderText('Single key, or one per line: Name: key'), {
      target: { value: 'some-key' },
    });
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', false);
  });

  it('decrypts and imports encrypted bundle', async () => {
    const connData = { id: 'x', name: 'Decrypted' };
    mockDecryptConnectionImport.mockResolvedValue(JSON.stringify(connData));
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: '  {"v":1}  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Single key, or one per line: Name: key'), {
      target: { value: '  my-key  ' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(mockDecryptConnectionImport).toHaveBeenCalledWith('{"v":1}', 'my-key');
      expect(mockSaveExtendedConnection).toHaveBeenCalledWith(connData);
      expect(importProps.onImported).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error when decryption fails', async () => {
    mockDecryptConnectionImport.mockRejectedValue(new Error('Invalid key'));

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: '{"v":1}' },
    });
    fireEvent.change(screen.getByPlaceholderText('Single key, or one per line: Name: key'), {
      target: { value: 'wrong-key' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Invalid key')).toBeTruthy();
    });
    expect(importProps.onImported).not.toHaveBeenCalled();
  });

  it('clears error when user types in bundle field', async () => {
    mockDecryptConnectionImport.mockRejectedValue(new Error('Bad data'));

    render(<ConnectionShareOverlay {...importProps} />);

    // Trigger error
    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByPlaceholderText('Single key, or one per line: Name: key'), {
      target: { value: 'y' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));
    await waitFor(() => expect(screen.getByText('Bad data')).toBeTruthy());

    // Type in bundle — error should clear
    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: 'new-value' },
    });
    expect(screen.queryByText('Bad data')).toBeNull();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(importProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    render(<ConnectionShareOverlay {...importProps} />);
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.textContent === '✕');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(importProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('imports multiple URIs and shows result summary', async () => {
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    const multiText = [
      '// Server A',
      'mongodb://hostA:27017/?3t.connection.name=ServerA',
      '// Server B',
      'mongodb://hostB:27017/?3t.connection.name=ServerB',
      '// Server C',
      'mongodb://hostC:27017/?3t.connection.name=ServerC',
    ].join('\n');

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: multiText },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(screen.getByText('Imported 3 of 3 connections')).toBeTruthy();
    });
    expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(3);
    // onImported called once since at least one succeeded
    expect(importProps.onImported).toHaveBeenCalledTimes(1);
  });

  it('shows partial failure when one URI fails', async () => {
    let callCount = 0;
    mockSaveExtendedConnection.mockImplementation(() => {
      callCount++;
      if (callCount === 2) return Promise.reject(new Error('Duplicate connection'));
      return Promise.resolve(undefined);
    });

    render(<ConnectionShareOverlay {...importProps} />);

    const multiText = [
      'mongodb://hostA:27017/?3t.connection.name=ServerA',
      'mongodb://hostB:27017/?3t.connection.name=ServerB',
      'mongodb://hostC:27017/?3t.connection.name=ServerC',
    ].join('\n');

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: multiText },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(screen.getByText('Imported 2 of 3 connections')).toBeTruthy();
      expect(screen.getByText(/ServerB.*Duplicate connection/)).toBeTruthy();
    });
  });

  it('uses 3T connection name for single URI import', async () => {
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'mongodb://myhost:27017/?3t.connection.name=My3TName' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(1);
      expect(importProps.onImported).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveExtendedConnection.mock.calls[0][0];
    expect(saved.name).toBe('My3TName');
  });

  it('strips vendor params from stored mongoUri', async () => {
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'mongodb://host:27017/admin?authSource=admin&3t.connection.name=Test&3t.uriVersion=3' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveExtendedConnection.mock.calls[0][0];
    expect(saved.mongoUri).toBe('mongodb://host:27017/admin?authSource=admin');
    expect(saved.mongoUri).not.toContain('3t.');
  });

  it('single URI still works as before (host-derived name)', async () => {
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: 'mongodb://myhost:27017/testdb' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(1);
      expect(importProps.onImported).toHaveBeenCalledTimes(1);
    });

    const saved = mockSaveExtendedConnection.mock.calls[0][0];
    expect(saved.name).toBe('myhost');
  });

  it('shows error when no valid URIs found in text', async () => {
    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/paste multiple URIs/), {
      target: { value: '// just some comments\n// nothing useful' },
    });
    fireEvent.click(screen.getByText('Import from URI'));

    await waitFor(() => {
      expect(screen.getByText('No valid MongoDB URIs found in the input')).toBeTruthy();
    });
  });

  it('shows loading state during encrypted import', async () => {
    let resolveImport: () => void;
    mockDecryptConnectionImport.mockReturnValue(
      new Promise<string>(r => { resolveImport = () => r(JSON.stringify({ id: 'x' })); })
    );
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText('Paste a single bundle or a bulk export JSON...'), {
      target: { value: 'bundle' },
    });
    fireEvent.change(screen.getByPlaceholderText('Single key, or one per line: Name: key'), {
      target: { value: 'key' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Decrypting...')).toBeTruthy();
    });

    resolveImport!();
    await waitFor(() => {
      expect(screen.getByText('Decrypt & Import')).toBeTruthy();
    });
  });

  it('imports multi-connection bulk bundle with per-connection keys', async () => {
    const bulkBundle = JSON.stringify({
      version: 1,
      connections: [
        { name: 'Server A', bundle: 'enc-a' },
        { name: 'Server B', bundle: 'enc-b' },
      ],
    });
    const keys = 'Server A: key-a\nServer B: key-b';

    mockDecryptConnectionImport
      .mockResolvedValueOnce(JSON.stringify({ id: 'a', name: 'Server A' }))
      .mockResolvedValueOnce(JSON.stringify({ id: 'b', name: 'Server B' }));
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/bulk export JSON/), {
      target: { value: bulkBundle },
    });
    fireEvent.change(screen.getByPlaceholderText(/Name: key/), {
      target: { value: keys },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Imported 2 of 2 connections')).toBeTruthy();
    });

    expect(mockDecryptConnectionImport).toHaveBeenCalledWith('enc-a', 'key-a');
    expect(mockDecryptConnectionImport).toHaveBeenCalledWith('enc-b', 'key-b');
    expect(mockSaveExtendedConnection).toHaveBeenCalledTimes(2);
    expect(importProps.onImported).toHaveBeenCalledTimes(1);
  });

  it('shows partial failure for bulk bundle when one decryption fails', async () => {
    const bulkBundle = JSON.stringify({
      version: 1,
      connections: [
        { name: 'Server A', bundle: 'enc-a' },
        { name: 'Server B', bundle: 'enc-b' },
      ],
    });
    const keys = 'Server A: key-a\nServer B: wrong-key';

    mockDecryptConnectionImport
      .mockResolvedValueOnce(JSON.stringify({ id: 'a', name: 'Server A' }))
      .mockRejectedValueOnce(new Error('Decryption failed'));
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/bulk export JSON/), {
      target: { value: bulkBundle },
    });
    fireEvent.change(screen.getByPlaceholderText(/Name: key/), {
      target: { value: keys },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Imported 1 of 2 connections')).toBeTruthy();
      expect(screen.getByText(/Server B.*Decryption failed/)).toBeTruthy();
    });
  });

  it('shows error for bulk bundle when key is missing for a connection', async () => {
    const bulkBundle = JSON.stringify({
      version: 1,
      connections: [
        { name: 'Server A', bundle: 'enc-a' },
        { name: 'Server B', bundle: 'enc-b' },
      ],
    });
    // Only provide key for Server A
    const keys = 'Server A: key-a';

    mockDecryptConnectionImport.mockResolvedValueOnce(JSON.stringify({ id: 'a', name: 'Server A' }));
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/bulk export JSON/), {
      target: { value: bulkBundle },
    });
    fireEvent.change(screen.getByPlaceholderText(/Name: key/), {
      target: { value: keys },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Imported 1 of 2 connections')).toBeTruthy();
      expect(screen.getByText(/Server B.*No matching decryption key found/)).toBeTruthy();
    });
  });

  it('single bundle still works with bulk detection (not matching format)', async () => {
    const connData = { id: 'x', name: 'Decrypted' };
    mockDecryptConnectionImport.mockResolvedValue(JSON.stringify(connData));
    mockSaveExtendedConnection.mockResolvedValue(undefined);

    render(<ConnectionShareOverlay {...importProps} />);

    fireEvent.change(screen.getByPlaceholderText(/bulk export JSON/), {
      target: { value: 'single-encrypted-blob' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Name: key/), {
      target: { value: 'my-key' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(mockDecryptConnectionImport).toHaveBeenCalledWith('single-encrypted-blob', 'my-key');
      expect(mockSaveExtendedConnection).toHaveBeenCalledWith(connData);
      expect(importProps.onImported).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Bulk export mode
// ---------------------------------------------------------------------------

describe('ConnectionShareOverlay — bulk-export mode', () => {
  const connections = [
    { id: 'c1', name: 'Production MongoDB', folderId: 'f1' },
    { id: 'c2', name: 'Staging Server', folderId: 'f1' },
    { id: 'c3', name: 'Local Dev' },
  ];

  const folders = [
    { id: 'f1', name: 'Work' },
  ];

  const bulkProps = {
    mode: 'bulk-export' as const,
    connections,
    folders,
    onClose: vi.fn(),
  };

  it('renders the bulk export title', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    expect(screen.getByText('Export Connections')).toBeTruthy();
  });

  it('groups connections by folder', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    // Folder header should be visible
    expect(screen.getByText('Work')).toBeTruthy();
    // Root connection should still be visible
    expect(screen.getByText('Local Dev')).toBeTruthy();
    // Foldered connections visible under the folder
    expect(screen.getByText('Production MongoDB')).toBeTruthy();
    expect(screen.getByText('Staging Server')).toBeTruthy();
  });

  it('shows nested folder paths', () => {
    const nestedConns = [
      { id: 'c1', name: 'Deep Conn', folderId: 'f2' },
    ];
    const nestedFolders = [
      { id: 'f1', name: 'Team' },
      { id: 'f2', name: 'Backend', parentId: 'f1' },
    ];
    render(<ConnectionShareOverlay mode="bulk-export" connections={nestedConns} folders={nestedFolders} onClose={vi.fn()} />);
    expect(screen.getByText('Team / Backend')).toBeTruthy();
  });

  it('renders all connections checked by default', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // 1 "Select All" + 3 connection checkboxes
    expect(checkboxes).toHaveLength(4);
    checkboxes.forEach(cb => {
      expect((cb as HTMLInputElement).checked).toBe(true);
    });
  });

  it('deselect all toggle unchecks all connections', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    // Click the Select All label to deselect all
    fireEvent.click(screen.getByText(/Select All/));
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(cb => {
      expect((cb as HTMLInputElement).checked).toBe(false);
    });
  });

  it('select all toggle re-checks all connections', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    // Deselect all
    fireEvent.click(screen.getByText(/Select All/));
    // Re-select all
    fireEvent.click(screen.getByText(/Select All/));
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(cb => {
      expect((cb as HTMLInputElement).checked).toBe(true);
    });
  });

  it('disables export button when none selected', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByText(/Select All/));
    const exportBtn = screen.getByText('Export 0');
    expect(exportBtn).toHaveProperty('disabled', true);
  });

  it('shows correct count on export button', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    expect(screen.getByText('Export 3')).toBeTruthy();
    // Uncheck one
    fireEvent.click(screen.getByText('Staging Server'));
    expect(screen.getByText('Export 2')).toBeTruthy();
  });

  it('exports selected connections as encrypted bundle with single shared key', async () => {
    mockExportEncryptedConnections.mockResolvedValueOnce({
      version: 1,
      connections: [
        { name: 'Production MongoDB', bundle: 'b1' },
        { name: 'Staging Server', bundle: 'b2' },
        { name: 'Local Dev', bundle: 'b3' },
      ],
      key: 'shared-key-abc',
    });

    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByText('Export 3'));

    await waitFor(() => {
      expect(screen.getByText('Exported 3 connections')).toBeTruthy();
      expect(screen.getByText('Copy Bundle')).toBeTruthy();
    });

    // Verify the result contains the JSON bundle
    expect(screen.getByText(/\"version\": 1/)).toBeTruthy();
    expect(mockExportEncryptedConnections).toHaveBeenCalledWith(['c1', 'c2', 'c3']);

    // Verify single decryption key shown
    expect(screen.getByText('Decryption Key')).toBeTruthy();
    expect(screen.getByText('Copy Key')).toBeTruthy();
    expect(screen.getByText('shared-key-abc')).toBeTruthy();
  });

  it('exports selected connections as URI list with OS auth', async () => {
    const makeFd = (host: string, user: string) => JSON.stringify({
      id: 'x', name: 'x',
      connectionType: 'standalone',
      hosts: [{ host, port: 27017 }],
      srvHostname: '', username: user, password: 'pass',
      authMechanism: 'scram-sha-256', authDatabase: 'admin',
      defaultDatabase: '', replicaSetName: '',
      tlsEnabled: false, tlsInsecure: false,
      sshEnabled: false, socks5Enabled: false,
      maxPoolSize: 100, retryWrites: true, readPreference: 'primary',
      appName: 'mongopal', compressors: [],
      connectTimeout: 10, socketTimeout: 30, serverSelectionTimeout: 30,
      writeConcernW: 1, writeConcernJ: false, writeConcernWTimeout: 0,
      sshPort: 22, sshAuthMethod: 'password',
      socks5Port: 1080, socks5RequiresAuth: false,
      destructiveDelay: 0, requireDeleteConfirmation: false,
      color: '#4CC38A', readOnly: false, folderId: '',
    });

    mockGetExtendedConnection
      .mockResolvedValueOnce({ formData: makeFd('prod-host', 'admin'), mongoUri: '' })
      .mockResolvedValueOnce({ formData: makeFd('staging-host', 'admin'), mongoUri: '' })
      .mockResolvedValueOnce({ formData: makeFd('localhost', ''), mongoUri: '' });

    render(<ConnectionShareOverlay {...bulkProps} />);

    // Switch to URI List format
    fireEvent.click(screen.getByLabelText('URI List'));

    fireEvent.click(screen.getByText('Export 3'));

    await waitFor(() => {
      expect(screen.getByText('Exported 3 connections')).toBeTruthy();
    });

    // Verify OS auth was called before fetching connections
    expect(mockAuthenticateForPasswordReveal).toHaveBeenCalledTimes(1);

    // Check that the output contains connection names as comments
    expect(screen.getByText(/\/\/ Production MongoDB/)).toBeTruthy();
    expect(screen.getByText(/\/\/ Staging Server/)).toBeTruthy();
    expect(screen.getByText(/\/\/ Local Dev/)).toBeTruthy();
    expect(screen.getByText(/URIs contain credentials/)).toBeTruthy();
  });

  it('blocks URI list export when OS auth is denied', async () => {
    mockAuthenticateForPasswordReveal.mockRejectedValueOnce(new Error('Authentication cancelled'));

    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByLabelText('URI List'));
    fireEvent.click(screen.getByText('Export 3'));

    await waitFor(() => {
      expect(screen.getByText('Authentication cancelled')).toBeTruthy();
    });

    // Should not have fetched any connection data
    expect(mockGetExtendedConnection).not.toHaveBeenCalled();
  });

  it('shows progress indicator during export', async () => {
    type BulkResult = { version: number; connections: Array<{ name: string; bundle: string }>; key: string };
    let resolveExport: (v: BulkResult) => void;
    mockExportEncryptedConnections.mockReturnValueOnce(
      new Promise<BulkResult>(r => { resolveExport = r; })
    );

    render(<ConnectionShareOverlay {...bulkProps} />);

    // Only select one connection for simpler progress testing
    fireEvent.click(screen.getByText(/Select All/));
    fireEvent.click(screen.getByText('Production MongoDB'));
    fireEvent.click(screen.getByText('Export 1'));

    await waitFor(() => {
      expect(screen.getByText(/Exporting \d+ of \d+/)).toBeTruthy();
    });

    resolveExport!({ version: 1, connections: [{ name: 'Production MongoDB', bundle: 'b' }], key: 'k' });
    await waitFor(() => {
      expect(screen.getByText('Exported 1 connection')).toBeTruthy();
    });
  });

  it('shows encrypted bundle warning', async () => {
    mockExportEncryptedConnections.mockResolvedValueOnce({
      version: 1,
      connections: [{ name: 'Production MongoDB', bundle: 'b' }],
      key: 'k',
    });

    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByText(/Select All/));
    fireEvent.click(screen.getByText('Production MongoDB'));
    fireEvent.click(screen.getByText('Export 1'));

    await waitFor(() => {
      expect(screen.getByText(/Anyone with both the bundle and key/)).toBeTruthy();
    });
  });

  it('shows error when backend fails', async () => {
    mockExportEncryptedConnections.mockRejectedValueOnce(new Error('Export failed'));

    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByText(/Select All/));
    fireEvent.click(screen.getByText('Production MongoDB'));
    fireEvent.click(screen.getByText('Export 1'));

    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeTruthy();
    });
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<ConnectionShareOverlay {...bulkProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(bulkProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Done is clicked after export', async () => {
    mockExportEncryptedConnections.mockResolvedValueOnce({
      version: 1,
      connections: [{ name: 'Production MongoDB', bundle: 'b' }],
      key: 'k',
    });

    const closeHandler = vi.fn();
    render(<ConnectionShareOverlay {...bulkProps} onClose={closeHandler} />);
    fireEvent.click(screen.getByText(/Select All/));
    fireEvent.click(screen.getByText('Production MongoDB'));
    fireEvent.click(screen.getByText('Export 1'));

    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    fireEvent.click(screen.getByText('Done'));
    expect(closeHandler).toHaveBeenCalledTimes(1);
  });

  it('exports only selected connections', async () => {
    mockExportEncryptedConnections.mockResolvedValueOnce({
      version: 1,
      connections: [
        { name: 'Production MongoDB', bundle: 'b1' },
        { name: 'Local Dev', bundle: 'b3' },
      ],
      key: 'shared-key',
    });

    render(<ConnectionShareOverlay {...bulkProps} />);
    // Deselect "Staging Server"
    fireEvent.click(screen.getByText('Staging Server'));
    fireEvent.click(screen.getByText('Export 2'));

    await waitFor(() => {
      expect(screen.getByText('Exported 2 connections')).toBeTruthy();
    });

    expect(mockExportEncryptedConnections).toHaveBeenCalledWith(['c1', 'c3']);
  });
});
