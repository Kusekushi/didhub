# DIDHub HTTP API Reference (auto-generated)

This file was generated from `packages/api-client/src/generated/openapi.yaml`.

Base URL: `/api` prefix is used for JSON endpoints where applicable.

## Endpoints

| Method | Path | Summary | Parameters |
| --- | --- | --- | --- |
| POST | `/admin/backup` | crate::routes::admin::misc::create_backup |  |
| POST | `/admin/db/query` | crate::routes::admin::misc::query_database |  |
| POST | `/admin/digest/custom` | crate::routes::admin::misc::post_custom_digest | days_ahead |
| GET | `/admin/oidc` | crate::routes::auth::oidc::list_providers |  |
| GET | `/admin/redis` | crate::routes::admin::misc::redis_status |  |
| POST | `/admin/restore` | crate::routes::admin::misc::restore_backup |  |
| POST | `/admin/update` | crate::routes::admin::misc::perform_update_endpoint | check_only |
| GET | `/admin/update/check` | crate::routes::admin::misc::check_updates | check_only |
| POST | `/admin/upload_dir` | crate::routes::admin::misc::upload_dir | action |
| GET | `/alters` | crate::routes::alters::list_alters | q, limit, offset, fields, user_id |
| POST | `/alters` | crate::routes::alters::create_alter |  |
| GET | `/alters/family-tree` | crate::routes::alters::family_tree |  |
| GET | `/alters/names` | crate::routes::alters::list_alter_names | q, limit, offset, fields, user_id |
| GET | `/alters/search` | crate::routes::alters::search_alters | q, limit, offset, fields, user_id |
| DELETE | `/alters/{alter_id}/relationships/{user_id}/{relationship_type}` | crate::routes::alters::relationships::delete_relationship | alter_id, user_id, relationship_type |
| DELETE | `/alters/{id}` | crate::routes::alters::delete_alter | id |
| GET | `/alters/{id}` | crate::routes::alters::get_alter | id |
| PUT | `/alters/{id}` | crate::routes::alters::update_alter | id |
| PUT | `/alters/{id}/alter-relationships` | crate::routes::alters::replace_alter_relationships | id |
| DELETE | `/alters/{id}/image` | crate::routes::alters::delete_alter_image | id |
| GET | `/alters/{id}/relationships` | crate::routes::alters::relationships::list_relationships | id |
| POST | `/alters/{id}/relationships` | crate::routes::alters::relationships::create_relationship | id |
| PUT | `/alters/{id}/user-relationships` | crate::routes::alters::relationships::replace_relationships | id |
| GET | `/assets/{path}` | crate::routes::static_assets::serve_asset | path |
| GET | `/audit` | crate::routes::admin::audit::list_audit | action, user_id, from, to, limit, offset |
| POST | `/audit/purge` | crate::routes::admin::audit::purge_audit |  |
| POST | `/auth/login` | auth::login |  |
| POST | `/auth/refresh` | auth::refresh |  |
| POST | `/auth/register` | auth::register |  |
| GET | `/groups` | crate::routes::groups::list_groups | q, limit, offset, fields, owner_user_id |
| POST | `/groups` | crate::routes::groups::create_group |  |
| DELETE | `/groups/{id}` | crate::routes::groups::delete_group | id |
| GET | `/groups/{id}` | crate::routes::groups::get_group | id |
| PUT | `/groups/{id}` | crate::routes::groups::update_group | id |
| POST | `/groups/{id}/leaders/toggle` | crate::routes::groups::toggle_leader | id |
| GET | `/groups/{id}/members` | crate::routes::groups::list_group_members | id |
| GET | `/housekeeping/jobs` | crate::routes::admin::housekeeping::list_jobs |  |
| GET | `/housekeeping/runs` | crate::routes::admin::housekeeping::list_runs | job, limit, offset |
| POST | `/housekeeping/runs` | crate::routes::admin::housekeeping::clear_runs |  |
| POST | `/housekeeping/trigger/{name}` | crate::routes::admin::housekeeping::trigger_job | name |
| GET | `/me` | auth::me_handler |  |
| DELETE | `/me/avatar` | crate::routes::files::avatar::delete_avatar |  |
| POST | `/me/avatar` | crate::routes::files::avatar::upload_avatar |  |
| POST | `/me/password` | auth::change_password |  |
| GET | `/me/request-system` | crate::routes::systems::requests::my_system_request |  |
| POST | `/me/request-system` | crate::routes::systems::requests::request_system |  |
| GET | `/metrics` | metrics::metrics_handler |  |
| GET | `/oidc` | crate::routes::auth::oidc::public_providers |  |
| GET | `/oidc/{id}/authorize` | crate::routes::auth::oidc::authorize | id, redirect |
| GET | `/oidc/{id}/callback` | crate::routes::auth::oidc::callback | id, query |
| POST | `/oidc/{id}/enabled` | crate::routes::auth::oidc::set_enabled | id |
| GET | `/oidc/{id}/secret` | crate::routes::auth::oidc::get_secret | id |
| POST | `/oidc/{id}/secret` | crate::routes::auth::oidc::update_secret | id |
| POST | `/password-reset/consume` | crate::routes::auth::password_reset::consume_reset |  |
| POST | `/password-reset/request` | crate::routes::auth::password_reset::request_reset |  |
| POST | `/password-reset/verify` | crate::routes::auth::password_reset::verify_reset |  |
| GET | `/pdf/alter/{id}` | crate::routes::reports::pdf::export_alter | id |
| GET | `/pdf/group/{id}` | crate::routes::reports::pdf::export_group | id |
| GET | `/pdf/subsystem/{id}` | crate::routes::reports::pdf::export_subsystem | id |
| GET | `/posts` | crate::routes::posts::list_posts | limit, offset |
| POST | `/posts` | crate::routes::posts::create_post |  |
| DELETE | `/posts/{id}` | crate::routes::posts::delete_post | id |
| POST | `/posts/{id}/repost` | crate::routes::posts::repost_post | id |
| GET | `/settings` | crate::routes::admin::settings::list_settings |  |
| PUT | `/settings` | crate::routes::admin::settings::bulk_upsert_settings |  |
| GET | `/settings/{key}` | crate::routes::admin::settings::get_setting | key |
| PUT | `/settings/{key}` | crate::routes::admin::settings::upsert_setting | key |
| GET | `/subsystems` | crate::routes::systems::subsystems::list_subsystems | q, limit, offset, per_page, owner_user_id, fields |
| POST | `/subsystems` | crate::routes::systems::subsystems::create_subsystem |  |
| DELETE | `/subsystems/{id}` | crate::routes::systems::subsystems::delete_subsystem | id |
| GET | `/subsystems/{id}` | crate::routes::systems::subsystems::get_subsystem | id |
| PUT | `/subsystems/{id}` | crate::routes::systems::subsystems::update_subsystem | id |
| POST | `/subsystems/{id}/leaders/toggle` | crate::routes::systems::subsystems::toggle_leader | id |
| GET | `/subsystems/{id}/members` | crate::routes::systems::subsystems::list_members | id |
| POST | `/subsystems/{id}/members` | crate::routes::systems::subsystems::change_member | id |
| GET | `/system-requests` | crate::routes::systems::requests::list_system_requests | status, limit, offset |
| POST | `/system-requests` | crate::routes::systems::requests::decide_system_request |  |
| GET | `/systems` | crate::routes::systems::list_systems | q, limit, offset |
| GET | `/systems/{id}` | crate::routes::systems::get_system | id |
| POST | `/upload` | crate::routes::files::uploads::upload_file |  |
| GET | `/uploads` | crate::routes::admin::uploads::list_uploads_admin | limit, offset, mime, hash, user_id, include_deleted |
| POST | `/uploads/purge` | crate::routes::admin::uploads::purge_uploads_admin | purge_before, force |
| GET | `/uploads/{filename}` | crate::routes::files::uploads::serve_file | filename |
| DELETE | `/uploads/{name}` | crate::routes::admin::uploads::delete_upload_admin | name, force |
| GET | `/users` | crate::routes::admin::users::list_users | page, per_page, q, limit, offset, is_admin, is_system, is_approved, sort_by, order, names |
| POST | `/users` | crate::routes::admin::users::create_user |  |
| DELETE | `/users/{id}` | crate::routes::admin::users::delete_user | id |
| GET | `/users/{id}` | crate::routes::admin::users::get_user | id |
| PUT | `/users/{id}` | crate::routes::admin::users::update_user | id |

---

## /admin/backup

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::create_backup |

## /admin/db/query

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::query_database |

## /admin/digest/custom

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::post_custom_digest |

### POST /admin/digest/custom parameters

| name | in | required | type |
| --- | --- | --- | --- |
| days_ahead | query | False | number |

## /admin/oidc

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::auth::oidc::list_providers |

## /admin/redis

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::misc::redis_status |

## /admin/restore

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::restore_backup |

## /admin/update

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::perform_update_endpoint |

### POST /admin/update parameters

| name | in | required | type |
| --- | --- | --- | --- |
| check_only | query | True | boolean |

## /admin/update/check

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::misc::check_updates |

### GET /admin/update/check parameters

| name | in | required | type |
| --- | --- | --- | --- |
| check_only | query | True | boolean |

## /admin/upload_dir

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::misc::upload_dir |

### POST /admin/upload_dir parameters

| name | in | required | type |
| --- | --- | --- | --- |
| action | query | True | string |

## /alters

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::alters::list_alters |
| **POST** | crate::routes::alters::create_alter |

### GET /alters parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| fields | query | False | string |
| user_id | query | False | string |

## /alters/family-tree

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::alters::family_tree |

## /alters/names

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::alters::list_alter_names |

### GET /alters/names parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| fields | query | False | string |
| user_id | query | False | string |

## /alters/search

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::alters::search_alters |

### GET /alters/search parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| fields | query | False | string |
| user_id | query | False | string |

## /alters/{alter_id}/relationships/{user_id}/{relationship_type}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::alters::relationships::delete_relationship |

### DELETE /alters/{alter_id}/relationships/{user_id}/{relationship_type} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| alter_id | path | True | string |
| user_id | path | True | string |
| relationship_type | path | True | string |

## /alters/{id}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::alters::delete_alter |
| **GET** | crate::routes::alters::get_alter |
| **PUT** | crate::routes::alters::update_alter |

### DELETE /alters/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### GET /alters/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### PUT /alters/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /alters/{id}/alter-relationships

| Method | Summary |
| --- | --- |
| **PUT** | crate::routes::alters::replace_alter_relationships |

### PUT /alters/{id}/alter-relationships parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /alters/{id}/image

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::alters::delete_alter_image |

### DELETE /alters/{id}/image parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /alters/{id}/relationships

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::alters::relationships::list_relationships |
| **POST** | crate::routes::alters::relationships::create_relationship |

### GET /alters/{id}/relationships parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### POST /alters/{id}/relationships parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /alters/{id}/user-relationships

| Method | Summary |
| --- | --- |
| **PUT** | crate::routes::alters::relationships::replace_relationships |

### PUT /alters/{id}/user-relationships parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /assets/{path}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::static_assets::serve_asset |

### GET /assets/{path} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| path | path | True | string |

## /audit

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::audit::list_audit |

### GET /audit parameters

| name | in | required | type |
| --- | --- | --- | --- |
| action | query | False | string |
| user_id | query | False | string |
| from | query | False | string |
| to | query | False | string |
| limit | query | False | number |
| offset | query | False | number |

## /audit/purge

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::audit::purge_audit |

## /auth/login

| Method | Summary |
| --- | --- |
| **POST** | auth::login |

## /auth/refresh

| Method | Summary |
| --- | --- |
| **POST** | auth::refresh |

## /auth/register

| Method | Summary |
| --- | --- |
| **POST** | auth::register |

## /groups

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::groups::list_groups |
| **POST** | crate::routes::groups::create_group |

### GET /groups parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| fields | query | False | string |
| owner_user_id | query | False | string |

## /groups/{id}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::groups::delete_group |
| **GET** | crate::routes::groups::get_group |
| **PUT** | crate::routes::groups::update_group |

### DELETE /groups/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### GET /groups/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### PUT /groups/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /groups/{id}/leaders/toggle

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::groups::toggle_leader |

### POST /groups/{id}/leaders/toggle parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /groups/{id}/members

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::groups::list_group_members |

### GET /groups/{id}/members parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /housekeeping/jobs

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::housekeeping::list_jobs |

## /housekeeping/runs

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::housekeeping::list_runs |
| **POST** | crate::routes::admin::housekeeping::clear_runs |

### GET /housekeeping/runs parameters

| name | in | required | type |
| --- | --- | --- | --- |
| job | query | False | string |
| limit | query | False | number |
| offset | query | False | number |

## /housekeeping/trigger/{name}

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::housekeeping::trigger_job |

### POST /housekeeping/trigger/{name} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| name | path | True | string |

## /me

| Method | Summary |
| --- | --- |
| **GET** | auth::me_handler |

## /me/avatar

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::files::avatar::delete_avatar |
| **POST** | crate::routes::files::avatar::upload_avatar |

## /me/password

| Method | Summary |
| --- | --- |
| **POST** | auth::change_password |

## /me/request-system

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::requests::my_system_request |
| **POST** | crate::routes::systems::requests::request_system |

## /metrics

| Method | Summary |
| --- | --- |
| **GET** | metrics::metrics_handler |

## /oidc

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::auth::oidc::public_providers |

## /oidc/{id}/authorize

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::auth::oidc::authorize |

### GET /oidc/{id}/authorize parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |
| redirect | query | False | string |

## /oidc/{id}/callback

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::auth::oidc::callback |

### GET /oidc/{id}/callback parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |
| query | query | False | object |

## /oidc/{id}/enabled

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::auth::oidc::set_enabled |

### POST /oidc/{id}/enabled parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /oidc/{id}/secret

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::auth::oidc::get_secret |
| **POST** | crate::routes::auth::oidc::update_secret |

### GET /oidc/{id}/secret parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### POST /oidc/{id}/secret parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /password-reset/consume

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::auth::password_reset::consume_reset |

## /password-reset/request

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::auth::password_reset::request_reset |

## /password-reset/verify

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::auth::password_reset::verify_reset |

## /pdf/alter/{id}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::reports::pdf::export_alter |

### GET /pdf/alter/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /pdf/group/{id}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::reports::pdf::export_group |

### GET /pdf/group/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /pdf/subsystem/{id}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::reports::pdf::export_subsystem |

### GET /pdf/subsystem/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /posts

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::posts::list_posts |
| **POST** | crate::routes::posts::create_post |

### GET /posts parameters

| name | in | required | type |
| --- | --- | --- | --- |
| limit | query | False | number |
| offset | query | False | number |

## /posts/{id}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::posts::delete_post |

### DELETE /posts/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /posts/{id}/repost

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::posts::repost_post |

### POST /posts/{id}/repost parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /settings

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::settings::list_settings |
| **PUT** | crate::routes::admin::settings::bulk_upsert_settings |

## /settings/{key}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::settings::get_setting |
| **PUT** | crate::routes::admin::settings::upsert_setting |

### GET /settings/{key} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| key | path | True | string |

### PUT /settings/{key} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| key | path | True | string |

## /subsystems

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::subsystems::list_subsystems |
| **POST** | crate::routes::systems::subsystems::create_subsystem |

### GET /subsystems parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| per_page | query | False | number |
| owner_user_id | query | False | string |
| fields | query | False | string |

## /subsystems/{id}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::systems::subsystems::delete_subsystem |
| **GET** | crate::routes::systems::subsystems::get_subsystem |
| **PUT** | crate::routes::systems::subsystems::update_subsystem |

### DELETE /subsystems/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### GET /subsystems/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### PUT /subsystems/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /subsystems/{id}/leaders/toggle

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::systems::subsystems::toggle_leader |

### POST /subsystems/{id}/leaders/toggle parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /subsystems/{id}/members

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::subsystems::list_members |
| **POST** | crate::routes::systems::subsystems::change_member |

### GET /subsystems/{id}/members parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### POST /subsystems/{id}/members parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /system-requests

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::requests::list_system_requests |
| **POST** | crate::routes::systems::requests::decide_system_request |

### GET /system-requests parameters

| name | in | required | type |
| --- | --- | --- | --- |
| status | query | False | string |
| limit | query | False | number |
| offset | query | False | number |

## /systems

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::list_systems |

### GET /systems parameters

| name | in | required | type |
| --- | --- | --- | --- |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |

## /systems/{id}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::systems::get_system |

### GET /systems/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

## /upload

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::files::uploads::upload_file |

## /uploads

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::uploads::list_uploads_admin |

### GET /uploads parameters

| name | in | required | type |
| --- | --- | --- | --- |
| limit | query | False | number |
| offset | query | False | number |
| mime | query | False | string |
| hash | query | False | string |
| user_id | query | False | string |
| include_deleted | query | False | boolean |

## /uploads/purge

| Method | Summary |
| --- | --- |
| **POST** | crate::routes::admin::uploads::purge_uploads_admin |

### POST /uploads/purge parameters

| name | in | required | type |
| --- | --- | --- | --- |
| purge_before | query | False | string |
| force | query | False | boolean |

## /uploads/{filename}

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::files::uploads::serve_file |

### GET /uploads/{filename} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| filename | path | True | string |

## /uploads/{name}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::admin::uploads::delete_upload_admin |

### DELETE /uploads/{name} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| name | path | True | string |
| force | query | False | boolean |

## /users

| Method | Summary |
| --- | --- |
| **GET** | crate::routes::admin::users::list_users |
| **POST** | crate::routes::admin::users::create_user |

### GET /users parameters

| name | in | required | type |
| --- | --- | --- | --- |
| page | query | False | number |
| per_page | query | False | number |
| q | query | False | string |
| limit | query | False | number |
| offset | query | False | number |
| is_admin | query | False | string |
| is_system | query | False | string |
| is_approved | query | False | string |
| sort_by | query | False | string |
| order | query | False | string |
| names | query | False | string |

## /users/{id}

| Method | Summary |
| --- | --- |
| **DELETE** | crate::routes::admin::users::delete_user |
| **GET** | crate::routes::admin::users::get_user |
| **PUT** | crate::routes::admin::users::update_user |

### DELETE /users/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### GET /users/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |

### PUT /users/{id} parameters

| name | in | required | type |
| --- | --- | --- | --- |
| id | path | True | string |
