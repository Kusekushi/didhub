import { Alter } from '@didhub/api-client';
import { useEntityCreationState } from './useEntityCreationState';

/**
 * Hook to manage group creation state
 */
export function useGroupCreationState() {
  const initialState = {
    newGroupName: '',
    newGroupDesc: '',
    newGroupLeaders: [] as Alter[],
    newGroupSigilFiles: [] as File[],
    newGroupSigilUrl: null as string | null,
    newGroupSigilUploading: false,
    newGroupSigilDrag: false,
    leaderQuery: '',
  };

  const state = useEntityCreationState(initialState);

  return {
    newGroupName: state.newGroupName,
    setNewGroupName: (value: string) => state.updateField('newGroupName', value),
    newGroupDesc: state.newGroupDesc,
    setNewGroupDesc: (value: string) => state.updateField('newGroupDesc', value),
    newGroupLeaders: state.newGroupLeaders,
    setNewGroupLeaders: (value: Alter[]) => state.updateField('newGroupLeaders', value),
    newGroupSigilFiles: state.newGroupSigilFiles,
    setNewGroupSigilFiles: (value: File[]) => state.updateField('newGroupSigilFiles', value),
    newGroupSigilUrl: state.newGroupSigilUrl,
    setNewGroupSigilUrl: (value: string | null) => state.updateField('newGroupSigilUrl', value),
    newGroupSigilUploading: state.newGroupSigilUploading,
    setNewGroupSigilUploading: (value: boolean) => state.updateField('newGroupSigilUploading', value),
    newGroupSigilDrag: state.newGroupSigilDrag,
    setNewGroupSigilDrag: (value: boolean) => state.updateField('newGroupSigilDrag', value),
    leaderQuery: state.leaderQuery,
    setLeaderQuery: (value: string) => state.updateField('leaderQuery', value),
  };
}
