import { BasePermissions } from "@churchapps/apihelper";

export class Permissions extends BasePermissions {
  static groups = { edit: { contentType: "Groups", action: "Edit" } };

  static groupMembers = { view: { contentType: "Group Members", action: "View" }, edit: { contentType: "Group Members", action: "Edit" } };

  static people = { view: { contentType: "People", action: "View" }, viewMembers: { contentType: "People", action: "View Members" }, edit: { contentType: "People", action: "Edit" }, editSelf: { contentType: "People", action: "Edit Self" } };

  static forms = { admin: { contentType: "Forms", action: "Admin" }, edit: { contentType: "Forms", action: "Edit" } };

  static plans = { edit: { contentType: "Plans", action: "Edit" } };

  static roles = { edit: { contentType: "Roles", action: "Edit" }, view: { contentType: "Roles", action: "View" } };

  static server = { admin: { contentType: "Server", action: "Admin" } };

  static attendance = { view: { contentType: "Attendance", action: "View" }, viewSummary: { contentType: "Attendance", action: "View Summary" }, edit: { contentType: "Attendance", action: "Edit" }, checkin: { contentType: "Attendance", action: "Checkin" } };

  static services = { edit: { contentType: "Services", action: "Edit" } };

  static donations = { viewSummary: { contentType: "Donations", action: "View Summary" }, edit: { contentType: "Donations", action: "Edit" }, view: { contentType: "Donations", action: "View" } };

  static settings = { edit: { contentType: "Settings", action: "Edit" }, view: { contentType: "Settings", action: "View" } };

  static content = { edit: { contentType: "Content", action: "Edit" } };

  static streamingServices = { edit: { contentType: "StreamingServices", action: "Edit" } };

  static chat = { host: { contentType: "Chat", action: "Host" } };

  static registrations = { view: { contentType: "Registrations", action: "View" }, edit: { contentType: "Registrations", action: "Edit" } };

  static calendars = { admin: { contentType: "Calendars", action: "Admin" } };

  static messaging = { view: { contentType: "Messaging", action: "View" }, edit: { contentType: "Messaging", action: "Edit" }, admin: { contentType: "Messaging", action: "Admin" } };

  static texting = { send: { contentType: "Texting", action: "Send" } };

  static tasks = { view: { contentType: "Tasks", action: "View" }, edit: { contentType: "Tasks", action: "Edit" }, admin: { contentType: "Tasks", action: "Admin" } };

  static admin = { editSettings: { contentType: "Admin", action: "Edit Settings" } };
}

export const permissionsList: IPermission[] = [
  { apiName: "AttendanceApi", section: "Attendance", action: "Checkin", displaySection: "Attendance", displayAction: "Checkin" },
  { apiName: "AttendanceApi", section: "Attendance", action: "Edit", displaySection: "Attendance", displayAction: "Edit Attendance" },
  { apiName: "AttendanceApi", section: "Services", action: "Edit", displaySection: "Attendance", displayAction: "Edit Services" },
  { apiName: "AttendanceApi", section: "Attendance", action: "View", displaySection: "Attendance", displayAction: "View Attendance" },
  { apiName: "AttendanceApi", section: "Attendance", action: "View Summary", displaySection: "Attendance", displayAction: "View Attendance Summary" },

  { apiName: "GivingApi", section: "Donations", action: "Edit", displaySection: "Donations", displayAction: "Edit Donations" },
  { apiName: "GivingApi", section: "Settings", action: "Edit", displaySection: "Donations", displayAction: "Edit Settings" },
  { apiName: "GivingApi", section: "Donations", action: "View Summary", displaySection: "Donations", displayAction: "View Donation Summaries" },
  { apiName: "GivingApi", section: "Donations", action: "View", displaySection: "Donations", displayAction: "View Donations" },

  { apiName: "MembershipApi", section: "Forms", action: "Admin", displaySection: "Forms and Plans", displayAction: "Form Admin" },
  { apiName: "MembershipApi", section: "Forms", action: "Edit", displaySection: "Forms and Plans", displayAction: "Edit Forms" },
  { apiName: "MembershipApi", section: "Group Members", action: "Edit", displaySection: "People and Groups", displayAction: "Edit Group Members" },
  { apiName: "MembershipApi", section: "Groups", action: "Edit", displaySection: "People and Groups", displayAction: "Edit Groups" },
  { apiName: "MembershipApi", section: "Households", action: "Edit", displaySection: "People and Groups", displayAction: "Edit Households" },
  { apiName: "MembershipApi", section: "People", action: "Edit", displaySection: "People and Groups", displayAction: "Edit People" },
  { apiName: "MembershipApi", section: "People", action: "Edit Self", displaySection: "People and Groups", displayAction: "Edit Self" },
  { apiName: "MembershipApi", section: "Roles", action: "Edit", displaySection: "People and Groups", displayAction: "Edit Roles and Users" },
  { apiName: "MembershipApi", section: "Group Members", action: "View", displaySection: "People and Groups", displayAction: "View Group Members" },
  { apiName: "MembershipApi", section: "People", action: "View Members", displaySection: "People and Groups", displayAction: "View Members Only" },
  { apiName: "MembershipApi", section: "People", action: "View", displaySection: "People and Groups", displayAction: "View People" },
  { apiName: "MembershipApi", section: "Roles", action: "View", displaySection: "People and Groups", displayAction: "View Roles and Users" },
  { apiName: "MembershipApi", section: "Settings", action: "Edit", displaySection: "Content", displayAction: "Edit Church Settings" },

  { apiName: "ContentApi", section: "Content", action: "Edit", displaySection: "Content", displayAction: "Edit Content" },
  { apiName: "ContentApi", section: "Settings", action: "Edit", displaySection: "Content", displayAction: "Edit Settings" },
  { apiName: "ContentApi", section: "StreamingServices", action: "Edit", displaySection: "Content", displayAction: "Edit Services" },
  { apiName: "ContentApi", section: "Chat", action: "Host", displaySection: "Content", displayAction: "Host Chat" },
  { apiName: "ContentApi", section: "Registrations", action: "View", displaySection: "Content", displayAction: "View Registrations" },
  { apiName: "ContentApi", section: "Registrations", action: "Edit", displaySection: "Content", displayAction: "Edit Registrations" },
  { apiName: "ContentApi", section: "Calendars", action: "Admin", displaySection: "Content", displayAction: "Resolve Calendar Conflicts & Approvals" },

  { apiName: "MessagingApi", section: "Texting", action: "Send", displaySection: "Messaging", displayAction: "Send Text Messages" },
  { apiName: "MessagingApi", section: "Messaging", action: "Admin", displaySection: "Messaging", displayAction: "Admin" },

  { apiName: "DoingApi", section: "Plans", action: "Edit", displaySection: "Forms and Plans", displayAction: "Edit Plans" },
  { apiName: "DoingApi", section: "Tasks", action: "View", displaySection: "Tasks", displayAction: "View Workflows & Cards" },
  { apiName: "DoingApi", section: "Tasks", action: "Edit", displaySection: "Tasks", displayAction: "Edit All Cards & Tasks" },
  { apiName: "DoingApi", section: "Tasks", action: "Admin", displaySection: "Tasks", displayAction: "Manage Workflows & Automations" },

  { apiName: "LessonsApi", section: "Schedules", action: "Edit", displaySection: "Lessons", displayAction: "Edit Schedules" },
  { apiName: "LessonsApi", section: "Content", action: "Edit", displaySection: "Lessons", displayAction: "Edit Content" }
];

export interface IPermission {
  apiName: ApiName;
  section: ContentType;
  action: Actions;
  displaySection: DisplaySection;
  displayAction: string;
}

export type ApiName = "MembershipApi" | "GivingApi" | "AttendanceApi" | "MessagingApi" | "DoingApi" | "ContentApi" | "LessonsApi";

export type DisplaySection = "People and Groups" | "Donations" | "Attendance" | "Forms and Plans" | "Content" | "Messaging" | "Lessons" | "Tasks";

export type ContentType =
  | "Roles"
  | "Settings"
  | "Links"
  | "Pages"
  | "Services"
  | "StreamingServices"
  | "Forms"
  | "Households"
  | "People"
  | "Plans"
  | "Group Members"
  | "Groups"
  | "Donations"
  | "Attendance"
  | "Chat"
  | "Content"
  | "Domain"
  | "Server"
  | "Messaging"
  | "Tasks"
  | "Admin"
  | "Texting"
  | "Registrations"
  | "Schedules"
  | "Calendars";

export type Actions = "Admin" | "Edit" | "View" | "Send" | "Edit Self" | "View Members" | "View Summary" | "Checkin" | "Host" | "Edit Settings";
