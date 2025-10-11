import { useEntityCreationState } from './useEntityCreationState';

/**
 * Hook to manage subsystem creation state
 */
export function useSubsystemCreationState() {
  const initialState = {
    newSubsystemName: '',
    newSubsystemDesc: '',
    newSubsystemType: 'normal',
  };

  const state = useEntityCreationState(initialState);

  return {
    newSubsystemName: state.newSubsystemName,
    setNewSubsystemName: (value: string) => state.updateField('newSubsystemName', value),
    newSubsystemDesc: state.newSubsystemDesc,
    setNewSubsystemDesc: (value: string) => state.updateField('newSubsystemDesc', value),
    newSubsystemType: state.newSubsystemType,
    setNewSubsystemType: (value: string) => state.updateField('newSubsystemType', value),
  };
}
