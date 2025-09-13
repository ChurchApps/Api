import { Repositories } from "../repositories";
import { RepositoryManager } from "../../../shared/infrastructure";
import { Position, Assignment, BlockoutDate } from "../models";

interface NeededPosition {
  position: Position;
  needed: number;
  availablePeople: string[];
}

export class PlanHelper {
  static async autofill(
    positions: Position[],
    assignments: Assignment[],
    blockoutDates: BlockoutDate[],
    teams: { positionId: string; personIds: string[] }[],
    lastServed: { personId: string; serviceDate: Date }[],
    repositories?: Repositories
  ) {
    const repos = repositories || (await RepositoryManager.getRepositories<Repositories>("doing"));
    const unavailablePeople = blockoutDates.map((b) => b.personId) || [];
    assignments.forEach((a) => {
      if (unavailablePeople.indexOf(a.personId) === -1) unavailablePeople.push(a.personId);
    });

    const neededPositions: NeededPosition[] = [];
    positions.forEach((p) => {
      const assignedCount = assignments.filter((a) => a.positionId === p.id).length;
      if ((p.count || 0) > assignedCount) {
        const availablePeople = teams.find((t) => t.positionId === p.id)?.personIds.filter((personId) => unavailablePeople.indexOf(personId) === -1) || [];
        neededPositions.push({ position: p, needed: (p.count || 0) - assignedCount, availablePeople });
      }
    });

    this.sortPeople(neededPositions, lastServed);

    const assignements = this.assignPeople(neededPositions);
    if (assignements.length > 0) {
      const promises: Promise<Assignment>[] = [];
      assignements.forEach((assignement) => {
        promises.push(repos.assignment.save(assignement));
      });
      await Promise.all(promises);
    }
  }

  static assignPeople(neededPositions: NeededPosition[]) {
    const result: Assignment[] = [];

    const needed = neededPositions.sort((a, b) => b.needed - b.availablePeople.length - (a.needed - a.availablePeople.length));
    needed.forEach((n) => {
      while (n.needed > 0 && n.availablePeople.length > 0) {
        const personId = n.availablePeople.shift();
        n.needed--;
        result.push({ churchId: n.position.churchId, positionId: n.position.id, personId });
        needed.forEach((m) => {
          m.availablePeople = m.availablePeople.filter((p) => p !== personId);
        });
      }
    });

    return result;
  }

  static sortPeople(neededPositions: NeededPosition[], lastServed: { personId: string; serviceDate: Date }[]) {
    neededPositions.forEach((n) => {
      n.availablePeople = n.availablePeople.sort((a, b) => {
        const aLastServed = lastServed.find((l) => l.personId === a)?.serviceDate || new Date(0);
        const bLastServed = lastServed.find((l) => l.personId === b)?.serviceDate || new Date(0);
        return aLastServed.getTime() - bLastServed.getTime();
      });
    });
  }
}
