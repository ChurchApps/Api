import { Event, EventException } from "../models/index.js";
import { Repos } from "../repositories/index.js";

export class CalendarHelper {
  public static eventKey(event: Event | Record<string, any>): string | undefined {
    const e = event as any;
    return e.realEventId || e.eventId || e.id;
  }

  public static async addExceptionDates(events: Event[], repos?: Repos) {
    if (events.length === 0) return;

    if (!repos) {
      const { RepoManager } = await import("../../../shared/infrastructure/index.js");
      repos = await RepoManager.getRepos<Repos>("content");
    }

    const eventIds = [...new Set(events.map((event) => CalendarHelper.eventKey(event)).filter(Boolean))] as string[];
    events.forEach((event) => {
      event.exceptionDates = [];
    });

    if (eventIds.length === 0) return;

    const result = await repos.eventException.loadForEvents(events[0].churchId, eventIds);
    result.forEach((eventException: EventException) => {
      events.forEach((ev) => {
        if (CalendarHelper.eventKey(ev) === eventException.eventId) ev.exceptionDates.push(eventException.exceptionDate);
      });
    });
  }
}
