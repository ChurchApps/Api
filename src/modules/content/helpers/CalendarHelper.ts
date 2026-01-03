import { Event, EventException } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";

export class CalendarHelper {
  public static async addExceptionDates(events: Event[], repos?: Repos) {
    if (events.length === 0) return;

    // Get repos if not provided
    if (!repos) {
      repos = await RepoManager.getRepos<Repos>("content");
    }

    const eventIds = events.map((event) => event.id);
    events.forEach((event) => {
      event.exceptionDates = [];
    });

    const result = await repos.eventException.loadForEvents(events[0].churchId, eventIds);
    result.forEach((eventException: EventException) => {
      const event = events.find((ev) => ev.id === eventException.eventId);
      if (event) event.exceptionDates.push(eventException.exceptionDate);
    });
  }
}
