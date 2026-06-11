import type {
  AccessLog, Answer, ApiKey, AssociatedGroup, AuditLog, Campus, Church, ClientError, Domain, Form,
  FormSubmission, Group, GroupJoinRequest, GroupMember, Household, List, ListMember, MemberPermission,
  OAuthClient, OAuthCode, OAuthDeviceCode, OAuthRelaySession, OAuthToken,
  Question, Role, RoleMember, RolePermission, Setting, User, UserChurch,
  VisibilityPreference, Webhook, WebhookDelivery
} from "../models/index.js";

/**
 * The people table stores flattened name/contact columns rather than
 * the composite Name/ContactInfo objects used in the Person model.
 * rowToModel() in PersonRepo maps these back to the Person model shape.
 */
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
  campuses: Campus;
  churches: Omit<Church, "settings">;
  clientErrors: ClientError;
  domains: Domain;
  forms: Omit<Form, "action" | "questions"> & { removed?: boolean; archived?: boolean };
  formSubmissions: Omit<FormSubmission, "form" | "questions" | "answers">;
  groups: Omit<Group, "labelArray" | "memberCount" | "importKey"> & { removed?: boolean };
  groupMembers: Omit<GroupMember, "person" | "group">;
  groupJoinRequests: Omit<GroupJoinRequest, "person" | "group">;
  households: Household;
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
  questions: Question & { removed?: boolean };
  roles: Role;
  roleMembers: Omit<RoleMember, "user">;
  rolePermissions: RolePermission;
  settings: Setting;
  users: Omit<User, "jwt"> & { password?: string };
  userChurches: UserChurch;
  visibilityPreferences: VisibilityPreference;
  webhooks: Omit<Webhook, "events" | "active"> & { events: string; active: number };
  webhookDeliveries: WebhookDelivery;
}
