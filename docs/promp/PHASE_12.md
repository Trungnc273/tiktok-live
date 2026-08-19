# Prompt 12 — OBS Integration

Implement OBS integration only after the core automation system is stable.

Research the current OBS WebSocket API and use the official/current documentation where possible.

Support initial actions:

- switch scene
- show/hide source if feasible
- trigger overlay
- optionally control media source.

Create abstraction:

```text
OBSService
```

Do not couple Rule Engine directly to OBS.

## Security

- Never expose OBS password.
- Never commit credentials.
- Store secrets securely.
- Validate commands.

## Tests

Use mocked OBS server for automated tests.

Create:

`docs/reports/M08-REPORT.md`

Dừng.
