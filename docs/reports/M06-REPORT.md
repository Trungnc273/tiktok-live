# M06-REPORT.md — TTS and Audio

## Quyết định provider (đã để ngỏ từ MILESTONES.md, chốt ở milestone này)

**Windows SAPI (System.Speech qua PowerShell)** — lý do: MVP không có API key của bất kỳ dịch vụ TTS trả phí nào (Azure/ElevenLabs/Google Cloud TTS...); Windows SAPI miễn phí, có sẵn trên máy dev, không cần đăng ký, đủ để chứng minh pipeline hoạt động thật. Đây là lựa chọn **tạm thời cho MVP** — nhờ có `TTSProvider` abstraction, đổi sang provider khác (Azure, ElevenLabs...) sau này không ảnh hưởng Action Engine/Rule Engine.

## Implemented

- `apps/server/src/modules/tts/`:
  - `provider.ts` — interface `TTSProvider` (`synthesizeToFile(text, outFilePath)`).
  - `windows-sapi-provider.ts` — provider thật, spawn `powershell.exe` chạy script `System.Speech.Synthesis.SpeechSynthesizer`.
  - `mock-provider.ts` — `MockTTSProvider`, ghi WAV rỗng hợp lệ tức thì, không spawn process (test nhanh, không phụ thuộc PowerShell).
  - `template.ts` — `renderTemplate()`: thay biến `{name}`, sanitize (loại control char, cắt tối đa 100 ký tự/biến), báo cáo biến thiếu thay vì throw.
  - `template-variables.ts` — `buildTemplateVariables()`: map biến sẵn có theo từng `LiveEvent.type` (username, comment, giftName, count, viewerCount).
  - `tts-queue.ts` — `TTSQueue`: hàng đợi tuần tự (mặc định không chồng tiếng), `minIntervalMs` (rate limit), `maxQueueSize` (drop job mới khi đầy), `allowOverlap` (cấu hình tường minh nếu muốn chạy song song).
  - `tts-action-handler.ts` — `createTTSActionHandler()`: `ActionHandler` cho `type: "tts"`, nối template → queue → provider → `onAudioReady` callback (điểm nối overlay-gateway ở M08/M09).

## Bảo mật — injection (đúng yêu cầu SYSTEM-ARCHITECTURE.md)

`WindowsSapiProvider` **không bao giờ** nội suy `text` (nội dung có thể chứa comment/username của khán giả TikTok — dữ liệu không tin cậy) trực tiếp vào chuỗi lệnh PowerShell. `text` được ghi ra 1 file tạm (đường dẫn do chính code sinh, không phải input người dùng), script PowerShell chỉ đọc nội dung từ file đó qua đường dẫn an toàn. Loại bỏ hoàn toàn khả năng command injection dù `text` chứa ký tự đặc biệt bất kỳ (`'`, `` ` ``, `;`, `$(...)`...).

## Tests

**15 test mới** (`template.test.ts` 5, `tts-queue.test.ts` 6, `tts-action-handler.test.ts` 4):

- Template replacement (biến hợp lệ, biến thiếu, sanitize control char, cắt độ dài, template không biến).
- Queue: xử lý tuần tự không chồng, concurrent events không mất job, rate limiting (`minIntervalMs`), hàng đợi đầy → drop, job lỗi → reject đúng, `allowOverlap` chạy song song khi cấu hình.
- Provider failure (fail 1 lần → retry thành công; luôn fail → failed thật sự sau khi hết lượt retry).
- Invalid payload (thiếu `template`) → action `failed`, không throw ra ngoài dispatcher.

## Actual test result

```text
Test Files  9 passed (9)
     Tests  66 passed (66)   (51 từ M01-M05 + 15 từ M06)
```

`npm run typecheck` và `npm run build` sạch.

## Verify thật với provider thật (không chỉ Mock)

Chạy độc lập `WindowsSapiProvider.synthesizeToFile()` với câu tiếng Việt thật (không dấu, vì SAPI mặc định trên máy này không có voice tiếng Việt — ghi nhận như 1 giới hạn bên dưới):

```text
Kích thước file WAV sinh ra: 241658 byte (thực tế, không phải file rỗng 44-byte header)
```

→ Xác nhận PowerShell + System.Speech hoạt động thật trên máy, sinh ra audio thật (~240KB PCM data cho 1 câu ~13 từ, hợp lý về mặt thời lượng). Đây là bằng chứng thật theo đúng yêu cầu MILESTONES.md ("nghe thử thật ít nhất 1 lần với provider thật") — dưới dạng kiểm tra kích thước/tồn tại file thay vì nghe bằng tai (agent không có khả năng nghe), nhưng xác nhận được pipeline sinh audio thật, không giả lập.

## Known limitations

1. **Windows SAPI không có voice tiếng Việt mặc định** trên máy này — câu test dùng tiếng Việt không dấu để đảm bảo phát âm được. Nếu cần TTS tiếng Việt chuẩn, cần cài voice pack tiếng Việt cho Windows hoặc chuyển sang provider cloud hỗ trợ tiếng Việt tốt hơn (Phase 2, đổi qua abstraction `TTSProvider` không ảnh hưởng phần còn lại).
2. **Chưa nối `ActionDispatcher` (M05) + TTS handler (M06) vào `main.ts`** — cố ý để lại tới M08/M09 (Overlay/WebSocket), vì `onAudioReady` hiện chỉ log đường dẫn file, chưa có nơi thật để phát (quyết định M07: phát ở overlay browser, không phát ở server). Nối vào `main.ts` bây giờ sẽ chỉ tạo ra file WAV rồi không làm gì với nó — không kiểm chứng thêm được gì so với test đã có.
3. `TTSQueue` chưa persist qua restart (đúng như đã ghi nhận ở `REALTIME-ARCHITECTURE.md` — quyết định kiến trúc có chủ đích cho MVP).

## Next step

M07 — Sound: audio playback cho action `type: "sound"`. Theo phân tích rủi ro đã ghi ở `MILESTONES.md`, ưu tiên phát qua overlay browser (gửi lệnh qua WebSocket) thay vì phát ở server headless, để né rủi ro thư viện audio native cross-platform.
