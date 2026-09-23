# SQLite Backup, Restore, and Consistency Runbook

## Scope and safety

`backend/scripts/audit_database_recovery.py` creates a SQLite backup and a restored verification copy without replacing the authoritative database. It opens the source in read-only/query-only mode and requires the backup and restore paths to be distinct, absent files whose parent directories already exist. It reserves each target with exclusive create semantics and never overwrites or automatically deletes an artifact.

The JSON report contains schema, file size, logical fingerprints, table row counts, integrity counts, and bounded row locators only. It does not emit evidence values, report bodies, memory content, credentials, sessions, tokens, or other business content. The command audits and reports; it never repairs, deletes, reassigns, or upgrades records.

## Drill command

Stop application writers for an operational disaster-recovery rehearsal, then run from `backend/` with three explicit paths:

```powershell
.venv\Scripts\python.exe scripts/audit_database_recovery.py `
  C:\finquant\data\finquant.db `
  C:\finquant\backups\finquant-2026-08-13.db `
  C:\finquant\restore-check\finquant-2026-08-13.db
```

The source must exist. Both targets must not exist, and the runner refuses source/target overlap. Exit codes are:

- `0`: backup, restore, physical integrity, logical fingerprint, and all defined reference checks pass.
- `1`: files were created, but an integrity, snapshot, schema-support, or logical-reference check failed. Preserve the artifacts for diagnosis; do not promote the restored copy.
- `2`: unsafe paths, filesystem failure, or an unreadable SQLite database prevented the drill. Existing files are not overwritten.

Each invocation writes versioned `database-recovery-audit/v1` JSON to stdout. Store that output in an access-controlled operational evidence location if retention is required; it is not written into the repository automatically.

## Checks

The source, backup, and restored copy are independently checked for:

- `PRAGMA integrity_check` and `PRAGMA foreign_key_check`;
- schema version support, deterministic logical fingerprint, and per-table row counts (including SQLite FTS internal storage in the physical table count);
- exact equality of `evidence_objects.inputs_json` and `evidence_input_refs`;
- existence and same-owner scope of evidence and memory IDs embedded in scheduled-run JSON;
- existence and same-owner scope of evidence IDs embedded in Thesis-review JSON;
- both directions of scheduled-run/report linkage;
- invalid JSON, invalid reference types, duplicate references, dangling references, and cross-owner references.

Native foreign keys continue to cover direct typed-memory evidence, supersession, workspace, Thesis/evidence, and owner relationships. The added logical audit covers JSON and bidirectional links that SQLite foreign keys cannot fully express.

## Recovery decision

A PASS means the newly restored verification file represents the same logical snapshot as the source and passes the checks above. It does not authorize replacing a live database. For an actual recovery:

1. stop all application writers and retain the damaged/current database as a recoverable artifact;
2. run this drill against the selected backup into a new verification path;
3. require PASS and review schema/version expectations before any replacement;
4. perform the separately authorized operational file switch while the application remains stopped;
5. start the application, verify startup/migration logs, authentication isolation, and owner-scoped evidence/memory audits before reopening access.

The repository does not automate step 4 because replacing an authoritative database is destructive and environment-specific.

## AIOS-064 deterministic rehearsal

On 2026-08-13, the CLI was run against a temporary deterministic schema v23 fixture containing two canonical evidence objects, one typed memory, one completed scheduled run, two run evidence refs, and one run memory ref.

- Source / backup / restore size: 823,296 / 823,296 / 823,296 bytes.
- Restored schema: v23; physical tables including FTS internal storage: 57; rows: 43.
- Shared logical fingerprint: `c2efb62102fffa18ee6db69fe55808c7196907683f683bd0bdac95de4a56aeb0`.
- Source = backup = restore fingerprint: PASS.
- Restore integrity / logical audit: PASS / PASS; issue count 0.
- No real LLM, market-data, network, or other upstream call occurred.

The temporary source, backup, and restored copy were sent to the Windows Recycle Bin after evidence capture. This fixture proves the local mechanism and defined invariants only; it does not establish cloud-backup durability, cross-machine RPO/RTO, production capacity, or real-user data correctness.
