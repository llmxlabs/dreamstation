# Security issue record

No confirmed open findings remain from the [2026-11-08 release review](scans/20261108-release.md). This is a scoped assessment, not a guarantee of absence.

## Closed findings

| ID | Status | Severity / confidence | Component and fingerprint basis | Fix and evidence |
| --- | --- | --- | --- | --- |
| SEC-2026-001 | FIXED | High / Confirmed | dependencies: runtime Next, Sharp and unused auth/database dependencies | Updated supported packages, removed unused dependencies, refreshed lockfile; final OSV and npm audit have zero findings. |
| SEC-2026-002 | FIXED | High / High | upload-validation: `src/lib/storage.ts` / media writes (CWE-434, CWE-22) | Server limits, controlled types, decoded media checks, generated filenames, bounded FFmpeg execution, confined deletion and rollback. Media regression tests cover spoofing, traversal and cleanup. |
| SEC-2026-003 | FIXED | Medium / Confirmed | debug-disclosure: `src/app/api/debug/route.ts` (CWE-200) | Removed bulk debug endpoint. Production route list no longer exposes it. |
| SEC-2026-004 | FIXED | Medium / Confirmed | lifecycle: pairing, collections and heartbeat storage | Transactions, one-use codes, input/config validation, bounded heartbeat retention, offline expiry; isolated SQLite lifecycle tests pass. |
| SEC-2026-005 | FIXED | Medium / Confirmed | upload-error-disclosure: `src/actions/assets.ts` (CWE-209) | Exact public-message allowlist; unknown internal exceptions return generic text. Regression proves no private-looking path escapes. |

Owner: llmxlabs. First/last seen: 2026-11-08 for all entries. See the linked assessment for scanner scope and validation. The unauthenticated LAN model is an explicit product boundary, not an internet-hosting security claim. Do not deploy outside that boundary.
