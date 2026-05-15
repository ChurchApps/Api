// Exponential backoff schedule for failed webhook deliveries. The delay (in
// minutes) before retry N is SCHEDULE_MINUTES[N-1]; after MAX_ATTEMPTS the
// delivery is marked exhausted. Spans roughly 5 days, matching common practice.
const SCHEDULE_MINUTES = [1, 5, 15, 30, 60, 120, 240, 360, 720, 1440, 1440, 1440, 2880, 2880, 4320];

export class WebhookRetryPolicy {
  public static MAX_ATTEMPTS = 16;

  // Given the number of attempts already made, returns when the next attempt
  // should occur, or null if the delivery has exhausted all retries.
  public static nextAttemptAt(attemptCount: number): Date | null {
    if (attemptCount >= WebhookRetryPolicy.MAX_ATTEMPTS) return null;
    const minutes = SCHEDULE_MINUTES[attemptCount - 1] ?? SCHEDULE_MINUTES[SCHEDULE_MINUTES.length - 1];
    return new Date(Date.now() + minutes * 60000);
  }
}
