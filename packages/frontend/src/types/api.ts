import type {
  Alter,
  Group,
  GroupMember,
  Subsystem,
  User,
  UploadInfo,
  HousekeepingJob,
  HousekeepingRun,
  AuditLogEntry,
  SystemRequest,
} from '@didhub/api-client';

export type {
  Alter,
  Group,
  GroupMember,
  Subsystem,
  User,
  UploadInfo,
  HousekeepingJob,
  HousekeepingRun,
  AuditLogEntry,
  SystemRequest,
};

export interface UploadRecord {
  id: number;
  stored_name: string;
  hash?: string | null;
  user_id?: number | null;
  mime?: string | null;
  bytes?: number | null;
  created_at?: string | null;
  deleted_at?: string | null;
  original_name?: string | null;
}

export interface UploadListResult {
  items: UploadRecord[];
  total: number;
  limit: number;
  offset: number;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonRecord = Record<string, JsonValue>;

export interface ApiErrorPayload extends JsonRecord {
  error?: string;
  message?: string;
  code?: string;
}

export interface PendingResponse {
  pending: true;
  message?: string | null;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  payload?: T;
}

export interface FailureResponse {
  success: false;
  error: string;
}
