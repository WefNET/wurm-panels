use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::fmt;
use url::Url;

#[derive(Clone)]
pub struct AuthApiClient {
    base_url: Url,
    client: reqwest::Client,
}

impl AuthApiClient {
    pub fn new(base_url: Url) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }

    pub async fn verify_session(&self, token: &str) -> Result<VerifiedSession, AuthApiError> {
        let endpoint = self
            .base_url
            .join("/v1/me")
            .map_err(|err| AuthApiError::Url(err.to_string()))?;

        let response = self
            .client
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await
            .map_err(AuthApiError::Http)?;

        match response.status() {
            StatusCode::OK => response
                .json::<VerifiedSession>()
                .await
                .map_err(|err| AuthApiError::Serde(err.to_string())),
            StatusCode::UNAUTHORIZED => Err(AuthApiError::Unauthorized),
            status => {
                let body = response.text().await.unwrap_or_default();
                Err(AuthApiError::Upstream(status.as_u16(), body))
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedSession {
    pub session_id: String,
    pub user_id: String,
}

#[derive(Debug)]
pub enum AuthApiError {
    Http(reqwest::Error),
    Unauthorized,
    Upstream(u16, String),
    Url(String),
    Serde(String),
}

impl fmt::Display for AuthApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthApiError::Http(err) => write!(f, "http error: {}", err),
            AuthApiError::Unauthorized => write!(f, "unauthorized"),
            AuthApiError::Upstream(code, body) => {
                write!(f, "upstream error {}: {}", code, body)
            }
            AuthApiError::Url(err) => write!(f, "invalid url: {}", err),
            AuthApiError::Serde(err) => write!(f, "response parse error: {}", err),
        }
    }
}

impl std::error::Error for AuthApiError {}
