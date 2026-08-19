# Prompt 08 — Action Engine

Implement Action Engine.

## Initial actions

1. TTS
2. Sound
3. Overlay event
4. WebSocket broadcast.

## Architecture

```text
Rule Engine
     ↓
Action Dispatcher
     ↓
Action Handler
     ├── TTSHandler
     ├── SoundHandler
     ├── OverlayHandler
     └── WebSocketHandler
```

## Requirements

- Actions execute in defined order.
- Failure of one action must not silently destroy the whole automation.
- Support timeout.
- Support retry where appropriate.
- Log every execution.
- Store execution status.
- Prevent duplicate execution where event IDs are available.

## Tests

Test success/failure/timeout/retry/idempotency.

Create:

`docs/reports/M04-REPORT.md`

Dừng.
