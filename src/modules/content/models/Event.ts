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
  registrationEnabled?: boolean;
  capacity?: number;
  waitlistEnabled?: boolean;
  registrationOpenDate?: Date;
  registrationCloseDate?: Date;
  tags?: string;
  formId?: string;
  approvalStatus?: string;
  requestedBy?: string;
  rsvpDisabled?: boolean;
}
