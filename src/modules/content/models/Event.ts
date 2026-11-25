export class Event {
  id?: string;
  churchId?: string;
  groupId?: string;
  allDay?: boolean;
  start?: Date;
  end?: Date;
  title?: string;
  description?: string;
  location?: string;
  visibility?: string;
  recurrenceRule?: string;
  exceptionDates?: Date[];
  registrationEnabled?: boolean;
  capacity?: number;
  waitlistEnabled?: boolean;
  allowSelfCancel?: boolean;
  allowPayLater?: boolean;
  registrationOpenDate?: Date;
  registrationCloseDate?: Date;
  tags?: string;
  formId?: string;
  // Plain text added to the registration confirmation email.
  confirmationMessage?: string;
  approvalStatus?: string;
  requestedBy?: string;
  resolvedBy?: string;
  resolvedDate?: Date;
  rsvpDisabled?: boolean;
  photoUrl?: string;
  notesViewRole?: string;
  notesPostRole?: string;
}
