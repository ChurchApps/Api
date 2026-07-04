import type {
  AccessLog, Answer, ApiKey, AssociatedGroup, AuditLog, Batch, Campus, Church, ClientError, Domain, Form,
  FormSubmission, Group, GroupJoinRequest, GroupMember, GroupMemberHistory, Household, List, ListMember, MemberPermission,
  HouseholdPickupPerson,
  OAuthClient, OAuthCode, OAuthDeviceCode, OAuthRelaySession, OAuthToken,
  PersonField, PersonFieldValue,
  Question, Role, RoleMember, RolePermission, Setting, Site, User, UserChurch,
  VisibilityPreference, Webhook, WebhookDelivery
} from "../models/index.js";

/** people table flattens name/contact into columns; rowToModel() restores Person shape. */
export interface PeopleTable {
  id?: string;
  churchId?: string;
  displayName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  nickName?: string;
  prefix?: string;
  suffix?: string;
  birthDate?: Date;
  gender?: string;
  maritalStatus?: string;
  anniversary?: Date;
  membershipStatus?: string;
  grade?: string;
  school?: string;
  homePhone?: string;
  mobilePhone?: string;
  workPhone?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  photoUpdated?: Date;
  householdId?: string;
  householdRole?: string;
  campusId?: string;
  conversationId?: string;
  optedOut?: boolean;
  nametagNotes?: string;
  donorNumber?: string;
  importKey?: string;
  removed?: boolean;
}

export interface MembershipDatabase {
  accessLogs: AccessLog;
  answers: Answer;
  apiKeys: ApiKey;
  associatedGroups: AssociatedGroup;
  auditLogs: AuditLog;
  batches: Batch;
  campuses: Campus;
  churches: Omit<Church, "settings">;
  clientErrors: ClientError;
  domains: Domain;
  forms: Omit<Form, "action" | "questions"> & { removed?: boolean; archived?: boolean };
  formSubmissions: Omit<FormSubmission, "form" | "questions" | "answers">;
  groups: Omit<Group, "labelArray" | "memberCount"> & { removed?: boolean };
  groupMembers: Omit<GroupMember, "person" | "group">;
  groupMemberHistory: GroupMemberHistory;
  groupJoinRequests: Omit<GroupJoinRequest, "person" | "group">;
  households: Household;
  householdPickupPeople: HouseholdPickupPerson;
  lists: Omit<List, "conditions" | "createdByPersonName" | "rules" | "actions" | "autoRefresh" | "notifyOnChange"> & {
    conditions: string;
    rules?: string;
    actions?: string;
    autoRefresh?: number;
    notifyOnChange?: number;
    dateCreated?: Date;
    dateModified?: Date;
  };
  listMembers: ListMember;
  memberPermissions: Omit<MemberPermission, "personName" | "formName">;
  oAuthClients: OAuthClient;
  oAuthCodes: OAuthCode;
  oAuthDeviceCodes: OAuthDeviceCode;
  oAuthRelaySessions: OAuthRelaySession;
  oAuthTokens: OAuthToken;
  people: PeopleTable;
  personFields: PersonField;
  personFieldValues: PersonFieldValue;
  questions: Question & { removed?: boolean };
  roles: Role;
  roleMembers: Omit<RoleMember, "user">;
  rolePermissions: RolePermission;
  settings: Setting;
  sites: Site;
  users: Omit<User, "jwt"> & { password?: string };
  userChurches: UserChurch;
  visibilityPreferences: VisibilityPreference;
  webhooks: Omit<Webhook, "events" | "active"> & { events: string; active: number };
  webhookDeliveries: WebhookDelivery;
}
