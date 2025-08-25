import { BasePermissions } from "@churchapps/apihelper";

/**
 * Consolidated permissions for all modules in the monolith
 * Combines permission definitions from all original microservices
 */
export class Permissions extends BasePermissions {
  // Membership API permissions
  static groups = {
    edit: { contentType: "Groups", action: "Edit" }
  };

  static groupMembers = {
    view: { contentType: "Group Members", action: "View" },
    edit: { contentType: "Group Members", action: "Edit" }
  };

  static people = {
    view: { contentType: "People", action: "View" },
    viewMembers: { contentType: "People", action: "View Members" },
    edit: { contentType: "People", action: "Edit" },
    editSelf: { contentType: "People", action: "Edit Self" }
  };

  static forms = {
    admin: { contentType: "Forms", action: "Admin" },
    edit: { contentType: "Forms", action: "Edit" }
  };

  static plans = {
    edit: { contentType: "Plans", action: "Edit" }
  };

  static roles = {
    edit: { contentType: "Roles", action: "Edit" },
    view: { contentType: "Roles", action: "View" }
  };

  static server = {
    admin: { contentType: "Server", action: "Admin" }
  };

  // Attendance API permissions
  static attendance = {
    view: { contentType: "Attendance", action: "View" },
    viewSummary: { contentType: "Attendance", action: "View Summary" },
    edit: { contentType: "Attendance", action: "Edit" },
    checkin: { contentType: "Attendance", action: "Checkin" }
  };

  static services = {
    edit: { contentType: "Services", action: "Edit" }
  };

  // Giving API permissions
  static donations = {
    viewSummary: { contentType: "Donations", action: "View Summary" },
    edit: { contentType: "Donations", action: "Edit" },
    view: { contentType: "Donations", action: "View" }
  };

  static settings = {
    edit: { contentType: "Settings", action: "Edit" },
    view: { contentType: "Settings", action: "View" }
  };

  // Content API permissions
  static content = {
    edit: { contentType: "Content", action: "Edit" }
  };

  static streamingServices = {
    edit: { contentType: "StreamingServices", action: "Edit" }
  };

  static chat = {
    host: { contentType: "Chat", action: "Host" }
  };

  // Messaging API permissions (to be defined during migration)
  static messaging = {
    view: { contentType: "Messaging", action: "View" },
    edit: { contentType: "Messaging", action: "Edit" },
    admin: { contentType: "Messaging", action: "Admin" }
  };

  // Doing API permissions (to be defined during migration)
  static doing = {
    view: { contentType: "Doing", action: "View" },
    edit: { contentType: "Doing", action: "Edit" },
    admin: { contentType: "Doing", action: "Admin" }
  };

  // General admin permissions
  static admin = {
    editSettings: { contentType: "Admin", action: "Edit Settings" }
  };
}

/**
 * Complete permissions list for all modules
 * This consolidates the permissions from all original microservices
 */
export const permissionsList: IPermission[] = [
  // Attendance API permissions
  {
    apiName: "AttendanceApi",
    section: "Attendance",
    action: "Checkin",
    displaySection: "Attendance",
    displayAction: "Checkin"
  },
  {
    apiName: "AttendanceApi",
    section: "Attendance",
    action: "Edit",
    displaySection: "Attendance",
    displayAction: "Edit Attendance"
  },
  {
    apiName: "AttendanceApi",
    section: "Services",
    action: "Edit",
    displaySection: "Attendance",
    displayAction: "Edit Services"
  },
  {
    apiName: "AttendanceApi",
    section: "Attendance",
    action: "View",
    displaySection: "Attendance",
    displayAction: "View Attendance"
  },
  {
    apiName: "AttendanceApi",
    section: "Attendance",
    action: "View Summary",
    displaySection: "Attendance",
    displayAction: "View Attendance Summary"
  },

  // Giving API permissions
  {
    apiName: "GivingApi",
    section: "Donations",
    action: "Edit",
    displaySection: "Donations",
    displayAction: "Edit Donations"
  },
  {
    apiName: "GivingApi",
    section: "Settings",
    action: "Edit",
    displaySection: "Donations",
    displayAction: "Edit Settings"
  },
  {
    apiName: "GivingApi",
    section: "Donations",
    action: "View Summary",
    displaySection: "Donations",
    displayAction: "View Donation Summaries"
  },
  {
    apiName: "GivingApi",
    section: "Donations",
    action: "View",
    displaySection: "Donations",
    displayAction: "View Donations"
  },

  // Membership API permissions
  {
    apiName: "MembershipApi",
    section: "Forms",
    action: "Admin",
    displaySection: "Forms and Plans",
    displayAction: "Form Admin"
  },
  {
    apiName: "MembershipApi",
    section: "Forms",
    action: "Edit",
    displaySection: "Forms and Plans",
    displayAction: "Edit Forms"
  },
  {
    apiName: "MembershipApi",
    section: "Plans",
    action: "Edit",
    displaySection: "Forms and Plans",
    displayAction: "Edit Plans"
  },
  {
    apiName: "MembershipApi",
    section: "Group Members",
    action: "Edit",
    displaySection: "People and Groups",
    displayAction: "Edit Group Members"
  },
  {
    apiName: "MembershipApi",
    section: "Groups",
    action: "Edit",
    displaySection: "People and Groups",
    displayAction: "Edit Groups"
  },
  {
    apiName: "MembershipApi",
    section: "Households",
    action: "Edit",
    displaySection: "People and Groups",
    displayAction: "Edit Households"
  },
  {
    apiName: "MembershipApi",
    section: "People",
    action: "Edit",
    displaySection: "People and Groups",
    displayAction: "Edit People"
  },
  {
    apiName: "MembershipApi",
    section: "People",
    action: "Edit Self",
    displaySection: "People and Groups",
    displayAction: "Edit Self"
  },
  {
    apiName: "MembershipApi",
    section: "Roles",
    action: "Edit",
    displaySection: "People and Groups",
    displayAction: "Edit Roles and Users"
  },
  {
    apiName: "MembershipApi",
    section: "Group Members",
    action: "View",
    displaySection: "People and Groups",
    displayAction: "View Group Members"
  },
  {
    apiName: "MembershipApi",
    section: "People",
    action: "View Members",
    displaySection: "People and Groups",
    displayAction: "View Members Only"
  },
  {
    apiName: "MembershipApi",
    section: "People",
    action: "View",
    displaySection: "People and Groups",
    displayAction: "View People"
  },
  {
    apiName: "MembershipApi",
    section: "Roles",
    action: "View",
    displaySection: "People and Groups",
    displayAction: "View Roles and Users"
  },
  {
    apiName: "MembershipApi",
    section: "Settings",
    action: "Edit",
    displaySection: "Content",
    displayAction: "Edit Church Settings"
  },

  // Content API permissions
  {
    apiName: "ContentApi",
    section: "Content",
    action: "Edit",
    displaySection: "Content",
    displayAction: "Edit Content"
  },
  {
    apiName: "ContentApi",
    section: "Settings",
    action: "Edit",
    displaySection: "Content",
    displayAction: "Edit Settings"
  },
  {
    apiName: "ContentApi",
    section: "StreamingServices",
    action: "Edit",
    displaySection: "Content",
    displayAction: "Edit Services"
  },
  {
    apiName: "ContentApi",
    section: "Chat",
    action: "Host",
    displaySection: "Content",
    displayAction: "Host Chat"
  },

  // Lessons API permissions
  {
    apiName: "LessonsApi",
    section: "Schedules",
    action: "Edit",
    displaySection: "Lessons",
    displayAction: "Edit Schedules"
  },
  {
    apiName: "LessonsApi",
    section: "Content",
    action: "Edit",
    displaySection: "Lessons",
    displayAction: "Edit Content"
  }
];

export interface IPermission {
  apiName: ApiName;
  section: ContentType;
  action: Actions;
  displaySection: DisplaySection;
  displayAction: string;
}

export type ApiName = "MembershipApi" | "GivingApi" | "AttendanceApi" | "MessagingApi" | "DoingApi" | "ContentApi" | "LessonsApi";

export type DisplaySection = "People and Groups" | "Donations" | "Attendance" | "Forms and Plans" | "Content" | "Lessons";

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
  | "Doing"
  | "Admin"
  | "Schedules";

export type Actions = "Admin" | "Edit" | "View" | "Edit Self" | "View Members" | "View Summary" | "Checkin" | "Host" | "Edit Settings";
