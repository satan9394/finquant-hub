# Changelog

## Local OSS v1 release candidate - 2026-08-13

This candidate establishes the supported personal, local-first distribution of FinQuant Hub. The exact candidate SHA is the output of `git rev-parse HEAD` in the committed public-source repository and is recorded with the local AIOS-085 verification evidence.

### Install and supported scope

- Clone the candidate and run `./scripts/local.ps1 up` on PowerShell or `bash ./scripts/local.sh up` on a POSIX shell.
- Docker Compose is the supported user installation path. The browser endpoint binds only to `127.0.0.1`; local mode uses one internal owner and does not expose email login.
- No model key is required for the local deterministic core. Model-backed features remain `UNCONFIGURED` until the user explicitly configures and tests a provider.
- Market data requires network access and provider availability. Configuration or adapter presence does not prove live upstream access; failures retain `UNKNOWN`, `PARTIAL`, or `UPSTREAM_ERROR`.

### Upgrade, backup, and rollback

- Run `./scripts/local.ps1 down` or `bash ./scripts/local.sh down` before copying or restoring the named SQLite volume. `down` does not delete the volume.
- The release verifier exercises schema migration, `down`/`up` persistence, SQLite integrity, and non-overwriting backup/restore in an isolated Compose project.
- Before an upgrade, preserve the named volume or create a SQLite backup. Roll back by stopping the candidate, restoring the preserved database copy to a fresh local volume, and starting the previously verified source revision.
- Never use `docker compose down -v` for a normal rollback; it deletes the named data volume.

### Data and license boundaries

- Project-authored source is Apache-2.0, `Copyright 2026 Satanchen`.
- The public candidate excludes `reference/`, the optional permission-unknown WQ catalogue, local env files, databases, dependency directories, and build/test output.
- Without the optional catalogue, Alpha research reports `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`, eight project-authored field contracts, five templates, and unknown coverage. This is not WorldQuant data or BRAIN availability evidence.
- Provider data, model output, user portfolios, notes, credentials, and third-party dependencies are not relicensed by the project source license.

### Known limitations

- This is a single-developer, local self-use release; public sharing, remix, author identity, template marketplace, SaaS, and public multi-tenant operations remain parked.
- Real model and market upstreams are not exercised by deterministic release tests.
- No GitHub push, Release, package publication, or deployment is part of the local candidate gate.
