// Mirrors messaging's CreateNotificationOptions (src/modules/messaging/helpers/NotificationHelper.ts)
// structurally, so shared/ doesn't import module-internal types across the module boundary.
export interface NotificationServiceOptions {
  deliveryStartLevel?: number;
  deliveryTitle?: string;
  navData?: Record<string, unknown>;
  category?: string;
  emailByPerson?: Record<string, { subject: string; html: string }>;
  emailImmediate?: boolean;
}

export type CreateNotificationsFn = (
  peopleIds: string[],
  churchId: string,
  contentType: string,
  contentId: string,
  message: string,
  link?: string,
  triggeredByPersonId?: string,
  options?: NotificationServiceOptions
) => Promise<unknown>;

export class NotificationService {
  private static createNotificationsImpl: CreateNotificationsFn | null = null;

  static register(impl: CreateNotificationsFn) {
    NotificationService.createNotificationsImpl = impl;
  }

  static async createNotifications(
    peopleIds: string[],
    churchId: string,
    contentType: string,
    contentId: string,
    message: string,
    link?: string,
    triggeredByPersonId?: string,
    options?: NotificationServiceOptions
  ): Promise<unknown> {
    if (!NotificationService.createNotificationsImpl) {
      throw new Error("NotificationService not initialized. Ensure the messaging module has booted before sending notifications.");
    }
    return NotificationService.createNotificationsImpl(peopleIds, churchId, contentType, contentId, message, link, triggeredByPersonId, options);
  }
}
