# TEST-REPORT.md — M12 End-to-End Testing

Ngày chạy: 2026-08-19. Môi trường: Windows 11, Node.js v22.19.0, PostgreSQL 16 (Docker, port 5544).

## Complete flow — 6 scenario bắt buộc (docs/promp/PHASE_13.md)

Chạy trong `apps/server/src/__tests__/e2e/scenarios.e2e.test.ts` — lắp ráp lại đúng chuỗi module thật (`ConnectionManager` → `event-normalizer` → `rule-engine` → `action-engine` → `tts`/`audio` → `overlay-gateway`, dùng socket.io-client thật kết nối qua HTTP thật), **không phải toàn bộ mock**. `MockTTSProvider` thay Windows SAPI thật để chạy nhanh/xác định — provider thật đã verify riêng ở M06/M10 (xem 2 report đó, có bằng chứng audio thật 141–240KB).

| # | Scenario | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | Follow → Rule → TTS | ✅ PASS | TTS provider nhận đúng text đã render template |
| 2 | Gift Rose → Rule → Sound → TTS → Overlay | ✅ PASS | Action chạy đúng thứ tự (sound trước, tts sau theo khai báo rule); overlay nhận đủ `liveEvent` + `soundReady` + `ttsReady` |
| 3 | Comment → Condition → TTS | ✅ PASS | Comment không khớp điều kiện `contains "hello"` → không có action nào chạy; comment khớp → TTS chạy đúng |
| 4 | Nhiều event đồng thời → Queue → Actions đúng thứ tự | ✅ PASS | 5 event `follow` bắn gần như đồng thời → TTSQueue tuần tự đảm bảo thứ tự xử lý khớp đúng thứ tự event phát sinh, không chồng/không đảo thứ tự |
| 5 | Mất kết nối TikTok → Reconnect | ✅ PASS | `simulateUnexpectedDisconnect()` → state chuyển `reconnecting` → tự động về `connected`; event mới sau reconnect vẫn chạy được toàn bộ pipeline |
| 6 | Action lỗi → Retry/failure handling | ✅ PASS | Handler giả lập lỗi vĩnh viễn: đúng 3 lần thử (1 + 2 retry theo `maxRetries`), ghi nhận `status: "failed"`; action kế tiếp (TTS) trong cùng rule **vẫn chạy thành công** (NFR-4); event tiếp theo vẫn được xử lý bình thường |

```text
src/__tests__/e2e/scenarios.e2e.test.ts (6 tests) — 6 passed
```

## Unit tests + Integration tests (toàn bộ monorepo)

```text
apps/dashboard:  Test Files 3 passed (3)   | Tests 10 passed (10)
apps/overlay:    Test Files 3 passed (3)   | Tests 9 passed (9)
apps/server:     Test Files 19 passed (19) | Tests 110 passed (110)
─────────────────────────────────────────────────────────────────
TỔNG:            25 test files, 129 tests — TẤT CẢ PASS
```

`apps/server` bao gồm nhiều integration test chạy **thật với PostgreSQL** (không mock DB): `events-repository`, `execution-log-repository`, `automations-api` — tổng cộng 12 test integration Postgres thật, và 2 test integration overlay+HTTP media thật (TTS/Sound → file audio thật served qua HTTP).

## Lint

```text
$ npm run lint
(không có output = 0 lỗi, 0 cảnh báo)
Exit code: 0
```

Cấu hình ESLint (`eslint.config.js`, flat config, `typescript-eslint` recommended) được tạo **mới ở M12** — dự án trước đó chưa có lint, đây là hạ tầng bắt buộc phải có để thoả yêu cầu "chạy lint" của `PHASE_13.md`, không phải tính năng phát sinh ngoài phạm vi.

## Typecheck

```text
apps/dashboard: tsc --noEmit -p tsconfig.json → 0 lỗi
apps/overlay:   tsc --noEmit -p tsconfig.json → 0 lỗi
apps/server:    tsc --noEmit -p tsconfig.json → 0 lỗi
```

## Build

```text
apps/dashboard: tsc + vite build → dist/index.html (0.43kB), dist/assets/index-*.js (248.65kB, gzip 73.99kB) — THÀNH CÔNG
apps/overlay:   tsc + vite build → dist/index.html (0.43kB), dist/assets/index-*.js (186.79kB, gzip 59.70kB) — THÀNH CÔNG
apps/server:    tsc -p tsconfig.json → dist/ — THÀNH CÔNG
```

## Không claim thành công nếu chưa verify

- Toàn bộ số liệu trên là kết quả chạy lệnh thật trong phiên làm việc này, không suy đoán.
- Provider TTS thật (Windows SAPI) và OBS thật **không** nằm trong bộ E2E tự động này (đã verify riêng, tách biệt, ở M06/M10/M11 — có bằng chứng cụ thể trong các report đó); OBS **chưa từng** verify với OBS Studio thật (máy dev không cài) — đã ghi rõ trong `M11-REPORT.md`, nhắc lại ở đây để không bị bỏ sót trong tổng kết cuối cùng.
