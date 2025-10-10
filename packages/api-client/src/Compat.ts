import type {
  ApiRoutesAltersNamesItem,
  ApiGroupOut,
  ApiGroupMembersOut,
  ApiSubsystemOut,
  ApiUserAlterRelationship,
  ApiJobInfo,
  ApiSystemRequestResponse,
} from './generated/Types';

export type AlterName = ApiRoutesAltersNamesItem;
export type Group = ApiGroupOut;
export type GroupsGroupOut = ApiGroupOut;
export type GroupMembersResponse = ApiGroupMembersOut;
export type Subsystem = ApiSubsystemOut;
export interface SubsystemMember {
  alterId?: number | string | null;
  alter_id?: number | string | null;
  roles?: unknown;
  [key: string]: unknown;
}
export type UserAlterRelationship = ApiUserAlterRelationship;
export type HousekeepingJob = ApiJobInfo;
export interface UpdateStatus {
  available: boolean;
  current_version?: string | null;
  latest_version?: string | null;
  message?: string | null;
  versions?: Record<string, string | null> | null;
  [key: string]: unknown;
}
export interface UpdateResult {
  success: boolean;
  message?: string | null;
  metadata?: unknown;
  [key: string]: unknown;
}
export type SystemRequest = ApiSystemRequestResponse;
export interface OidcProviderAdminView {
  id: string;
  client_id?: string | null;
  client_secret?: string | null;
  has_client_secret?: boolean | null;
  enabled?: boolean | null;
  [key: string]: unknown;
}
