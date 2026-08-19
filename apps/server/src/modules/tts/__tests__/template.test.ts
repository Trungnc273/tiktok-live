import { describe, expect, it } from "vitest";
import { renderTemplate } from "../template.js";

describe("renderTemplate", () => {
  it("thay thế biến hợp lệ trong template", () => {
    const { text, missingVariables } = renderTemplate("Cảm ơn {username} đã follow!", {
      username: "vidu_user",
    });
    expect(text).toBe("Cảm ơn vidu_user đã follow!");
    expect(missingVariables).toEqual([]);
  });

  it("giữ nguyên placeholder và báo cáo biến thiếu (invalid variables)", () => {
    const { text, missingVariables } = renderTemplate("Cảm ơn {username} đã tặng {giftName}!", {
      username: "vidu_user",
    });
    expect(text).toBe("Cảm ơn vidu_user đã tặng {giftName}!");
    expect(missingVariables).toEqual(["giftName"]);
  });

  it("sanitize: loai control character khoi gia tri bien", () => {
    const rawValue = String.fromCharCode(97, 98, 99, 10, 100, 101, 102); // "abc" + LF + "def"
    const { text } = renderTemplate("Hi {username}", { username: rawValue });
    expect(text).toBe("Hi abcdef");
  });

  it("sanitize: cắt bớt biến quá dài (chống spam)", () => {
    const longValue = "x".repeat(500);
    const { text } = renderTemplate("{comment}", { comment: longValue });
    expect(text.length).toBe(100);
  });

  it("template không có biến nào vẫn hoạt động bình thường", () => {
    const { text, missingVariables } = renderTemplate("Xin chào mọi người!", {});
    expect(text).toBe("Xin chào mọi người!");
    expect(missingVariables).toEqual([]);
  });
});
