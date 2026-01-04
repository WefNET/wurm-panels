use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, instrument};

#[derive(Clone)]
pub struct ClerkVerifier {
    client: Client,
    secret_key: Arc<str>,
    verify_url: Url,
}

impl ClerkVerifier {
    pub fn new(secret_key: String, api_base: Url) -> Self {
        let verify_url = api_base
            .join("/v1/sessions/verify")
            .expect("clerk api base must allow join");

        Self {
            client: Client::new(),
            secret_key: Arc::from(secret_key),
            verify_url,
        }
    }

    #[instrument(skip(self, token))]
    pub async fn verify_session(&self, token: &str) -> Result<VerifiedSession, AuthError> {
        let request = VerifyRequest { token };
        let response = self
            .client
            .post(self.verify_url.clone())
            .bearer_auth(self.secret_key.as_ref())
            .json(&request)
            .send()
            .await
            .map_err(AuthError::Http)?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!(%status, body, "clerk verification request failed");
            return Err(AuthError::Unauthorized);
        }

        let payload: ClerkSession = response
            .json()
            .await
            .map_err(|err| AuthError::Serde(err.to_string()))?;

        if payload.status != "active" {
            error!(session_id = %payload.id, status = %payload.status, "clerk session not active");
            return Err(AuthError::Unauthorized);
        }

        Ok(VerifiedSession {
            session_id: payload.id,
            user_id: payload.user_id,
        })
    }
}

#[derive(Debug, Serialize)]
pub struct VerifiedSession {
    pub session_id: String,
    pub user_id: String,
}

#[derive(Serialize)]
struct VerifyRequest<'a> {
    token: &'a str,
}

#[derive(Deserialize)]
struct ClerkSession {
    id: String,
    user_id: String,
    status: String,
    #[serde(flatten)]
    _extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug)]
pub enum AuthError {
    MissingAuthorization,
    InvalidAuthorization,
    Unauthorized,
    Http(reqwest::Error),
    Serde(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        match self {
            AuthError::MissingAuthorization => {
                (StatusCode::UNAUTHORIZED, Json(error_body("missing authorization header"))).into_response()
            }
            AuthError::InvalidAuthorization => {
                (StatusCode::UNAUTHORIZED, Json(error_body("invalid authorization header"))).into_response()
            }
            AuthError::Unauthorized => {
                (StatusCode::UNAUTHORIZED, Json(error_body("unauthorized"))).into_response()
            }
            AuthError::Http(err) => {
                error!(error = %err, "http error during clerk verification");
                (StatusCode::BAD_GATEWAY, Json(error_body("verification upstream error"))).into_response()
            }
            AuthError::Serde(msg) => {
                error!(message = %msg, "failed to parse clerk response");
                (StatusCode::BAD_GATEWAY, Json(error_body("invalid clerk response"))).into_response()
            }
        }
    }
}

fn error_body(message: &str) -> serde_json::Value {
    serde_json::json!({ "error": message })
}
