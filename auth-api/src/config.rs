use std::env;
use std::num::ParseIntError;
use std::str::FromStr;
use url::Url;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub port: u16,
    pub clerk_secret: String,
    pub clerk_api_url: Url,
}

#[derive(Debug)]
pub enum ConfigError {
    MissingVar(&'static str),
    InvalidPort(String, ParseIntError),
    InvalidUrl(String, url::ParseError),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::MissingVar(var) => write!(f, "Missing required environment variable: {}", var),
            ConfigError::InvalidPort(value, err) => {
                write!(f, "Failed to parse port from '{}': {}", value, err)
            }
            ConfigError::InvalidUrl(value, err) => {
                write!(f, "Failed to parse URL from '{}': {}", value, err)
            }
        }
    }
}

impl std::error::Error for ConfigError {}

impl AppConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let port = read_port()?;
        let clerk_secret = read_env("CLERK_SECRET_KEY")?;
        let clerk_api_url = read_url("CLERK_API_URL", "https://api.clerk.com")?;

        Ok(Self {
            port,
            clerk_secret,
            clerk_api_url,
        })
    }
}

fn read_env(key: &'static str) -> Result<String, ConfigError> {
    match env::var(key) {
        Ok(value) if !value.trim().is_empty() => Ok(value),
        _ => Err(ConfigError::MissingVar(key)),
    }
}

fn read_port() -> Result<u16, ConfigError> {
    const CANDIDATES: [&str; 3] = ["PORT", "AUTH_API_PORT", "SERVER_PORT"];
    let raw = CANDIDATES
        .iter()
        .find_map(|key| env::var(key).ok())
        .unwrap_or_else(|| "8080".to_string());

    u16::from_str(&raw).map_err(|err| ConfigError::InvalidPort(raw, err))
}

fn read_url(key: &'static str, default: &str) -> Result<Url, ConfigError> {
    let raw = env::var(key).unwrap_or_else(|_| default.to_string());
    Url::parse(&raw).map_err(|err| ConfigError::InvalidUrl(raw, err))
}
