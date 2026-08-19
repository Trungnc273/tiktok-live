/**
 * Render template dạng "Cảm ơn {username} đã follow!" (docs/promp/PHASE_9.md).
 * Biến PHẢI được sanitize trước khi chèn vào text đưa cho TTS provider — không phải
 * để chống injection lệnh hệ thống (đã xử lý ở tầng WindowsSapiProvider bằng cách
 * không bao giờ nội suy text vào command), mà để tránh:
 *  - Control character làm hỏng file text trung gian.
 *  - Text quá dài (spam) làm audio quá dài, chiếm hàng đợi.
 */
const MAX_VARIABLE_LENGTH = 100;

function sanitizeVariable(value: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(new RegExp("[\\x00-\\x1f\\x7f]", "g"), "").trim();
  return stripped.slice(0, MAX_VARIABLE_LENGTH);
}

export interface RenderResult {
  text: string;
  /** Tên biến trong template không có trong `variables` -> giữ nguyên placeholder, ghi lại để cảnh báo. */
  missingVariables: string[];
}

export function renderTemplate(template: string, variables: Record<string, string>): RenderResult {
  const missingVariables: string[] = [];

  const text = template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in variables)) {
      missingVariables.push(name);
      return match; // giữ nguyên "{name}" để dễ nhận ra khi debug
    }
    return sanitizeVariable(variables[name]);
  });

  return { text, missingVariables };
}
