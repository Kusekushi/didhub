import { useState } from 'react';

interface UsePasswordChangeProps {
  changePassword: (current: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Hook for managing password change state and logic
 */
export function usePasswordChange({ changePassword }: UsePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = async () => {
    setError(null);
    const result = await changePassword(currentPassword, newPassword);
    if (!result.ok) {
      setError(result.error || 'Failed to change password');
    } else {
      setCurrentPassword('');
      setNewPassword('');
      setError(null);
    }
  };

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    error,
    handleChange,
  };
}
