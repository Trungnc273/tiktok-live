import type { ConditionNode, LiveEvent } from "@tiktok-live/shared-types";

/**
 * Đọc giá trị field từ LiveEvent theo đường dẫn dot-notation (ví dụ "payload.giftName").
 * Chỉ dùng nội bộ sau khi rule đã qua validateRule() (field đã được whitelist),
 * nhưng vẫn phòng thủ nếu path không tồn tại (trả undefined thay vì throw).
 */
function getFieldValue(event: LiveEvent, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, event);
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function evaluateComparison(
  node: Extract<ConditionNode, { op: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan" | "greaterOrEqual" | "lessOrEqual" }>,
  event: LiveEvent,
): boolean {
  const actual = getFieldValue(event, node.field);

  switch (node.op) {
    case "equals":
      return actual === node.value;
    case "notEquals":
      return actual !== node.value;
    case "contains":
      return typeof actual === "string" && typeof node.value === "string" && actual.includes(node.value);
    case "greaterThan":
    case "lessThan":
    case "greaterOrEqual":
    case "lessOrEqual": {
      const a = toComparableNumber(actual);
      const b = toComparableNumber(node.value);
      if (a === null || b === null) return false;
      if (node.op === "greaterThan") return a > b;
      if (node.op === "lessThan") return a < b;
      if (node.op === "greaterOrEqual") return a >= b;
      return a <= b;
    }
    default:
      return false;
  }
}

export function evaluateCondition(node: ConditionNode, event: LiveEvent): boolean {
  if (node.op === "and") return node.nodes.every((child) => evaluateCondition(child, event));
  if (node.op === "or") return node.nodes.some((child) => evaluateCondition(child, event));
  return evaluateComparison(node, event);
}
