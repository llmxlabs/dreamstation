# Security review records

DreamStation is a trusted-LAN application without login. This deliberate scope is documented in the [security policy](../../SECURITY.md) and [deployment guide](../DEPLOYMENT.md).

- [Issue record](SECURITY-ISSUES.md)
- [Scan history](SCAN-HISTORY.md)
- [2026-11-08 release assessment](scans/20261108-release.md)

The release assessment used separate dependency, code and secrets reviewers, followed by independent triage and targeted regression tests. Raw JSON and logs stay in ignored `.security/runs/`; only sanitized summaries belong in Git.

For a future review: run OSV against `package-lock.json`, `npm audit --package-lock-only --json`, Semgrep CE with `p/javascript` and `p/typescript` (`--metrics=off`), fully redacted Gitleaks against history and a curated publishable tree, ShellCheck on shell scripts, and actionlint on workflows. Record versions and commands. Missing required coverage is INCOMPLETE. Review each candidate before opening an issue; do not equate scanner counts with confirmed vulnerabilities.

Recheck dependency findings after upgrades, and require regression tests for source fixes. Keep stable issue IDs and append scan history; never place secret matches or machine-specific paths in public records.
