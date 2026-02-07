import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportEncryptedOverlay from './ImportEncryptedOverlay';

describe('ImportEncryptedOverlay', () => {
  const defaultProps = {
    onImport: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and both input fields', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    expect(screen.getByText('Import Encrypted Connection')).toBeTruthy();
    expect(screen.getByPlaceholderText('Paste the encrypted bundle here')).toBeTruthy();
    expect(screen.getByPlaceholderText('Paste the decryption key here')).toBeTruthy();
  });

  it('disables Decrypt button when fields are empty', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('disables Decrypt button when only bundle is filled', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: '{"v":1}' },
    });
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('disables Decrypt button when only key is filled', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: 'some-key' },
    });
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', true);
  });

  it('enables Decrypt button when both fields are filled', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: '{"v":1}' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: 'some-key' },
    });
    const btn = screen.getByText('Decrypt & Import');
    expect(btn).toHaveProperty('disabled', false);
  });

  it('calls onImport with trimmed values', async () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: '  {"v":1}  ' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: '  my-key  ' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(defaultProps.onImport).toHaveBeenCalledWith('{"v":1}', 'my-key');
    });
  });

  it('displays error when onImport throws', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('Invalid key'));
    render(<ImportEncryptedOverlay {...{ ...defaultProps, onImport }} />);

    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: '{"v":1}' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: 'wrong-key' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    await waitFor(() => {
      expect(screen.getByText('Invalid key')).toBeTruthy();
    });
  });

  it('clears error when user types in bundle field', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('Bad data'));
    render(<ImportEncryptedOverlay {...{ ...defaultProps, onImport }} />);

    // Trigger error
    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: 'y' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));
    await waitFor(() => expect(screen.getByText('Bad data')).toBeTruthy());

    // Type in bundle field — error should clear
    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: 'new-value' },
    });
    expect(screen.queryByText('Bad data')).toBeNull();
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when X button is clicked', () => {
    render(<ImportEncryptedOverlay {...defaultProps} />);
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.textContent === '✕');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows loading state during import', async () => {
    let resolveImport: () => void;
    const onImport = vi.fn().mockReturnValue(new Promise<void>(r => { resolveImport = r; }));
    render(<ImportEncryptedOverlay {...{ ...defaultProps, onImport }} />);

    fireEvent.change(screen.getByPlaceholderText('Paste the encrypted bundle here'), {
      target: { value: 'bundle' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste the decryption key here'), {
      target: { value: 'key' },
    });
    fireEvent.click(screen.getByText('Decrypt & Import'));

    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText('Decrypting...')).toBeTruthy();
    });

    // Resolve and verify it returns to normal
    resolveImport!();
    await waitFor(() => {
      expect(screen.getByText('Decrypt & Import')).toBeTruthy();
    });
  });
});
