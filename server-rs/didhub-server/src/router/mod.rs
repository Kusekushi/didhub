pub mod admin_routes;
pub mod auth_routes;
pub mod builder;
pub mod protected_routes;

pub use admin_routes::build_admin_routes;
pub use auth_routes::build_auth_routes;
pub use builder::AppRouterBuilder;
pub use protected_routes::build_protected_routes;
