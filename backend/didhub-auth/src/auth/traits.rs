use crate::auth::context::{AuthContext, AuthError};

#[async_trait::async_trait]
pub trait AuthenticatorTrait: Send + Sync + 'static {
    async fn authenticate(&self, token: Option<&str>) -> Result<AuthContext, AuthError>;
}
