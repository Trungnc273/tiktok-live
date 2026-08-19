# Prompt 13 — End-to-End Testing

The MVP implementation is now expected to exist.

Do not add new features unless required to fix a test failure.

## Test the complete flow

### Scenario 1

```text
Follow
 ↓
Rule
 ↓
TTS
```

### Scenario 2

```text
Gift Rose
 ↓
Rule
 ↓
Sound
 ↓
TTS
 ↓
Overlay
```

### Scenario 3

```text
Comment
 ↓
Condition
 ↓
TTS
```

### Scenario 4

```text
Multiple events simultaneously
 ↓
Queue
 ↓
Ordered actions
```

### Scenario 5

```text
TikTok connection lost
 ↓
Reconnect
```

### Scenario 6

```text
Action failure
 ↓
Retry / failure handling
```

## Requirements

Run:

- unit tests
- integration tests
- E2E tests
- lint
- typecheck
- build.

Record exact results.

Create:

`docs/testing/TEST-REPORT.md`

and:

`docs/reports/PHASE-13-REPORT.md`

Do not claim success unless commands actually pass.

Dừng.
