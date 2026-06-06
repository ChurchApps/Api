export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  steps: { name: string; expectedResponseDays?: number }[];
}

// Starter templates offered when creating a new workflow.
export class WorkflowTemplates {
  public static readonly all: WorkflowTemplate[] = [
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
