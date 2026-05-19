import { ALL_WEBHOOK_EVENTS } from "./WebhookEvents.js";

// Representative sample `data` payloads for each webhook event, used by the
// "Send test event" feature so an integrator can verify connectivity and
// signature handling before real data flows. Values are obviously fake.
const SAMPLES: Record<string, (churchId: string) => any> = {
  "person.created": (churchId) => ({ id: "smpl_person", churchId, name: { display: "Sample Person", first: "Sample", last: "Person" }, contactInfo: { email: "sample@example.com" } }),
  "person.updated": (churchId) => ({ id: "smpl_person", churchId, name: { display: "Sample Person", first: "Sample", last: "Person" }, contactInfo: { email: "sample@example.com" } }),
  "person.destroyed": (churchId) => ({ id: "smpl_person", churchId }),

  "group.created": (churchId) => ({ id: "smpl_group", churchId, name: "Sample Group", categoryName: "Sample Category" }),
  "group.updated": (churchId) => ({ id: "smpl_group", churchId, name: "Sample Group", categoryName: "Sample Category" }),
  "group.destroyed": (churchId) => ({ id: "smpl_group", churchId }),

  "group.member.added": (churchId) => ({ id: "smpl_groupmember", churchId, groupId: "smpl_group", personId: "smpl_person" }),
  "group.member.removed": (churchId) => ({ id: "smpl_groupmember", churchId, groupId: "smpl_group", personId: "smpl_person" }),

  "household.created": (churchId) => ({ id: "smpl_household", churchId, name: "Sample Household" }),
  "household.updated": (churchId) => ({ id: "smpl_household", churchId, name: "Sample Household" }),
  "household.destroyed": (churchId) => ({ id: "smpl_household", churchId }),

  "donation.created": (churchId) => ({ id: "smpl_donation", churchId, personId: "smpl_person", batchId: "smpl_batch", donationDate: new Date().toISOString(), amount: 50, currency: "USD", method: "card", status: "complete" }),
  "donation.updated": (churchId) => ({ id: "smpl_donation", churchId, personId: "smpl_person", batchId: "smpl_batch", donationDate: new Date().toISOString(), amount: 50, currency: "USD", method: "card", status: "complete" }),

  "attendance.recorded": (churchId) => ({ id: "smpl_visit", churchId, personId: "smpl_person", visitDate: new Date().toISOString(), checkinTime: new Date().toISOString() }),

  "session.created": (churchId) => ({ id: "smpl_session", churchId, groupId: "smpl_group", serviceTimeId: "smpl_servicetime", sessionDate: new Date().toISOString() }),

  "form.submission.created": (churchId) => ({ id: "smpl_formsubmission", churchId, formId: "smpl_form", contentType: "person", contentId: "smpl_person" }),

  "event.created": (churchId) => ({ id: "smpl_event", churchId, groupId: "smpl_group", title: "Sample Event", start: new Date().toISOString(), end: new Date().toISOString() }),
  "event.updated": (churchId) => ({ id: "smpl_event", churchId, groupId: "smpl_group", title: "Sample Event", start: new Date().toISOString(), end: new Date().toISOString() }),
  "event.destroyed": (churchId) => ({ id: "smpl_event", churchId })
};

// Builds a sample `data` object for an event. Falls back to a minimal shape so a
// newly added event without an explicit sample still produces a usable test.
export const samplePayloadFor = (event: string, churchId: string): any => {
  return (SAMPLES[event] ?? ((cid: string) => ({ id: "smpl_sample", churchId: cid })))(churchId);
};

// Every catalog event must have an explicit sample — asserted by a unit test.
export const hasSamplePayload = (event: string): boolean => event in SAMPLES;

export const SAMPLE_PAYLOAD_EVENTS: string[] = ALL_WEBHOOK_EVENTS.filter((e) => e in SAMPLES);
