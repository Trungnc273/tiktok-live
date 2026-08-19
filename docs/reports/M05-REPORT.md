# M05-REPORT.md — Action Engine

## Implemented

- `apps/server/src/modules/action-engine/`:
  - `types.ts` — `ActionHandler`, `ActionContext`, `ExecutionLogPort` (interface — action-engine KHÔNG phụ thuộc trực tiếp Postgres/Drizzle, đúng module boundary của `SYSTEM-ARCHITECTURE.md`).
  - `handler-registry.ts` — `HandlerRegistry`: đăng ký handler theo `action.type`, cho phép đăng ký thêm ở M06-M08 mà không sửa dispatcher.
  - `timeout.ts` — `withTimeout()` + `ActionTimeoutError`.
  - `retry.ts` — `runWithRetry()`.
  - `dispatcher.ts` — `ActionDispatcher.dispatch()`: chạy tuần tự từng action theo đúng thứ tự, 1 action lỗi không chặn action kế tiếp (NFR-4), timeout + retry theo cấu hình từng handler, ghi execution log qua `ExecutionLogPort`.
  - `memory-execution-log.ts` — `MemoryExecutionLogPort`: implementation in-memory cho test/dev.
- `apps/server/src/modules/persistence/execution-log-repository.ts` — `createExecutionLogPort()`: implementation Postgres thật của `ExecutionLogPort`, dùng bảng `execution_logs` đã tạo ở M03.

## Architecture đã đáp ứng

```text
Rule Engine (M04)
     ↓
Action Dispatcher
     ↓
Action Handler (registry — CHƯA có handler thật, chỉ có stub trong test ở M05)
```

## Idempotency — cơ chế cụ thể

`tryClaim()` **insert trước** 1 row `execution_logs` cho khoá `(event_id, automation_id, action_index)` — dựa vào **unique index đã tạo ở M03**, không phải SELECT-rồi-INSERT (tránh race condition giữa check và insert khi có nhiều event dồn dập). Vi phạm unique constraint → coi là "đã claim trước đó" → action **không được thực thi lần 2**.

## Requirements đã đáp ứng

- Actions execute theo đúng thứ tự khai báo — ✅ (test "action ordering" + `dispatch()` dùng vòng lặp tuần tự, không `Promise.all`).
- Failure của 1 action không phá toàn bộ automation — ✅ (mỗi action bọc try/catch riêng, vòng lặp tiếp tục).
- Timeout — ✅ (`withTimeout`, mặc định 5000ms, override qua `handler.timeoutMs`).
- Retry — ✅ (`runWithRetry`, mặc định 0 — chỉ handler tự khai báo `maxRetries > 0` mới retry, vì chỉ action idempotent mới nên retry an toàn).
- Log every execution — ✅ (mọi action, kể cả `skipped` do chưa có handler hoặc do idempotent-skip, đều ghi qua `ExecutionLogPort`).
- Prevent duplicate execution — ✅ (idempotency ở trên).

## Tests

**8 test mới** (7 unit trong `dispatcher.test.ts` dùng `MemoryExecutionLogPort` + 1 integration test Postgres thật trong `execution-log-repository.integration.test.ts`):

- success, failure không chặn action kế tiếp, timeout, retry-rồi-thành-công, retry-hết-lượt-vẫn-lỗi, idempotency (không chạy lần 2), action type chưa có handler → skipped không throw.
- Integration Postgres thật: `tryClaim` thành công lần đầu, thất bại (đúng ngữ nghĩa idempotent) lần 2 cho cùng khoá — xác nhận bằng unique constraint thật của DB, không phải giả lập.

## Actual test result

```text
Test Files  6 passed (6)
     Tests  51 passed (51)   (43 từ M01-M04 + 8 từ M05)
```

`npm run typecheck` và `npm run build` sạch. Sự cố phát hiện trong lúc code: chữ ký nội bộ của `runOne()` khai báo tay `{ type: string; payload: unknown }` thay vì dùng lại type `RuleAction` từ `@tiktok-live/shared-types` — vì `RuleAction.payload` (Zod `z.unknown()`) là optional trong type suy ra, gây lỗi type mismatch khi truyền phần tử thật từ `RuleMatch.actions`. Sửa bằng cách dùng lại `RuleAction` thay vì khai báo tay.

## Known limitations

- **Chưa có handler thật nào** (TTS/Sound/Overlay/WebSocket) — đúng phạm vi M05 ("Initial actions" chỉ cần abstract dispatcher, không implement tất cả action ngay). Sẽ implement ở M06 (TTS), M07 (Sound), M08+M09 (Overlay/WebSocket).
- Chưa nối `ActionDispatcher` vào `main.ts` — cố ý để lại tới khi có ít nhất 1 handler thật (M06), vì nối vào giờ chỉ chạy toàn "skipped" (không có handler đăng ký), không kiểm chứng được gì thêm ngoài những gì unit test đã phủ.
- `retry` không có backoff delay giữa các lần thử (ghi rõ trong code) — chấp nhận được ở MVP vì timeout mỗi action đã đủ ngắn; cân nhắc thêm nếu cần ở Phase 2.

## Next step

M06 — TTS: implement `TTSProvider` abstraction + hàng đợi, đăng ký handler `type: "tts"` đầu tiên vào `HandlerRegistry`, khi đó mới nối `ActionDispatcher` vào `main.ts` để có bằng chứng end-to-end thật (Follow → Rule → TTS).
