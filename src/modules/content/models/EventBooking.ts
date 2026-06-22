export class EventBooking {
  id?: string;
  churchId?: string;
  eventId?: string;
  roomId?: string;
  resourceId?: string;
  quantity?: number;
  status?: string;
  setupMinutes?: number;
  teardownMinutes?: number;
  startTime?: Date;
  endTime?: Date;
  requestedBy?: string;
  requestedDate?: Date;
  resolvedBy?: string;
  resolvedDate?: Date;
  notifiedDate?: Date;
}
