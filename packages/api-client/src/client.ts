import { HttpClient, HttpClientConfig } from './core/HttpClient';
import { AltersApi } from './modules/Alter';
import { FilesApi } from './modules/Files';
import { GroupsApi } from './modules/Group';
import { SubsystemsApi } from './modules/Subsystem';
import { UsersApi } from './modules/User';
import { AdminApi } from './modules/Admin';
import { OidcApi } from './modules/OIDC';

export interface ApiClientModules {
  alters: AltersApi;
  files: FilesApi;
  groups: GroupsApi;
  subsystems: SubsystemsApi;
  users: UsersApi;
  admin: AdminApi;
  oidc: OidcApi;
}

export class ApiClient implements ApiClientModules {
  readonly http: HttpClient;
  readonly alters: AltersApi;
  readonly files: FilesApi;
  readonly groups: GroupsApi;
  readonly subsystems: SubsystemsApi;
  readonly users: UsersApi;
  readonly admin: AdminApi;
  readonly oidc: OidcApi;

  constructor(config: HttpClientConfig = {}) {
    this.http = new HttpClient(config);
    this.alters = new AltersApi(this.http);
    this.files = new FilesApi(this.http);
    this.groups = new GroupsApi(this.http);
    this.subsystems = new SubsystemsApi(this.http);
    this.users = new UsersApi(this.http);
    this.admin = new AdminApi(this.http);
    this.oidc = new OidcApi(this.http);
  }
}

export function createApiClient(config: HttpClientConfig = {}): ApiClient {
  return new ApiClient(config);
}

export const apiClient = new ApiClient();
