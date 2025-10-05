import { useCallback } from 'react';
import { FamilyTreeView } from '@didhub/family-tree';
import { apiClient } from '@didhub/api-client';
import { useAuth } from '../contexts/AuthContext';

export default function FamilyTree() {
  const { user } = useAuth();

  const fetchFamilyTree = useCallback(() => apiClient.alters.familyTree(), []);

  return <FamilyTreeView refreshKey={user?.id ?? null} fetchFamilyTree={fetchFamilyTree} />;
}
