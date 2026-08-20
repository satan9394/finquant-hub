# Security Policy

FinQuant Hub is a local-first research application. Security reports are welcome, but the repository does not promise a response or remediation SLA.

## Supported versions

The current unreleased default-branch candidate receives best-effort security fixes. Old commits, local modifications, third-party reference projects, user-configured models, MCP servers, and external market-data services are not supported versions of FinQuant Hub.

## Report privately

Do not open a public issue containing exploit details, API keys, `.env.local`, SQLite files, portfolio data, research reports, logs with private content, or other credentials.

If the repository's Security page offers **Report a vulnerability**, use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately). Include the affected commit/version, local runtime mode, impact, minimal reproduction, and a redacted proof. If private reporting is not enabled, open a public issue containing only a request for a private security contact; do not include vulnerability details.

Suitable reports include credential disclosure, authorization bypass outside explicit local-only mode, unsafe file access, remote code execution, injection, or a reproducible integrity flaw that lets an attacker change financial evidence without provenance.

Ordinary data-source outages, model hallucinations, investment disagreement, and unsupported upstream behavior should use the bug template unless they also create a security impact.

## Local security boundary

- The supported local profile binds the browser entrypoint to `127.0.0.1`; it is not designed for public internet exposure.
- Local-only mode deliberately has one internal owner and no login. It is not an authorization boundary against other software or users with access to the same computer or Docker daemon.
- Secrets belong in ignored local environment files or the encrypted credential store. They must never be committed or pasted into reports.
- Maintainers will coordinate disclosure through GitHub security advisories when the repository and report support that workflow. No bounty program is offered.

See [Local data and privacy](docs/LOCAL_DATA_AND_PRIVACY.md) for the non-security data boundary.
