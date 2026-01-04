# Auth API

Rust-based microservice that verifies Clerk session tokens for the Wurm Sales desktop application.

## Configuration

Environment variables required at runtime:

| Variable | Description | Default |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | Clerk backend secret; used for token verification. | _none_ |
| `CLERK_API_URL` | Base URL for Clerk API calls. | `https://api.clerk.com` |
| `PORT` / `AUTH_API_PORT` | TCP port the service listens on. | `8080` |

Place these values in a `.env` file for local development:

```env
CLERK_SECRET_KEY=sk_test_...
PORT=8080
```

## Running locally

```bash
cargo run
```

### Endpoints

- `GET /health` – readiness probe.
- `POST /v1/session/verify` – body `{ "token": "<session_token>" }`; returns session metadata when valid.
- `GET /v1/me` – requires `Authorization: Bearer <session_token>` header; returns session metadata.

## Container image

Build and run the container:

```sh
docker build -t auth-api .
docker run -p 8080:8080 --env-file .env auth-api
```

The Docker image runs as an unprivileged user and expects the same environment variables described above.
