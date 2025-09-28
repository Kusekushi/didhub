export interface Alter {
  id?: number | string;
  name?: string;
  description?: string;
  age?: number | string | null;
  gender?: string;
  pronouns?: string;
  birthday?: string;
  sexuality?: string;
  partners?: Array<string | number> | string | number;
  parents?: Array<string | number> | string | number;
  children?: Array<string | number> | string | number;
  species?: string;
  alter_type?: string;
  job?: string;
  weapon?: string;
  soul_songs?: string[] | string;
  interests?: string[] | string;
  triggers?: string;
  notes?: string;
  affiliation?: string[] | string;
  affiliations?: Array<number | string>; // Backend returns array of group IDs
  subsystem?: number | string;
  system_roles?: string[] | string;
  is_system_host?: boolean;
  is_dormant?: boolean;
  is_merged?: boolean;
  images?: string[] | string;
  owner_user_id?: number | string;
  created_at?: string;
  user_relationships?: UserAlterRelationship[];
  [k: string]: unknown;
}

export interface Group {
  id?: number | string;
  name?: string;
  description?: string;
  sigil?: string[] | unknown;
  leaders?: Array<number | string | { id?: number | string; name?: string }>;
  [k: string]: unknown;
}

export interface Subsystem {
  id?: number | string;
  name?: string;
  description?: string;
  type?: string;
  leaders?: Array<number | string | { id?: number | string; name?: string }>;
  owner_user_id?: number | string;
  [k: string]: unknown;
}

export interface User {
  user_id?: number | string;
  username?: string;
  display_name?: string;
  is_admin?: boolean;
  is_system?: boolean;
  must_change_password?: boolean;
  avatar?: string | null;
  created_at?: string;
  id?: number | string;
  is_approved?: boolean;
  // allow extra unknown fields without using `any`
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
  next_run?: string;
  enabled: boolean;
}

export interface HousekeepingRun {
  id: number;
  job_name: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed';
  result?: string;
  dry_run: boolean;
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

export interface FamilyTreeResponse {
  nodes: FamilyTreeNode[];
}

export interface ShortLink {
  id: string;
  type: string;
  target_id: number;
  created_at: string;
  clicks: number;
}

export interface SubsystemMember {
  alter_id: number;
  alter_name: string;
  is_leader: boolean;
}

export interface GroupMember {
  user_id: number;
  username: string;
  display_name: string;
  joined_at: string;
}
