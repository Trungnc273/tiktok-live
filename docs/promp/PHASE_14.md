# Prompt 14 — Production Readiness Audit

Act as:

- Principal Engineer
- Security Engineer
- SRE
- QA Lead.

Review the entire implementation.

Do not immediately modify code.

## Audit

### Security

- secrets
- authentication
- authorization
- WebSocket security
- injection
- SSRF
- file upload
- malicious TTS input
- rate limits.

### Reliability

- reconnect
- queue failure
- duplicate events
- race conditions
- worker crashes
- provider failure.

### Performance

- high-volume likes
- high-volume comments
- gift bursts
- TTS queue overload
- WebSocket connections.

### Maintainability

- architecture
- module boundaries
- coupling
- tests
- documentation.

### Production

- Docker
- environment variables
- logging
- metrics
- health checks
- graceful shutdown
- backup
- database migration.

## Output

Create:

`docs/audit/PRODUCTION-AUDIT.md`

Categorize findings:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFO

Do not fix anything yet.

Create:

`docs/reports/PHASE-14-REPORT.md`

Dừng.
