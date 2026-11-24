// Other modules' repos, reached at runtime through RepoManager.getRepos. Module boundaries keep their
// classes out of reach here, so these interfaces list only the members and columns messaging uses.

export interface ForeignPersonRow {
  id?: string;
  churchId?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  mobilePhone?: string;
  optedOut?: boolean | number;
  smsOptedOut?: boolean | number;
  donorNumber?: string;
}

export interface ForeignChurchRow {
  name?: string;
  subDomain?: string;
  registrationDate?: Date | string;
  city?: string;
  state?: string;
  country?: string;
}

export interface ForeignUserRow {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ForeignGroupMemberRow {
  id?: string;
  personId?: string;
  groupId?: string;
  displayName?: string;
  email?: string;
  mobilePhone?: string;
  optedOut?: boolean;
  person?: { name?: { display?: string } };
}

export interface MembershipRepos {
  person: {
    loadByIds(churchId: string, ids: string[]): Promise<ForeignPersonRow[]>;
    loadByIdsOnly(ids: string[]): Promise<ForeignPersonRow[]>;
    loadIdsByMobileDigits(churchId: string, digits: string): Promise<string[]>;
    updateSmsOptedOut(churchId: string, personId: string, smsOptedOut: boolean): Promise<unknown>;
  };
  church: {
    load(churchId: string, id: string): Promise<ForeignChurchRow | null | undefined>;
    loadById(id: string): Promise<ForeignChurchRow | null | undefined>;
  };
  user: { load(id: string): Promise<ForeignUserRow | null | undefined> };
  groupMember: { loadForGroup(churchId: string, groupId: string): Promise<ForeignGroupMemberRow[]> };
  loginAttempt: {
    loadCount(attemptKey: string, windowSeconds: number): Promise<number>;
    increment(attemptKey: string, windowSeconds: number): Promise<void>;
  };
}

export interface ForeignEventRow {
  id?: string;
  churchId?: string;
  groupId?: string;
  title?: string;
  start: Date;
  end: Date;
  recurrenceRule?: string;
  registrationEnabled?: boolean;
  exceptionDates?: Date[];
}

export interface ForeignRegistrationRow {
  id?: string;
  personId?: string;
  status?: string;
}

export interface ForeignRegistrationMemberRow {
  personId?: string;
  registrationId?: string;
}

export interface ContentRepos {
  event: { load(churchId: string, id: string): Promise<ForeignEventRow | undefined> };
  eventException: { loadForEvents(churchId: string, eventIds: string[]): Promise<{ exceptionDate?: Date }[]> };
  registration: { loadForEvent(churchId: string, eventId: string): Promise<ForeignRegistrationRow[]> };
  registrationMember: { loadForEvent(churchId: string, eventId: string): Promise<ForeignRegistrationMemberRow[]> };
}

export interface ForeignPlanRow {
  id?: string;
  churchId?: string;
  ministryId?: string;
  name?: string;
  serviceDate?: Date;
}

export interface ForeignTaskRow {
  id?: string;
  churchId?: string;
  title?: string;
  dueDate?: Date;
  assignedToType?: string;
  assignedToId?: string;
}

export interface DoingRepos {
  plan: {
    load(churchId: string, id: string): Promise<ForeignPlanRow | undefined>;
    loadByPlanTypeIdInRange(churchId: string, planTypeId: string, from: Date, to: Date): Promise<ForeignPlanRow[]>;
  };
  assignment: { loadForReminder(churchId: string, planId: string): Promise<{ personId?: string }[]> };
  task: { load(churchId: string, id: string): Promise<ForeignTaskRow | undefined> };
}
