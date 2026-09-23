# Local data and privacy

## Scope

The supported FinQuant Hub profile runs on one personal computer. Docker exposes the frontend only on `127.0.0.1`; backend traffic is proxied inside the Compose network. Local-only mode uses one internal owner and does not create an email session.

This design reduces public-network exposure but is not a sandbox. Anyone or any program that can access the same operating-system account, browser profile, project files, Docker daemon, or Docker volume may be able to access local research data.

## Stored locally

- SQLite data is stored in the Docker named volume declared as `finquant-local-data`.
- Encrypted model credentials stored through the UI remain in SQLite; decryption depends on the MASTER_KEY in ignored `.env.local`.
- Browser preferences, watchlists, progress, and selected research artifacts may use browser `localStorage`.
- Docker, application, and browser logs may contain operational metadata and error messages. They must not contain credentials, but review logs before sharing.
- Optional product metrics are off by default, local-only when enabled, owner-scoped, allowlisted, and exclude financial text, tickers, object IDs, and credentials.

`scripts/local.ps1 down` and `scripts/local.sh down` stop containers but preserve the named volume. The project scripts do not automatically delete user data. Before changing or removing a volume, verify an independent backup and the exact target yourself.

On Windows, `scripts/local.ps1 doctor` also compares the creation time of each running local image with the latest modification time of its declared build inputs. A stale image is reported as `WARN` and can be repaired with `scripts/local.ps1 up`; the check does not inspect, delete, or migrate the data volume. This timestamp check detects common local source/image drift but is not a software signature or reproducible-build proof.

The local web server revalidates `index.html` on each visit while keeping content-hashed assets immutable. This prevents a rebuilt app shell from continuing to reference the previous bundle; it does not clear unrelated browser data or application `localStorage`.

## Optional network transfers

The application can start without a model API key, but some features transfer user inputs or derived context to services the user chooses:

- Market requests may contact Tencent, Sina, Eastmoney, Yahoo Finance, or another configured provider.
- Model-backed chat, discussion, and research send prompts/context to the configured OpenAI-compatible endpoint.
- Enabled MCP servers receive the explicit tool requests defined by their own contracts.
- Docker build may download base images and package dependencies.
- Email authentication and SMTP exist only in the separate non-local runtime; the supported local profile disables email login.

Each external service has its own privacy, retention, licensing, availability, and jurisdiction terms. A configured key proves only local configuration, not connectivity or permission. Runtime results must preserve source, time, and quality state.

## Backups and sharing

Treat `.env.local`, SQLite files, volume snapshots, reports, exports, screenshots, logs, and browser storage as private. A database backup without its matching MASTER_KEY cannot decrypt stored credentials; storing both together also increases exposure. Do not attach these artifacts to public issues.

FinQuant Hub does not operate a hosted service in the Local OSS v1 scope, so the project maintainer does not receive local data unless the user deliberately sends it to an upstream provider or shares an artifact.
