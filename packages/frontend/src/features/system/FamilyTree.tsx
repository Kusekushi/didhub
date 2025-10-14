import { useCallback } from 'react';
import { FamilyTreeView } from '@didhub/family-tree';
import { getFamilyTree } from '../../services/alterService';
import { useAuth } from '../../shared/contexts/AuthContext';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';

export default function FamilyTree() {
  const { user } = useAuth();

  const fetchFamilyTree = useCallback(async () => {
    const resp = await getFamilyTree();
    // The family-tree package expects a specific shape; coerce the API response at runtime.
    return (resp ?? null) as unknown as any;
  }, []);

  const refreshKey = user?.id ? (normalizeEntityId(user.id) ?? null) : null;

  return <FamilyTreeView refreshKey={refreshKey} fetchFamilyTree={fetchFamilyTree} />;
}
