import type { ActionHandler } from "./types.js";

export class HandlerRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  register(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: string): ActionHandler | undefined {
    return this.handlers.get(type);
  }
}
