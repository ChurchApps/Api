// Device row as returned by the messaging module gateway (fields read by ScreenController).
export interface ScreenDevice {
  id?: string;
  deviceId?: string;
  churchId?: string;
  label?: string;
  deviceInfo?: string;
  registrationDate?: Date;
  lastActiveDate?: Date;
  contentType?: string;
  contentId?: string;
  secret?: string;
  status?: unknown;
}
