// Shared UI-facing types to avoid importing generated-client types directly
export type Id = string;

export interface ApiUser {
  id?: Id;
  username?: string;
  is_admin?: boolean;
  is_system?: boolean;
  avatar?: string | null;
  [key: string]: any;
}

export interface ApiSystemDetail {
  id?: Id;
  name?: string;
  [key: string]: any;
}

export interface ApiAlter {
  id?: Id;
  name?: string;
  username?: string;
  birthday?: string | null;
  owner_user_id?: Id | null;
  [key: string]: any;
}

export interface AlterModel {
  id?: Id;
  name?: string;
  partners?: Id[];
  parents?: Id[];
  children?: Id[];
  user_partners?: Id[];
  user_parents?: Id[];
  user_children?: Id[];
  [key: string]: any;
}

export interface SystemRequest {
  id?: Id;
  status?: 'pending' | 'approved' | 'rejected' | string;
  [key: string]: any;
}

export default {} as const;
