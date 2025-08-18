import { Visit, Session } from "./";

export class VisitSession {
  public id?: string;
  public churchId?: string;
  public visitId?: string;
  public sessionId?: string;

  public visit?: Visit;
  public session?: Session;
}
