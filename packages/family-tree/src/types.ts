export interface FamilyTreeNodeData {
  id: number;
  name?: string;
  partners: number[];
  parents: number[];
  children: number[];
  age?: string;
  system_roles?: string[];
  owner_user_id?: number;
  user_partners?: number[];
  user_parents?: number[];
  user_children?: number[];
}

export interface FamilyTreeEdges {
  parent: [number, number][];
  partner: [number, number][];
}

export interface FamilyTreeOwner {
  id: number;
  username?: string;
  is_system?: boolean;
}

export interface NestedFamilyTreeNode {
  id: number;
  name: string;
  partners: number[];
  parents: number[];
  children: NestedFamilyTreeNode[];
  affiliations: number[];
  duplicated: boolean;
}

export interface FamilyTreeResponse {
  nodes: Record<string, FamilyTreeNodeData>;
  edges: FamilyTreeEdges;
  roots: NestedFamilyTreeNode[];
  owners?: Record<string, FamilyTreeOwner>;
}
