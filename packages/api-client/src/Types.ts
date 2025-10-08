export interface Alter {
  id?: number;
  name?: string;
  description?: string;
  age?: number | string | null;
  gender?: string;
  pronouns?: string;
  birthday?: string;
  sexuality?: string;
  partners?: number[];
  parents?: number[];
  children?: number[];
  species?: string;
  alter_type?: string;
  job?: string;
  weapon?: string;
  soul_songs?: string[];
  interests?: string[];
  triggers?: string;
  notes?: string;
  affiliations?: number[]; // Backend returns array of group IDs
  subsystem?: number | null;
  system_roles?: string[];
  is_system_host?: boolean;
  is_dormant?: boolean;
  is_merged?: boolean;
  images?: string[];
  owner_user_id?: number | null;
  created_at?: string;
  user_relationships?: UserAlterRelationship[];
  [k: string]: unknown;
}

export interface Group {
  id?: number;
  name?: string;
  description?: string;
  sigil?: unknown;
  leaders?: number[];
  owner_user_id?: number | null;
  metadata?: unknown;
  [k: string]: unknown;
}

export interface Subsystem {
  id?: number;
  name?: string;
  description?: string;
  type?: string;
  leaders?: number[];
  owner_user_id?: number | null;
  [k: string]: unknown;
}

export interface User {
  user_id?: number;
  username?: string;
  display_name?: string;
  is_admin?: boolean;
  is_system?: boolean;
  must_change_password?: boolean;
  avatar?: string | null;
  created_at?: string;
  id?: number;
  is_approved?: boolean;
  [k: string]: unknown;
}

export interface UpdateStatus {
  available: boolean;
  current_version: string;
  latest_version?: string;
  download_url?: string;
  message: string;
  versions: VersionInfo;
}

export interface VersionInfo {
  server: string;
  db: string;
  auth: string;
  cache: string;
  error: string;
  config: string;
  oidc: string;
  metrics: string;
  housekeeping: string;
  middleware: string;
  updater: string;
  migrations: string;
  frontend: string;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  version_updated?: string;
}

export interface UpdateCheckQuery {
  check_only?: boolean;
}

export interface UserAlterRelationship {
  id: number;
  user_id: number;
  alter_id: number;
  relationship_type: 'partner' | 'parent' | 'child';
  created_at?: string;
  username?: string;
}

export interface AlterRelationshipSet {
  partners: number[];
  parents: number[];
  children: number[];
  affiliations: number[];
}

export interface UserAlterRelationshipSet {
  partners: number[];
  parents: number[];
  children: number[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
}

export interface UserListResponse extends PaginatedResponse<User> {
  // Additional fields specific to user listing if any
}

export interface UserNamesResponse {
  [username: string]: string; // username -> display_name mapping
}

export interface UserListOptions {
  is_system?: boolean;
  is_admin?: boolean;
  is_approved?: boolean;
  sort_by?: string;
  order?: string;
}

export interface AuditLogEntry {
  id?: number;
  timestamp?: string;
  user_id?: number;
  username?: string;
  action: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total?: number;
}

export interface SystemRequest {
  id: number;
  status: string;
  note?: string;
  decided_at?: string;
  created_at?: string;
}

export interface SystemRequestAdmin {
  id: number;
  user_id: number;
  username: string;
  status: string;
  note?: string;
  decided_at?: string;
  created_at?: string;
}

export interface AdminSettings {
  [key: string]: unknown;
}

export interface HousekeepingJob {
  name: string;
  description?: string;
  last_run?: string;
  enabled: boolean;
}

export interface HousekeepingRun {
  id: number;
  job_name: string;
  started_at: string;
  finished_at?: string | null;
  status: 'running' | 'success' | 'error';
  message?: string | null;
  rows_affected?: number | null;
}

export interface UploadInfo {
  id: number;
  filename: string;
  original_filename: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
  user_id: number;
  url: string;
}

export interface UploadListResponse extends PaginatedResponse<UploadInfo> {
  // Additional fields if any
}

export interface AlterName {
  id: number;
  name: string;
  user_id: number;
  username: string;
}

export interface FamilyTreeNode {
  id: number;
  name: string;
  children?: FamilyTreeNode[];
  partners?: FamilyTreeNode[];
  parents?: FamilyTreeNode[];
}

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

export interface SubsystemMember {
  alterId?: number;
  alter_name?: string;
  is_leader?: boolean;
  roles?: string[];
  [k: string]: unknown;
}

export interface GroupMember {
  user_id: number;
  username: string;
  display_name: string;
  joined_at: string;
}

export interface GroupMembersResponse {
  group_id?: number;
  alters: number[];
  [k: string]: unknown;
}

export interface DatabaseQueryRequest {
  sql: string;
  limit?: number;
}

export interface DatabaseQueryResponse {
  success: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  message?: string;
}
