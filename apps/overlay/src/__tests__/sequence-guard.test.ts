import { describe, expect, it } from "vitest";
import { SequenceGuard } from "../sequence-guard.js";

describe("SequenceGuard", () => {
  it("chấp nhận sequence tăng dần", () => {
    const guard = new SequenceGuard();
    expect(guard.accept(1)).toBe(true);
    expect(guard.accept(2)).toBe(true);
    expect(guard.accept(3)).toBe(true);
  });

  it("từ chối sequence trùng hoặc cũ hơn (duplicate protection sau reconnect)", () => {
    const guard = new SequenceGuard();
    guard.accept(5);
    expect(guard.accept(5)).toBe(false);
    expect(guard.accept(3)).toBe(false);
    expect(guard.accept(6)).toBe(true);
  });
});
