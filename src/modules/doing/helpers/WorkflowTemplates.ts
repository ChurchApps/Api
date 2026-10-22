export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  workflowType?: string;
  steps: { name: string; expectedResponseDays?: number; advance?: boolean; actions?: { actionType: string; config?: Record<string, unknown> }[] }[];
}

// Starter templates offered when creating a new workflow.
export class WorkflowTemplates {
  public static readonly all: WorkflowTemplate[] = [
    {
      key: "assignmentConfirmation",
      name: "Serving Assignment Confirmation",
      workflowType: "assignmentConfirmation",
      description: "Issue a plan's requests, follow up until each person responds, then track a human call. Select this workflow in the plan settings to opt in.",
      steps: [
        {
          name: "Request and wait for response",
          advance: true,
          actions: [
            { actionType: "sendAssignmentRequest", config: { channel: "email" } },
            { actionType: "sendAssignmentRequest", config: { channel: "sms" } },
            { actionType: "delay", config: { days: 2 } },
            { actionType: "sendAssignmentRequest", config: { channel: "email", message: "We are still waiting for your response. Please accept or decline your serving request." } },
            { actionType: "delay", config: { days: 1 } }
          ]
        },
        { name: "Call volunteer about unanswered request", expectedResponseDays: 1 }
      ]
    },
    {
      key: "newVisitor",
      name: "New Visitor Follow-up",
      description: "Welcome and connect first-time guests.",
      steps: [
        { name: "Send welcome email", expectedResponseDays: 1 },
        { name: "Personal phone call", expectedResponseDays: 3 },
        { name: "Invite to next step", expectedResponseDays: 7 },
        { name: "Connected" }
      ]
    },
    {
      key: "membership",
      name: "Membership Class",
      description: "Move attenders toward formal membership.",
      steps: [
        { name: "Express interest", expectedResponseDays: 2 },
        { name: "Register for class", expectedResponseDays: 7 },
        { name: "Attend class" },
        { name: "Complete membership" }
      ]
    },
    {
      key: "firstGift",
      name: "First-time Giver Thank-you",
      description: "Acknowledge and steward first-time givers.",
      steps: [
        { name: "Send thank-you note", expectedResponseDays: 2 },
        { name: "Share giving impact", expectedResponseDays: 14 },
        { name: "Stewarded" }
      ]
    }
  ];

  public static get(key: string): WorkflowTemplate | undefined {
    return this.all.find((t) => t.key === key);
  }
}
