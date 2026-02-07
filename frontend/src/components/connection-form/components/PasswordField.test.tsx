import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PasswordField } from './PasswordField';

describe('PasswordField', () => {
  beforeEach(() => {
    // Mock Wails API
    window.go = {
      main: {
        App: {
          IsAuthenticatedForPasswordReveal: vi.fn().mockResolvedValue(false),
          AuthenticateForPasswordReveal: vi.fn().mockResolvedValue(undefined),
        } as any,
      },
    };
  });

  it('renders password input in hidden mode by default', () => {
    const onChange = vi.fn();
    render(<PasswordField value="secret123" onChange={onChange} />);

    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');
    expect(input.value).toBe('secret123');
  });

  it('shows eye icon to reveal password', () => {
    const onChange = vi.fn();
    render(<PasswordField value="secret123" onChange={onChange} />);

    const revealButton = screen.getByRole('button');
    expect(revealButton).toBeInTheDocument();
    expect(revealButton).toHaveAttribute('title', expect.stringContaining('Reveal password'));
  });

  it('disables reveal button when value is empty', () => {
    const onChange = vi.fn();
    render(<PasswordField value="" onChange={onChange} />);

    const revealButton = screen.getByRole('button');
    expect(revealButton).toBeDisabled();
  });

  it('calls authentication when revealing password', async () => {
    const onChange = vi.fn();
    const mockAuth = vi.fn().mockResolvedValue(undefined);
    window.go!.main!.App!.AuthenticateForPasswordReveal = mockAuth;

    render(<PasswordField value="secret123" onChange={onChange} />);

    const revealButton = screen.getByRole('button');
    fireEvent.click(revealButton);

    await waitFor(() => {
      expect(mockAuth).toHaveBeenCalled();
    });
  });

  it('reveals password after successful authentication', async () => {
    const onChange = vi.fn();
    window.go!.main!.App!.IsAuthenticatedForPasswordReveal = vi.fn().mockResolvedValue(false);
    window.go!.main!.App!.AuthenticateForPasswordReveal = vi.fn().mockResolvedValue(undefined);

    render(<PasswordField value="secret123" onChange={onChange} />);

    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(input.type).toBe('password');

    const revealButton = screen.getByRole('button');
    fireEvent.click(revealButton);

    await waitFor(() => {
      expect(input.type).toBe('text');
    });
  });

  it('hides password when clicking reveal button again', async () => {
    const onChange = vi.fn();
    window.go!.main!.App!.IsAuthenticatedForPasswordReveal = vi.fn().mockResolvedValue(false);
    window.go!.main!.App!.AuthenticateForPasswordReveal = vi.fn().mockResolvedValue(undefined);

    render(<PasswordField value="secret123" onChange={onChange} />);

    const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    const revealButton = screen.getByRole('button');

    // Reveal
    fireEvent.click(revealButton);
    await waitFor(() => {
      expect(input.type).toBe('text');
    });

    // Hide again
    fireEvent.click(revealButton);
    await waitFor(() => {
      expect(input.type).toBe('password');
    });
  });

  it('skips authentication if already authenticated', async () => {
    const onChange = vi.fn();
    window.go!.main!.App!.IsAuthenticatedForPasswordReveal = vi.fn().mockResolvedValue(true);
    const mockAuth = vi.fn();
    window.go!.main!.App!.AuthenticateForPasswordReveal = mockAuth;

    render(<PasswordField value="secret123" onChange={onChange} />);

    const revealButton = screen.getByRole('button');
    fireEvent.click(revealButton);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
      expect(input.type).toBe('text');
    });

    // Should not call auth since already authenticated
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('calls onChange when password value changes', () => {
    const onChange = vi.fn();
    render(<PasswordField value="secret123" onChange={onChange} />);

    const input = screen.getByPlaceholderText('••••••••');
    fireEvent.change(input, { target: { value: 'newpassword' } });

    expect(onChange).toHaveBeenCalledWith('newpassword');
  });
});
