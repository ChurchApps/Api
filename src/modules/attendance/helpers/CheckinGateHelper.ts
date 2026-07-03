export interface GateGroup {
  id: string;
  name: string;
  capacity?: number;
  guestCapacity?: number;
  checkinClosed: boolean;
  volunteerRatio?: number;
  minVolunteers?: number;
}

export interface GateCount {
  total: number;
  volunteers: number;
  guests: number;
}

export interface GateIncoming {
  total: number;
  volunteers: number;
  guests: number;
  nonVolunteers: number;
}

export interface GateViolation {
  groupId: string;
  groupName: string;
  reason: "capacity" | "ratio";
}

export interface GateResult {
  hard: GateViolation[];
  warnings: GateViolation[];
}

export class CheckinGateHelper {
  static evaluate(params: {
    groups: Record<string, GateGroup>;
    current: Record<string, GateCount>;
    incoming: Record<string, GateIncoming>;
    ratioEnforcement: "block" | "warn";
  }): GateResult {
    const { groups, current, incoming, ratioEnforcement } = params;
    const hard: GateViolation[] = [];
    const warnings: GateViolation[] = [];

    for (const groupId of Object.keys(incoming)) {
      const g = groups[groupId];
      if (!g) continue; // no config for this group => no gate
      const cur = current[groupId] ?? { total: 0, volunteers: 0, guests: 0 };
      const inc = incoming[groupId];

      let capacityViolated = false;
      if (g.checkinClosed) capacityViolated = true;
      else if (g.capacity != null && cur.total + inc.total > g.capacity) capacityViolated = true;
      else if (g.guestCapacity != null && cur.guests + inc.guests > g.guestCapacity) capacityViolated = true;

      if (capacityViolated) {
        hard.push({ groupId, groupName: g.name, reason: "capacity" });
        continue; // one violation per group is enough to reject the batch
      }

      if (inc.nonVolunteers > 0) {
        const volunteers = cur.volunteers + inc.volunteers;
        const children = cur.total - cur.volunteers + inc.nonVolunteers;
        let ratioViolated = false;
        if (g.minVolunteers != null && g.minVolunteers > 0 && volunteers < g.minVolunteers) {
          ratioViolated = true;
        } else if (g.volunteerRatio != null && g.volunteerRatio > 0) {
          if (volunteers === 0) ratioViolated = true;
          else if (children > volunteers * g.volunteerRatio) ratioViolated = true;
        }
        if (ratioViolated) {
          const v: GateViolation = { groupId, groupName: g.name, reason: "ratio" };
          if (ratioEnforcement === "block") hard.push(v);
          else warnings.push(v);
        }
      }
    }

    return { hard, warnings };
  }
}
