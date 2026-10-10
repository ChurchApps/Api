// import { Group } from "./index.js";

export class ServiceTime {
  public id?: string;
  public churchId?: string;
  public serviceId?: string;
  public name?: string;
  // Optional schedule (church-local). Check-in is only time-gated when dayOfWeek and startTime are set.
  public dayOfWeek?: number | null;
  public startTime?: string | null;
  public endTime?: string | null;
  public checkinOpenMinutes?: number | null;
  public checkinCloseMinutes?: number | null;

  public longName?: string;
  public checkinOpen?: boolean;
  // public groups?: Group[];
}
