# Data source and license boundaries

This document separates source-code licensing from rights to APIs, datasets, reference repositories, model outputs, and user data. It is an engineering inventory, not legal advice.

## Release blockers

As audited on 2026-08-13:

- Project-authored source is licensed under Apache-2.0 with `Copyright 2026 Satanchen`. This license does not extend to excluded references, provider data, user data, or other third-party material.
- The private development tree's `reference/` contains 5,329 tracked entries and six nested Git repositories. It includes upstream code, licenses, assets, and files as large as 31.5 MB. Project rules forbid modifying this directory, and it is excluded from the independent public-source snapshot.
- `backend/app/data/wq_fields.json` is derived from a WorldQuant BRAIN-oriented reference dataset. Permission to redistribute that bundled catalogue has not been established, so the public-source snapshot excludes it and uses the project-authored PARTIAL starter contract instead.

These private files remain license `UNKNOWN` and are not implied permissions. Their redistribution blocker is contained by the documented export boundary.

## Runtime adapters are not data licenses

FinQuant Hub contains adapters for Tencent, Sina, Eastmoney, Yahoo Finance, model providers, and optional MCP servers. Source code that can call a service does not grant a right to access, scrape, cache, publish, or redistribute that service's data. Users are responsible for provider terms, credentials, geography, rate limits, and downstream use.

Runtime responses must retain provider, retrieval/as-of time, period/adjustment basis, and `OK`, `UNKNOWN`, `PARTIAL`, or `UPSTREAM_ERROR`. The project must not convert an unavailable or unlicensed field into a fabricated value or a substitute provider's branded rating.

## Repository dependencies and references

- Python, JavaScript, Docker base images, fonts, and other packages keep their own licenses and notices. A FinQuant Hub root license does not replace them.
- Reference projects are research inputs, not automatically part of the distributable product. Their code and assets must be reviewed individually if retained.
- The exact private/public split, export command, manifest guarantees, and starter status contract are documented in `docs/PUBLICATION_BOUNDARY.md`.
- Generated reports and exports can contain provider data, model output, and user hypotheses. A source-code license does not automatically authorize publication of those artifacts.
- User portfolios, notes, credentials, prompts, and saved research remain user-controlled local data.

## Source license decision

On 2026-08-13 the maintainer authorized Apache-2.0 for project-authored source with `Copyright 2026 Satanchen`. Third-party packages and excluded source/data retain their own terms; this decision is not legal advice.
