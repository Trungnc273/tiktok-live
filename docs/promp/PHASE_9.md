# Prompt 09 — TTS and Audio

Implement TTS and audio playback infrastructure.

## TTS

Create provider abstraction:

```text
TTSProvider
 ├── Provider A
 ├── Provider B
 └── MockProvider
```

Do not tightly couple Action Engine to one vendor.

## Template

Support:

```text
"Cảm ơn {username} đã follow!"
```

Variables must be sanitized.

## Queue

Implement:

```text
Event
 ↓
TTS request
 ↓
Queue
 ↓
Worker
 ↓
Audio
```

Prevent overlapping speech unless explicitly configured.

## Audio

Support:

- mp3
- wav
- other formats only if technically supported.

## Tests

- template replacement
- invalid variables
- provider failure
- queue
- concurrent events
- rate limiting.

Create:

`docs/reports/M05-REPORT.md`

Dừng.
