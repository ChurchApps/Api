// Catalog of webhook events, grouped by entity. Adding a new entity to the
// webhook system is a one-line change here plus an emit() call in its controller.
export const WEBHOOK_EVENTS: Record<string, string[]> = {
  person: ["person.created", "person.updated", "person.destroyed"],
  group: ["group.created", "group.updated", "group.destroyed"],
  groupMember: ["group.member.added", "group.member.removed", "group.member.requested"],
  household: ["household.created", "household.updated", "household.destroyed"],
  donation: ["donation.created", "donation.updated"],
  attendance: ["attendance.recorded"],
  session: ["session.created"],
  formSubmission: ["form.submission.created"],
  event: ["event.created", "event.updated", "event.destroyed"],
  registration: ["registration.created"],
  list: ["list.member.added", "list.member.removed"]
};

export const ALL_WEBHOOK_EVENTS: string[] = Object.values(WEBHOOK_EVENTS).flat();

export const isValidWebhookEvent = (event: string): boolean => ALL_WEBHOOK_EVENTS.includes(event);
