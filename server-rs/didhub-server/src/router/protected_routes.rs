use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post, put},
    Router,
};

use didhub_auth as auth;

pub fn build_protected_routes(auth_state: &auth::AuthState) -> Router {
    Router::new()
        .route("/me", get(auth::me_handler))
        .route("/me/password", post(auth::change_password))
        .route(
            "/me/request-system",
            post(crate::routes::systems::requests::request_system)
                .get(crate::routes::systems::requests::my_system_request),
        )
        .route("/debug/whoami", get(crate::routes::debug::whoami))
        .route(
            "/alters",
            get(crate::routes::alters::list_alters).post(crate::routes::alters::create_alter),
        )
        .route("/alters/search", get(crate::routes::alters::search_alters))
        .route(
            "/alters/family-tree",
            get(crate::routes::alters::family_tree),
        )
        .route(
            "/alters/{id}",
            get(crate::routes::alters::get_alter)
                .put(crate::routes::alters::update_alter)
                .delete(crate::routes::alters::delete_alter),
        )
        .route(
            "/alters/{id}/subsystems",
            get(crate::routes::alters::get_alter_subsystem)
                .put(crate::routes::alters::set_alter_subsystem)
                .delete(crate::routes::alters::delete_alter_subsystem),
        )
        .route(
            "/alters/{id}/relationships",
            get(crate::routes::alters::relationships::list_relationships)
                .post(crate::routes::alters::relationships::create_relationship),
        )
        .route(
            "/alters/{id}/alter-relationships",
            put(crate::routes::alters::replace_alter_relationships),
        )
        .route(
            "/alters/{id}/user-relationships",
            put(crate::routes::alters::relationships::replace_relationships),
        )
        .route(
            "/alters/{alter_id}/relationships/{user_id}/{relationship_type}",
            delete(crate::routes::alters::relationships::delete_relationship),
        )
        .route(
            "/upload",
            post(crate::routes::files::uploads::upload_file)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/me/avatar",
            post(crate::routes::files::avatar::upload_avatar)
                .delete(crate::routes::files::avatar::delete_avatar)
                .layer(DefaultBodyLimit::max(10 * 1024 * 1024)),
        )
        .route(
            "/groups",
            get(crate::routes::groups::list_groups).post(crate::routes::groups::create_group),
        )
        .route(
            "/groups/{id}",
            get(crate::routes::groups::get_group)
                .put(crate::routes::groups::update_group)
                .delete(crate::routes::groups::delete_group),
        )
        .route(
            "/groups/{id}/leaders/toggle",
            post(crate::routes::groups::toggle_leader),
        )
        .route(
            "/groups/{id}/members",
            get(crate::routes::groups::list_group_members),
        )
        .route("/systems", get(crate::routes::systems::list_systems))
        .route("/systems/{id}", get(crate::routes::systems::get_system))
        .route(
            "/subsystems",
            get(crate::routes::systems::subsystems::list_subsystems)
                .post(crate::routes::systems::subsystems::create_subsystem),
        )
        .route(
            "/subsystems/{id}",
            get(crate::routes::systems::subsystems::get_subsystem)
                .put(crate::routes::systems::subsystems::update_subsystem)
                .delete(crate::routes::systems::subsystems::delete_subsystem),
        )
        .route(
            "/subsystems/{id}/leaders/toggle",
            post(crate::routes::systems::subsystems::toggle_leader),
        )
        .route(
            "/subsystems/{id}/members",
            get(crate::routes::systems::subsystems::list_members)
                .post(crate::routes::systems::subsystems::change_member)
                .delete(crate::routes::systems::subsystems::delete_member),
        )
        .route(
            "/posts",
            get(crate::routes::posts::list_posts).post(crate::routes::posts::create_post),
        )
        .route(
            "/posts/{id}/repost",
            post(crate::routes::posts::repost_post),
        )
        .route("/posts/{id}", delete(crate::routes::posts::delete_post))
        .route(
            "/pdf/alter/{id}",
            get(crate::routes::reports::pdf::export_alter),
        )
        .route(
            "/pdf/group/{id}",
            get(crate::routes::reports::pdf::export_group),
        )
        .route(
            "/pdf/subsystem/{id}",
            get(crate::routes::reports::pdf::export_subsystem),
        )
        .with_state(auth_state.clone())
}
