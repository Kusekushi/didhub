import type { EdgeKind } from './components/graph/types';

export const EDGE_LABELS: Record<EdgeKind, string> = {
  parent: 'Parent ↔ Child',
  partner: 'Partnered alters',
  'user-partner': 'Alter ↔ User (partner)',
  'user-parent': 'User → Alter (parent)',
  'user-child': 'Alter → User (child)',
};
