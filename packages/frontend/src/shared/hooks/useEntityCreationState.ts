import { useState } from 'react';
/**
 * Generic hook for managing entity creation state
 */
export function useEntityCreationState<T extends Record<string, any>>(initialState: T) {
  const [state, setState] = useState<T>(initialState);

  const updateField = <K extends keyof T>(field: K, value: T[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  };

  const reset = () => {
    setState(initialState);
  };

  return {
    ...state,
    updateField,
    reset,
    setState,
  };
}
