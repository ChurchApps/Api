// Hand-curated request/response examples for the highest-traffic routes. The
// describe_endpoint MCP tool returns these so the LLM can build correct
// payloads without an OpenAPI spec. For un-curated routes, describe_endpoint
// falls back to "call GET first to see the shape".

export interface EndpointGuidance {
  humanPurpose?: string;
  useWhen?: string[];
  doNotUseWhen?: string[];
  requiredDiscovery?: string[];
  importantFields?: Record<string, string>;
  companionCheck?: string[];
  safeWrite?: string[];
  verifyAfter?: string[];
  relatedEndpoints?: string[];
}

export interface EndpointExample {
  summary: string;
  requestBody?: any;
  responseSample?: any;
  notes?: string;
  guidance?: EndpointGuidance;
}

export const EXAMPLES: Record<string, EndpointExample> = {
  "GET /membership/people": {
    summary: "List people in the current church. Supports ?firstName=, ?lastName=, ?email= filters.",
    responseSample: [{ id: "abc123", firstName: "Jane", lastName: "Doe", contactInfo: { email: "jane@example.com" } }]
  },
  "GET /membership/people/:id": {
    summary: "Get a single person by id.",
    responseSample: { id: "abc123", firstName: "Jane", lastName: "Doe", householdId: "hh1" }
  },
  "POST /membership/people": {
    summary: "Create or update people. Submit an array; missing id = create, present id = update.",
    requestBody: [{ firstName: "Jane", lastName: "Doe", contactInfo: { email: "jane@example.com", mobilePhone: "555-1234" } }]
  },
  "POST /membership/people/search": {
    summary: "Search people by SearchCondition array (field/operator/value).",
    requestBody: [{ field: "lastName", operator: "contains", value: "Smith" }]
  },

  "GET /membership/groups": {
    summary: "List all groups. Mixes People Groups, Ministries, and Teams — prefer GET /membership/groups/tag/:tag to filter.",
    responseSample: [
      { id: "g1", name: "Wednesday Bible Study", categoryName: "Adults", tags: "standard" },
      { id: "m1", name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" },
      { id: "t1", name: "Cubbies", categoryName: "m1", tags: "team" }
    ],
    notes: "One table, three record types via tags: 'standard' (People Group / community roster), 'ministry' (Serving Ministry), 'team' (volunteer unit under a Ministry). categoryName is a human Group Category for standard, typically 'Ministry' for ministries, and the parent Ministry id for teams. Discover with /tag/:tag before creating.",
    guidance: {
      humanPurpose: "Use this as the discovery inventory before creating or attaching a Group-like record. Similar names can correctly represent different record types.",
      importantFields: {
        tags: "The record type. Inspect tags rather than inferring type from the name or categoryName.",
        categoryName: "For standard People Groups, a readable Group category. For Teams, the ID of the parent Serving Ministry.",
        name: "A name is not a type. For example, Cubbies can correctly exist as both a Team and a People Group."
      },
      safeWrite: ["Check for a matching Ministry before creating a Ministry or Team.", "Check for a matching standard People Group and an appropriate Group Category before creating a People Group."],
      relatedEndpoints: ["GET /membership/groups/tag/:tag", "POST /membership/groups"]
    }
  },
  "GET /membership/groups/tag/:tag": {
    summary: "List groups filtered by tag. Use tag=standard|ministry|team.",
    responseSample: [{ id: "m1", name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" }],
    notes: "Preferred discovery before any Groups write. Call tag=ministry before creating a Team; tag=standard before creating a People Group. The same display name can correctly exist as Ministry, Team, Category, and Group — reuse rather than duplicate.",
    guidance: {
      importantFields: {
        standard: "People → Groups: the community connected to an activity, including participants, parents when appropriate, volunteers, and selected Group Leaders.",
        ministry: "Serving → Plans: a service-planning area that can contain multiple Teams.",
        team: "Serving → Plans: a schedulable volunteer or staff roster. categoryName identifies its parent Ministry by ID."
      },
      safeWrite: ["For a new Team, find the appropriate existing Ministry before creating another Ministry.", "For an event groupId, find a standard People Group — never a Ministry or Team."],
      relatedEndpoints: ["POST /membership/groups", "POST /content/events"]
    }
  },
  "GET /membership/groups/:id": {
    summary: "Get one People Group, Serving Ministry, or Serving Team by ID before attaching members, events, or related records.",
    responseSample: { id: "g1", name: "Cubbies", tags: "standard", categoryName: "Awana" },
    guidance: {
      humanPurpose: "Use this preflight read when a write depends on the target record's type or relationship.",
      safeWrite: ["Inspect tags before changing memberships or using the record as an event groupId.", "For a Team, confirm categoryName matches the intended parent Ministry ID."],
      relatedEndpoints: ["POST /membership/groupmembers", "POST /content/events"]
    }
  },
  "POST /membership/groups": {
    summary: "Create or update groups. tags selects the record type.",
    requestBody: [
      { name: "Cubbies", categoryName: "Awana", tags: "standard", trackAttendance: true },
      { name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" },
      { name: "Cubbies", categoryName: "m1", tags: "team" }
    ],
    notes: "Set tags to 'standard', 'ministry', or 'team'. For teams, categoryName MUST be the parent Ministry id. For ministries, categoryName is typically 'Ministry'. For standard groups, categoryName is a human Group Category label — reuse an existing category when appropriate. Prefer GET /membership/groups/tag/:tag first. Deleting a ministry cascades delete of teams whose categoryName equals that ministry id. Do not auto-create both a Team and a People Group for the same activity.",
    guidance: {
      humanPurpose: "Choose the record according to the people and work it organizes: a Ministry organizes service planning, a Team is the volunteer or staff roster, and a standard People Group is the community connected to an activity.",
      useWhen: ["Create a standard People Group for communication, Group calendar/events, attendance, check-in, participants, parents when appropriate, volunteers, and Group Leaders.", "Create a Ministry for a distinct service-planning area only when no appropriate Ministry already exists.", "Create a Team when a Ministry needs a distinct roster of volunteers or staff to schedule."],
      doNotUseWhen: ["Do not create a Ministry simply because a People Group has a ministry-like name.", "Do not create a Team for participants or parents merely because they attend an activity.", "Do not use a People Group Category to parent a Serving Team."],
      requiredDiscovery: ["List existing Groups first and compare name, tags, and categoryName.", "Reuse an appropriate existing Ministry for a new Team where possible.", "Reuse an appropriate existing Group Category when creating a standard People Group."],
      companionCheck: ["A new Team may also need a People Group if the people involved need Group communication, a Group calendar/events, attendance, or Group Leaders.", "A new People Group may also need a Team if it needs a distinct, schedulable volunteer roster.", "Do not create both automatically. Ask when the counterpart decision materially changes the result."],
      importantFields: {
        "tags=standard": "Creates a People Group. categoryName is a readable Group Category such as Awana.",
        "tags=ministry": "Creates a Serving Ministry. It is a parent for Teams and appears in Serving → Plans.",
        "tags=team": "Creates a Serving Team. categoryName must be the ID of its parent Ministry.",
        name: "May intentionally match a related Group or Team, but never determines the record type by itself."
      },
      verifyAfter: ["Retrieve the saved record and confirm its tags and categoryName relationship.", "For a Team, confirm categoryName matches the intended Ministry ID.", "For a standard People Group, confirm it appears under the intended Group Category."],
      relatedEndpoints: ["GET /membership/groups", "GET /membership/groups/:id", "POST /membership/groupmembers"]
    }
  },

  "GET /membership/groupmembers": {
    summary: "List members of a group: ?groupId=g1",
    responseSample: [{ id: "gm1", groupId: "g1", personId: "abc123", leader: false }],
    notes: "Works for standard groups, ministries, and teams. Confirm the target group's tags first so membership lands on the correct record type."
  },
  "POST /membership/groupmembers": {
    summary: "Add or update group memberships. leader marks Group Leaders.",
    requestBody: [{ groupId: "g1", personId: "abc123", leader: false }],
    notes: "leader:true sets Group Leader on that membership. Apply membership to the correct record type (standard vs ministry vs team) — Team membership is not the same as community People Group membership. An activity may need both; create/link them deliberately.",
    guidance: {
      humanPurpose: "Membership is not interchangeable across People Groups, Ministries, and Teams. Add a person everywhere they need the corresponding connection or capability.",
      importantFields: {
        groupId: "Retrieve the target record and inspect tags before writing. The record type determines the meaning of the membership.",
        "leader=true": "Use for selected People Group Leaders who administer the Group's calendar, events, and community. It is not a label for every volunteer."
      },
      safeWrite: ["Add volunteers or staff to a Team when they should be scheduled for that role.", "Add a person to a Ministry when they need that Ministry's service-planning responsibility.", "Add participants, parents when appropriate, volunteers, and selected Group Leaders to a standard People Group when they belong to its community.", "Do not assume a membership in one record creates the other needed memberships."],
      verifyAfter: ["Read the target membership list and confirm the person has the intended role in the intended record."],
      relatedEndpoints: ["GET /membership/groups/:id", "POST /membership/groups"]
    }
  },
  "GET /content/events/group/:groupId": {
    summary: "List events for a group.",
    responseSample: [{ id: "e1", groupId: "g1", title: "Bible Study", start: "2026-09-02T18:00:00.000Z", end: "2026-09-02T19:30:00.000Z" }],
    notes: "Pass a standard People Group id. Use after POST /content/events to verify the event landed on the intended group."
  },

  "GET /attendance/attendance": {
    summary: "Attendance records. Use query params like ?campusId=, ?serviceId=, ?serviceTimeId=.",
    responseSample: [{ id: "a1", personId: "abc123", visitDate: "2026-05-17" }]
  },
  "POST /attendance/visits": {
    summary: "Record a visit (check-in). Submit an array of Visit objects.",
    requestBody: [{ personId: "abc123", serviceId: "svc1", visitDate: "2026-05-17", visitSessions: [{ sessionId: "ses1" }] }]
  },

  "GET /giving/donations": {
    summary: "List donations in the current church. Filter via ?personId=, ?batchId=, ?startDate=, ?endDate=.",
    responseSample: [{ id: "d1", personId: "abc123", amount: 100, donationDate: "2026-05-01", method: "Cash" }]
  },
  "POST /giving/donations": {
    summary: "Create or update donations.",
    requestBody: [{ personId: "abc123", amount: 100, donationDate: "2026-05-01", method: "Cash", fundDonations: [{ fundId: "f1", amount: 100 }] }]
  },
  "GET /giving/funds": {
    summary: "List funds (donation designations).",
    responseSample: [{ id: "f1", name: "General Fund" }]
  },

  "GET /content/pages/:churchId/tree": {
    summary: "Load a fully populated page tree (sections + nested elements) for display. Pass ?url=/about or ?id=<pageId>. Returns parsed answers/styles/animations objects (not JSON strings).",
    notes: "Use this to verify a page after creating it, or to read the current structure before editing."
  },
  "POST /content/events": {
    summary: "Create or update calendar events. When groupId is set, it identifies the People Group community that owns the event.",
    requestBody: [{ title: "Cubbies", groupId: "g1", start: "2026-09-09T18:15:00", end: "2026-09-09T19:30:00" }],
    notes: "groupId MUST reference a standard People Group (tags contains 'standard'), never a Ministry or Team. Reminders, RSVPs, and mobile deep-links treat groupId as a People Group membership graph.",
    guidance: {
      humanPurpose: "A Group event belongs to the community being informed, attending, or led. Volunteer scheduling belongs in Serving plans and Teams.",
      requiredDiscovery: ["If groupId is supplied, retrieve that record first and verify tags includes standard.", "If the request is for volunteer scheduling, identify the relevant Ministry and Team instead of using them as the event groupId."],
      doNotUseWhen: ["Do not use a Serving Ministry or Team ID as groupId.", "Do not create a new People Group solely to attach an event before checking for an appropriate existing Group."],
      verifyAfter: ["Read the event back and verify groupId is the intended standard People Group."],
      relatedEndpoints: ["GET /membership/groups/:id", "GET /membership/groups/tag/:tag", "POST /membership/groups"]
    }
  },
  "POST /content/pages": {
    summary: "Create or update pages. Submit an array; omit id to create, include id to update.",
    requestBody: [{ url: "/about", title: "About Us" }],
    notes: "churchId is auto-set from auth. For building page content (sections, elements, HTML blocks, etc.) call describe_page_builder for the full data model and elementType catalog."
  },
  "POST /content/sections": {
    summary: "Create or update sections (children of a page or block).",
    requestBody: [{ pageId: "P1", zone: "main", background: "#ffffff", textColor: "dark", sort: 1 }],
    notes: "Provide pageId OR blockId, not both. zone is typically 'main' (page body) or 'siteFooter'."
  },
  "POST /content/elements": {
    summary: "Create or update elements inside a section (or a block, or as a child of another element).",
    requestBody: [{ sectionId: "S1", elementType: "rawHTML", sort: 1, answersJSON: "{\"rawHTML\":\"<h1>Hello</h1>\",\"javascript\":\"\"}" }],
    notes: "Call describe_page_builder for the full elementType catalog (text, image, video, rawHTML, row, etc.) and the answers shape for each. answersJSON must be a JSON STRING on write. For nested children (inside a row column or carousel slide) set parentId to the auto-created child's id. Never POST elementType:'column' yourself — rows create columns automatically."
  },
  "POST /content/blocks": {
    summary: "Create or update reusable blocks (sectionBlock, footerBlock, elementBlock).",
    requestBody: [{ blockType: "sectionBlock", name: "Reusable Hero" }],
    notes: "After saving the block, add Sections with blockId=<this block's id>, then Elements inside those Sections. Reference the block from a Section via targetBlockId, or from an Element via elementType:'block' with answersJSON:'{\"blockId\":\"...\"}'."
  }
};

export function lookupExample(method: string, path: string): EndpointExample | undefined {
  return EXAMPLES[method.toUpperCase() + " " + path];
}
