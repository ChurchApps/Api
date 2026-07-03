export class EventRsvp {
  id?: string;
  churchId?: string;
  eventId?: string;
  personId?: string;
  occurrenceStart?: Date;
  response?: "yes" | "no" | "maybe";
  timeAdded?: Date;
  timeUpdated?: Date;
}
