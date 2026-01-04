# syntax = docker/dockerfile:1.4

FROM rust:1.75-slim AS builder
WORKDIR /usr/src/app

# Cache dependencies
COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo fetch

# Build application
COPY . ./
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN useradd --system --user-group --create-home appuser
COPY --from=builder /usr/src/app/target/release/auth-api /usr/local/bin/auth-api
USER appuser
ENV RUST_LOG=info
EXPOSE 8080
CMD ["auth-api"]
