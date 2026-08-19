export class ActionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Action timed out after ${timeoutMs}ms`);
    this.name = "ActionTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ActionTimeoutError(timeoutMs)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
