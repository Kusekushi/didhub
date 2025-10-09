// Auto-generated API client - do not edit manually

import { ApiError, HttpClient, HttpClientConfig, HttpResponse, RequestOptions } from './core/HttpClient';

export interface ApiClientModules {
  admins: AdminApi;
  alters: AlterApi;
  groups: GroupApi;
  oidcs: OIDCApi;
  posts: PostApi;
  reports: ReportApi;
  subsystems: SubsystemApi;
  users: UserApi;
}

export class ApiClient implements ApiClientModules {
  readonly http: HttpClient;
  readonly admins: AdminApi;
  readonly alters: AlterApi;
  readonly groups: GroupApi;
  readonly oidcs: OIDCApi;
  readonly posts: PostApi;
  readonly reports: ReportApi;
  readonly subsystems: SubsystemApi;
  readonly users: UserApi;

  constructor(config: HttpClientConfig = {}) {
    this.http = new HttpClient(config);
    this.admins = new AdminApi(this.http);
    this.alters = new AlterApi(this.http);
    this.groups = new GroupApi(this.http);
    this.oidcs = new OIDCApi(this.http);
    this.posts = new PostApi(this.http);
    this.reports = new ReportApi(this.http);
    this.subsystems = new SubsystemApi(this.http);
    this.users = new UserApi(this.http);
  }
}

export class AdminApi {
  constructor(private readonly http: HttpClient) {}

  async users_names(): Promise<any> {
    return this.http.request({
      path: '/api/users/names',
      method: 'GET',
    });
  }  async get_users_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/users/${id}`,
      method: 'GET',
    });
  }  async put_users_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/users/${id}`,
      method: 'PUT',
    });
  }  async delete_users_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/users/${id}`,
      method: 'DELETE',
    });
  }  async system_requests(): Promise<any> {
    return this.http.request({
      path: '/api/system-requests',
      method: 'GET',
    });
  }  async post_system_requests_by_id_decide(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/system-requests/${id}/decide`,
      method: 'POST',
    });
  }  async get_settings(): Promise<any> {
    return this.http.request({
      path: '/api/settings',
      method: 'GET',
    });
  }  async put_settings(): Promise<any> {
    return this.http.request({
      path: '/api/settings',
      method: 'PUT',
    });
  }  async get_settings_by_key(key: string | number): Promise<any> {
    return this.http.request({
      path: `/api/settings/${key}`,
      method: 'GET',
    });
  }  async put_settings_by_key(key: string | number): Promise<any> {
    return this.http.request({
      path: `/api/settings/${key}`,
      method: 'PUT',
    });
  }  async post_admin_reload_upload_dir(): Promise<any> {
    return this.http.request({
      path: '/api/admin/reload-upload-dir',
      method: 'POST',
    });
  }  async post_admin_migrate_upload_dir(): Promise<any> {
    return this.http.request({
      path: '/api/admin/migrate-upload-dir',
      method: 'POST',
    });
  }  async admin_redis(): Promise<any> {
    return this.http.request({
      path: '/api/admin/redis',
      method: 'GET',
    });
  }  async admin_update_check(): Promise<any> {
    return this.http.request({
      path: '/api/admin/update/check',
      method: 'GET',
    });
  }  async post_admin_update(): Promise<any> {
    return this.http.request({
      path: '/api/admin/update',
      method: 'POST',
    });
  }  async post_admin_digest_custom(): Promise<any> {
    return this.http.request({
      path: '/api/admin/digest/custom',
      method: 'POST',
    });
  }  async post_admin_db_query(): Promise<any> {
    return this.http.request({
      path: '/api/admin/db/query',
      method: 'POST',
    });
  }  async admin_oidc(): Promise<any> {
    return this.http.request({
      path: '/api/admin/oidc',
      method: 'GET',
    });
  }  async post_audit_purge(): Promise<any> {
    return this.http.request({
      path: '/api/audit/purge',
      method: 'POST',
    });
  }  async post_audit_clear(): Promise<any> {
    return this.http.request({
      path: '/api/audit/clear',
      method: 'POST',
    });
  }  async housekeeping_jobs(): Promise<any> {
    return this.http.request({
      path: '/api/housekeeping/jobs',
      method: 'GET',
    });
  }  async get_housekeeping_runs(): Promise<any> {
    return this.http.request({
      path: '/api/housekeeping/runs',
      method: 'GET',
    });
  }  async post_housekeeping_runs(): Promise<any> {
    return this.http.request({
      path: '/api/housekeeping/runs',
      method: 'POST',
    });
  }  async post_housekeeping_trigger_by_name(name: string | number): Promise<any> {
    return this.http.request({
      path: `/api/housekeeping/trigger/${name}`,
      method: 'POST',
    });
  }  async post_admin_backup(): Promise<any> {
    return this.http.request({
      path: '/api/admin/backup',
      method: 'POST',
    });
  }  async post_admin_restore(): Promise<any> {
    return this.http.request({
      path: '/api/admin/restore',
      method: 'POST',
    });
  }}

export class AlterApi {
  constructor(private readonly http: HttpClient) {}

  async get_alters(): Promise<any> {
    return this.http.request({
      path: '/api/alters',
      method: 'GET',
    });
  }  async post_alters(): Promise<any> {
    return this.http.request({
      path: '/api/alters',
      method: 'POST',
    });
  }  async alters_names(): Promise<any> {
    return this.http.request({
      path: '/api/alters/names',
      method: 'GET',
    });
  }  async alters_family_tree(): Promise<any> {
    return this.http.request({
      path: '/api/alters/family-tree',
      method: 'GET',
    });
  }  async get_alters_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}`,
      method: 'GET',
    });
  }  async put_alters_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}`,
      method: 'PUT',
    });
  }  async delete_alters_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}`,
      method: 'DELETE',
    });
  }  async delete_alters_by_id_image(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}/image`,
      method: 'DELETE',
    });
  }  async get_alters_by_id_relationships(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}/relationships`,
      method: 'GET',
    });
  }  async post_alters_by_id_relationships(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}/relationships`,
      method: 'POST',
    });
  }  async put_alters_by_id_alter_relationships(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}/alter-relationships`,
      method: 'PUT',
    });
  }  async put_alters_by_id_user_relationships(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${id}/user-relationships`,
      method: 'PUT',
    });
  }  async delete_alters_by_alter_relationships_by_user_by_relationship_type(alter_id: string | number, user_id: string | number, relationship_type: string | number): Promise<any> {
    return this.http.request({
      path: `/api/alters/${alter_id}/relationships/${user_id}/${relationship_type}`,
      method: 'DELETE',
    });
  }}

export class GroupApi {
  constructor(private readonly http: HttpClient) {}

  async get_groups(): Promise<any> {
    return this.http.request({
      path: '/api/groups',
      method: 'GET',
    });
  }  async post_groups(): Promise<any> {
    return this.http.request({
      path: '/api/groups',
      method: 'POST',
    });
  }  async get_groups_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/groups/${id}`,
      method: 'GET',
    });
  }  async put_groups_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/groups/${id}`,
      method: 'PUT',
    });
  }  async delete_groups_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/groups/${id}`,
      method: 'DELETE',
    });
  }  async post_groups_by_id_leaders_toggle(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/groups/${id}/leaders/toggle`,
      method: 'POST',
    });
  }  async groups_by_id_members(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/groups/${id}/members`,
      method: 'GET',
    });
  }}

export class OIDCApi {
  constructor(private readonly http: HttpClient) {}

  async oidc_by_id_authorize(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/oidc/${id}/authorize`,
      method: 'GET',
    });
  }  async oidc_by_id_callback(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/oidc/${id}/callback`,
      method: 'GET',
    });
  }  async post_oidc_by_id_enabled(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/oidc/${id}/enabled`,
      method: 'POST',
    });
  }  async get_oidc_by_id_secret(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/oidc/${id}/secret`,
      method: 'GET',
    });
  }  async post_oidc_by_id_secret(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/oidc/${id}/secret`,
      method: 'POST',
    });
  }}

export class PostApi {
  constructor(private readonly http: HttpClient) {}

  async get_posts(): Promise<any> {
    return this.http.request({
      path: '/api/posts',
      method: 'GET',
    });
  }  async post_posts(): Promise<any> {
    return this.http.request({
      path: '/api/posts',
      method: 'POST',
    });
  }  async post_posts_by_id_repost(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/posts/${id}/repost`,
      method: 'POST',
    });
  }}

export class ReportApi {
  constructor(private readonly http: HttpClient) {}

  async pdf_alter_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/pdf/alter/${id}`,
      method: 'GET',
    });
  }  async pdf_group_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/pdf/group/${id}`,
      method: 'GET',
    });
  }  async pdf_subsystem_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/pdf/subsystem/${id}`,
      method: 'GET',
    });
  }}

export class SubsystemApi {
  constructor(private readonly http: HttpClient) {}

  async get_subsystems(): Promise<any> {
    return this.http.request({
      path: '/api/subsystems',
      method: 'GET',
    });
  }  async post_subsystems(): Promise<any> {
    return this.http.request({
      path: '/api/subsystems',
      method: 'POST',
    });
  }  async get_subsystems_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}`,
      method: 'GET',
    });
  }  async put_subsystems_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}`,
      method: 'PUT',
    });
  }  async delete_subsystems_by_id(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}`,
      method: 'DELETE',
    });
  }  async post_subsystems_by_id_leaders_toggle(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}/leaders/toggle`,
      method: 'POST',
    });
  }  async get_subsystems_by_id_members(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}/members`,
      method: 'GET',
    });
  }  async post_subsystems_by_id_members(id: string | number): Promise<any> {
    return this.http.request({
      path: `/api/subsystems/${id}/members`,
      method: 'POST',
    });
  }}

export class UserApi {
  constructor(private readonly http: HttpClient) {}

  async post_password_reset_request(): Promise<any> {
    return this.http.request({
      path: '/api/password-reset/request',
      method: 'POST',
    });
  }  async post_password_reset_verify(): Promise<any> {
    return this.http.request({
      path: '/api/password-reset/verify',
      method: 'POST',
    });
  }  async post_password_reset_consume(): Promise<any> {
    return this.http.request({
      path: '/api/password-reset/consume',
      method: 'POST',
    });
  }  async post_me_request_system(): Promise<any> {
    return this.http.request({
      path: '/api/me/request-system',
      method: 'POST',
    });
  }  async get_me_request_system(): Promise<any> {
    return this.http.request({
      path: '/api/me/request-system',
      method: 'GET',
    });
  }  async post_me_avatar(): Promise<any> {
    return this.http.request({
      path: '/api/me/avatar',
      method: 'POST',
    });
  }  async delete_me_avatar(): Promise<any> {
    return this.http.request({
      path: '/api/me/avatar',
      method: 'DELETE',
    });
  }}


export function createApiClient(config: HttpClientConfig = {}): ApiClient {
  return new ApiClient(config);
}

export const apiClient = new ApiClient();