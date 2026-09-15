export async function retryOnDeadlock<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      last = e;
      const code = (e as { code?: string })?.code;
      if (code !== "ER_LOCK_DEADLOCK" || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 40 * (i + 1)));
    }
  }
  throw last;
}
