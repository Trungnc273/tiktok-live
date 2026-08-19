import type { LiveEvent } from "@tiktok-live/shared-types";

/** Biến sẵn có cho template, tuỳ theo LiveEvent.type. */
export function buildTemplateVariables(event: LiveEvent): Record<string, string> {
  const vars: Record<string, string> = {
    username: event.user.username,
  };

  switch (event.type) {
    case "comment":
      vars.comment = event.payload.text;
      break;
    case "gift":
      vars.giftName = event.payload.giftName;
      vars.count = String(event.payload.count);
      break;
    case "like":
      vars.count = String(event.payload.count);
      break;
    case "join":
      if (event.payload.viewerCount !== undefined) {
        vars.viewerCount = String(event.payload.viewerCount);
      }
      break;
    default:
      break;
  }

  return vars;
}
