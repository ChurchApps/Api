export type CreateNotificationsFn = (
  peopleIds: string[],
  churchId: string,
  contentType: string,
  contentId: string,
  message: string,
  link?: string,
  triggeredByPersonId?: string
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
    triggeredByPersonId?: string
  ): Promise<unknown> {
    if (!NotificationService.createNotificationsImpl) {
      throw new Error("NotificationService not initialized. Ensure the messaging module has booted before sending notifications.");
    }
    return NotificationService.createNotificationsImpl(peopleIds, churchId, contentType, contentId, message, link, triggeredByPersonId);
  }
}
