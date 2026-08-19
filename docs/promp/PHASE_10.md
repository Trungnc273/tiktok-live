# Prompt 10 — Realtime Overlay

Implement realtime overlay.

## Architecture

```text
Backend
 ↓
WebSocket
 ↓
React Overlay
 ↓
Animation
```

Overlay must support:

- follow alert
- gift alert
- comment alert
- custom text
- sound trigger
- animation.

Create a public overlay URL that can be added to OBS as Browser Source.

## Requirements

- reconnect
- heartbeat
- authentication/token
- event ordering
- duplicate protection
- graceful fallback.

## UI

Create a clean overlay demo.

Do not build the full dashboard yet.

## Verification

The following must work:

```text
Fake Gift Event
 ↓
Backend
 ↓
WebSocket
 ↓
Browser Overlay
 ↓
Gift animation
```

Create:

`docs/reports/M06-REPORT.md`

Dừng.
