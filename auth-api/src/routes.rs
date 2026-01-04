use crate::auth::{AuthError, ClerkVerifier, VerifiedSession};
use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use tower_http::trace::TraceLayer;
use tracing::info;

#[derive(Clone)]
pub struct AppState {
    verifier: ClerkVerifier,
}

impl AppState {
    pub fn new(verifier: ClerkVerifier) -> Self {
        Self { verifier }
    }
}

pub fn build_router(verifier: ClerkVerifier) -> Router {
    let state = AppState::new(verifier);

    Router::new()
        .route("/health", get(health))
        .route("/v1/session/verify", post(verify_session))
        .route("/v1/me", get(me))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Deserialize)]
struct VerifyBody {
    token: String,
}

async fn verify_session(
    State(state): State<AppState>,
    Json(body): Json<VerifyBody>,
) -> Result<Json<VerifiedSession>, AuthError> {
    let session = state.verifier.verify_session(&body.token).await?;
    info!(user_id = %session.user_id, session_id = %session.session_id, "session verified via body");
    Ok(Json(session))
}

async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<VerifiedSession>, AuthError> {
    let token = extract_bearer_token(&headers)?;
    let session = state.verifier.verify_session(&token).await?;
    info!(user_id = %session.user_id, session_id = %session.session_id, "session verified via header");
    Ok(Json(session))
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String, AuthError> {
    let header_value = headers
        .get(axum::http::header::AUTHORIZATION)
        .ok_or(AuthError::MissingAuthorization)?
        .to_str()
        .map_err(|_| AuthError::InvalidAuthorization)?;

    const PREFIX: &str = "Bearer ";
    if let Some(token) = header_value.strip_prefix(PREFIX) {
        if token.is_empty() {
            Err(AuthError::InvalidAuthorization)
        } else {
            Ok(token.to_string())
        }
    } else {
        Err(AuthError::InvalidAuthorization)
    }
}
