# Publication boundary

FinQuant Hub uses two distinct source surfaces. This boundary prevents local research inputs and user state from being mistaken for redistributable project source. It is an engineering control, not legal advice or a license grant.

## Private development tree

The working tree may contain `reference/`, nested upstream Git repositories, an optional `backend/app/data/wq_fields.json`, local environment files, SQLite databases, test evidence, dependency caches, and build output. Their presence supports private development only. File availability does not prove ownership, upstream validity, or redistribution permission.

When the optional WQ-oriented JSON is readable, Alpha endpoints report `BUNDLED_EXTERNAL`, data status `OK`, source `local_bundled_file`, and redistribution status `UNKNOWN`. `OK` means the local file parsed; it is not live WorldQuant BRAIN verification or a redistribution decision.

## Public source snapshot

Run the PowerShell exporter with a target that does not exist and is outside the project:

```powershell
.\scripts\export_public_source.ps1 -Destination C:\path\to\new-finquant-hub-source
```

The exporter copies only named top-level files and the `.github`, `backend`, `docker`, `docs`, `frontend`, and `scripts` source roots. It excludes:

- all Git metadata and `reference/`;
- the optional WQ catalogue and its derived summary;
- `.env` values, SQLite databases and backups;
- dependency directories, caches, test output, compiled output and private work directories;
- filesystem reparse points.

It refuses an existing target rather than merging or overwriting. It retains partial output if a copy fails and never initializes Git, commits, publishes, or deletes the snapshot. `PUBLIC_SOURCE_MANIFEST.json` records the source kind, exclusion counts, every included file's byte size and SHA256, and a deterministic tree SHA256. It never records secret values.

Without the optional catalogue, the public source uses eight project-authored generic field contracts needed by the five existing Alpha templates. Coverage is `null`; endpoints and UI report `FINQUANT_STARTER`, `PARTIAL`, source `finquant.starter`, and redistribution `PROJECT_AUTHORED`. This starter is not a WorldQuant catalogue and does not prove that any upstream can supply those fields.

## What the snapshot does not prove

An export from the current dirty worktree is not a GitHub clone or an immutable commit. A successful Docker build proves only that the captured source can build and run in that local verification environment. It does not validate live market/model providers, production recovery, or legal permission. A root source license and a maintainer-authorized candidate commit remain separate release gates.
