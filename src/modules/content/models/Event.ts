export class Event {
  id?: string;
  churchId?: string;
  groupId?: string;
  allDay?: boolean;
  start?: Date;
  end?: Date;
  title?: string;
  description?: string;
  visibility?: string;
  recurrenceRule?: string;
  exceptionDates?: Date[];
}
