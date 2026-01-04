mod auth;
mod config;
mod routes;

use crate::auth::ClerkVerifier;
use crate::config::AppConfig;
use crate::routes::build_router;
use axum::Router;
use dotenvy::dotenv;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    dotenv().ok();

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,tower_http=debug"));

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_level(true)
        .compact()
        .init();

    let config = match AppConfig::from_env() {
        Ok(value) => value,
        Err(err) => {
            eprintln!("configuration error: {err}");
            std::process::exit(1);
        }
    };

    let verifier = ClerkVerifier::new(config.clerk_secret.clone(), config.clerk_api_url.clone());
    let router: Router = build_router(verifier);

    let listener_addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(listener_addr)
        .await
        .expect("failed to bind tcp listener");

    info!(?listener_addr, "auth api listening");

    axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut sigterm = signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        let mut sigint = signal(SignalKind::interrupt()).expect("failed to install SIGINT handler");
        tokio::select! {
            _ = sigterm.recv() => {},
            _ = sigint.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }

    info!("shutdown signal received");
}
