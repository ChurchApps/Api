// In-process pub/sub for domain events. WebhookDispatcher.emit() publishes here
// so modules can react to mutations (e.g. the doing module starts workflows)
// without importing each other. publish() never throws — a subscriber failure
// must never break the originating write.
export type InternalEventHandler = (churchId: string, event: string, payload: any) => Promise<void>;

export class InternalEventBus {
  private static handlers: InternalEventHandler[] = [];

  public static subscribe(handler: InternalEventHandler): void {
    InternalEventBus.handlers.push(handler);
  }

  public static async publish(churchId: string, event: string, payload: any): Promise<void> {
    for (const handler of InternalEventBus.handlers) {
      try {
        await handler(churchId, event, payload);
      } catch (e) {
        console.error("InternalEventBus handler failed:", e);
      }
    }
  }
}
