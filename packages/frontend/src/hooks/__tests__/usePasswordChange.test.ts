import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { usePasswordChange } from '../usePasswordChange';

describe('usePasswordChange', () => {
  const mockChangePassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty passwords and no error', () => {
    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    expect(result.current.currentPassword).toBe('');
    expect(result.current.newPassword).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('should allow setting current password', () => {
    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    act(() => {
      result.current.setCurrentPassword('current123');
    });

    expect(result.current.currentPassword).toBe('current123');
  });

  it('should allow setting new password', () => {
    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    act(() => {
      result.current.setNewPassword('new123');
    });

    expect(result.current.newPassword).toBe('new123');
  });

  it('should handle successful password change', async () => {
    mockChangePassword.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    // Set passwords
    act(() => {
      result.current.setCurrentPassword('current123');
      result.current.setNewPassword('new123');
    });

    // Perform change
    await act(async () => {
      await result.current.handleChange();
    });

    expect(mockChangePassword).toHaveBeenCalledWith('current123', 'new123');
    expect(result.current.error).toBeNull();
    expect(result.current.currentPassword).toBe(''); // Should be cleared
    expect(result.current.newPassword).toBe(''); // Should be cleared
  });

  it('should handle password change failure with custom error', async () => {
    mockChangePassword.mockResolvedValue({
      ok: false,
      error: 'Current password is incorrect',
    });

    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    act(() => {
      result.current.setCurrentPassword('wrong');
      result.current.setNewPassword('new123');
    });

    await act(async () => {
      await result.current.handleChange();
    });

    expect(mockChangePassword).toHaveBeenCalledWith('wrong', 'new123');
    expect(result.current.error).toBe('Current password is incorrect');
    expect(result.current.currentPassword).toBe('wrong'); // Should not be cleared
    expect(result.current.newPassword).toBe('new123'); // Should not be cleared
  });

  it('should handle password change failure with default error', async () => {
    mockChangePassword.mockResolvedValue({ ok: false });

    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    act(() => {
      result.current.setCurrentPassword('current');
      result.current.setNewPassword('new');
    });

    await act(async () => {
      await result.current.handleChange();
    });

    expect(result.current.error).toBe('Failed to change password');
  });

  it('should clear previous error on new change attempt', async () => {
    // First attempt fails
    mockChangePassword.mockResolvedValueOnce({
      ok: false,
      error: 'First error',
    });
    // Second attempt succeeds
    mockChangePassword.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    // First failed attempt
    act(() => {
      result.current.setCurrentPassword('wrong1');
      result.current.setNewPassword('new1');
    });

    await act(async () => {
      await result.current.handleChange();
    });

    expect(result.current.error).toBe('First error');

    // Second successful attempt
    act(() => {
      result.current.setCurrentPassword('correct');
      result.current.setNewPassword('new2');
    });

    await act(async () => {
      await result.current.handleChange();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.currentPassword).toBe('');
    expect(result.current.newPassword).toBe('');
  });

  it('should handle async errors', async () => {
    mockChangePassword.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePasswordChange({ changePassword: mockChangePassword }));

    act(() => {
      result.current.setCurrentPassword('current');
      result.current.setNewPassword('new');
    });

    // The hook doesn't handle async errors explicitly, so this should throw
    await expect(
      act(async () => {
        await result.current.handleChange();
      }),
    ).rejects.toThrow('Network error');
  });
});
