import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExportEncryptedOverlay from './ExportEncryptedOverlay';

describe('ExportEncryptedOverlay', () => {
  const defaultProps = {
    bundle: '{"v":1,"app":"mongopal","data":"encrypted..."}',
    decryptionKey: 'ABCDEF123456_test-key-value-here-xxxxxxxxxxxx',
    connectionName: 'My Test Connection',
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders connection name', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText(/My Test Connection/)).toBeTruthy();
  });

  it('renders the encrypted bundle', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText(defaultProps.bundle)).toBeTruthy();
  });

  it('renders the decryption key', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText(defaultProps.decryptionKey)).toBeTruthy();
  });

  it('renders copy buttons for bundle and key', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText('Copy Bundle')).toBeTruthy();
    expect(screen.getByText('Copy Key')).toBeTruthy();
  });

  it('renders security warning', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText(/Anyone with both the bundle and key/)).toBeTruthy();
  });

  it('calls onClose when Done button is clicked', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    fireEvent.click(screen.getByText('Done'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    render(<ExportEncryptedOverlay {...defaultProps} />);
    // The close button has ✕ character
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.textContent === '✕');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('copies bundle to clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ExportEncryptedOverlay {...defaultProps} />);
    fireEvent.click(screen.getByText('Copy Bundle'));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(defaultProps.bundle);
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });

  it('copies key to clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ExportEncryptedOverlay {...defaultProps} />);
    fireEvent.click(screen.getByText('Copy Key'));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(defaultProps.decryptionKey);
      expect(screen.getByText('Copied!')).toBeTruthy();
    });
  });
});
