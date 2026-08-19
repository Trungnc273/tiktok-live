# Prompt 15 — Production Hardening

Read:

`docs/audit/PRODUCTION-AUDIT.md`

Fix production issues in priority order:

1. CRITICAL
2. HIGH
3. MEDIUM
4. LOW

For every fix:

1. Explain root cause.
2. Modify code.
3. Add/update tests.
4. Run tests.
5. Verify no regression.
6. Update documentation if necessary.

Do not make unrelated refactors.

Do not silently change product requirements.

After every logical group of fixes, report:

- Issue
- Root cause
- Files changed
- Fix
- Tests
- Result.

At the end run:

- lint
- typecheck
- unit tests
- integration tests
- E2E tests
- build.

Create:

`docs/reports/PHASE-15-REPORT.md`

The report must explicitly state:

- what is fixed
- what remains
- what is blocked
- what is not production-ready.

Never report success without actual verification.

Dừng.
