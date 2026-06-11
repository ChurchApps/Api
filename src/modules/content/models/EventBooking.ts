export class EventBooking {
  id?: string;
  churchId?: string;
  eventId?: string;
  roomId?: string;
  resourceId?: string;
  quantity?: number;
  status?: string;
  requestedBy?: string;
  requestedDate?: Date;
  resolvedBy?: string;
  resolvedDate?: Date;
  notifiedDate?: Date;
}
