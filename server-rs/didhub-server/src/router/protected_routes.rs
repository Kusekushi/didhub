use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post},
    Router,
};

use didhub_auth as auth;

pub fn build_protected_routes(auth_state: &auth::AuthState) -> Router {
    Router::new()
        .route("/me", get(auth::me_handler))
        .route("/me/password", post(auth::change_password))
        .route(
            "/me/request-system",
            post(crate::routes_system_requests::request_system)
                .get(crate::routes_system_requests::my_system_request),
        )
        .route("/debug/whoami", get(crate::routes_debug::whoami))
        .route(
            "/alters",
            get(crate::routes_alters::list_alters).post(crate::routes_alters::create_alter),
        )
        .route("/alters/names", get(crate::routes_alters::list_alter_names))
        .route("/alters/search", get(crate::routes_alters::search_alters))
        .route(
            "/alters/family-tree",
            get(crate::routes_alters::family_tree),
        )
        .route(
            "/alters/{id}",
            get(crate::routes_alters::get_alter)
                .put(crate::routes_alters::update_alter)
                .delete(crate::routes_alters::delete_alter),
        )
        .route(
            "/alters/{id}/image",
            delete(crate::routes_alters::delete_alter_image),
        )
        .route(
            "/alters/{id}/relationships",
            get(crate::routes_user_alter_relationships::list_relationships)
                .post(crate::routes_user_alter_relationships::create_relationship),
        )
        .route(
            "/alters/{alter_id}/relationships/{user_id}/{relationship_type}",
            delete(crate::routes_user_alter_relationships::delete_relationship),
        )
        .route(
            "/upload",
            axum::routing::post(crate::routes_upload::upload_file)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)),
        )
        .route(
            "/me/avatar",
            post(crate::routes_avatar::upload_avatar)
                .delete(crate::routes_avatar::delete_avatar)
                .layer(DefaultBodyLimit::max(10 * 1024 * 1024)),
        )
        .route(
            "/groups",
            get(crate::routes_groups::list_groups).post(crate::routes_groups::create_group),
        )
        .route(
            "/groups/{id}",
            get(crate::routes_groups::get_group)
                .put(crate::routes_groups::update_group)
                .delete(crate::routes_groups::delete_group),
        )
        .route(
            "/groups/{id}/leaders/toggle",
            post(crate::routes_groups::toggle_leader),
        )
        .route(
            "/groups/{id}/members",
            get(crate::routes_groups::list_group_members),
        )
        .route("/systems", get(crate::routes_systems::list_systems))
        .route("/systems/{id}", get(crate::routes_systems::get_system))
        .route(
            "/shortlink",
            post(crate::routes_shortlinks::create_shortlink),
        )
        .route(
            "/shortlink/{token}",
            get(crate::routes_shortlinks::resolve_shortlink),
        )
        // Use /shortlink/id/{id} for deletion to avoid conflict with token route
        .route(
            "/shortlink/id/{id}",
            delete(crate::routes_shortlinks::delete_shortlink),
        )
        .route(
            "/subsystems",
            get(crate::routes_subsystems::list_subsystems)
                .post(crate::routes_subsystems::create_subsystem),
        )
        .route(
            "/subsystems/{id}",
            get(crate::routes_subsystems::get_subsystem)
                .put(crate::routes_subsystems::update_subsystem)
                .delete(crate::routes_subsystems::delete_subsystem),
        )
        .route(
            "/subsystems/{id}/leaders/toggle",
            post(crate::routes_subsystems::toggle_leader),
        )
        .route(
            "/subsystems/{id}/members",
            get(crate::routes_subsystems::list_members)
                .post(crate::routes_subsystems::change_member),
        )
        .route(
            "/posts",
            get(crate::routes_posts::list_posts).post(crate::routes_posts::create_post),
        )
        .route("/posts/{id}/repost", post(crate::routes_posts::repost_post))
        .route("/posts/{id}", delete(crate::routes_posts::delete_post))
        .route("/pdf/alter/{id}", get(crate::routes_pdf::export_alter))
        .route("/pdf/group/{id}", get(crate::routes_pdf::export_group))
        .route(
            "/pdf/subsystem/{id}",
            get(crate::routes_pdf::export_subsystem),
        )
        .with_state(auth_state.clone())
}
