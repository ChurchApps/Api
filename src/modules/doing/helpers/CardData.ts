import { EventContext } from "./EventContext.js";

export interface HistoryEntry {
  date: string;
  message: string;
}

export interface ActionCursor {
  stepId: string;
  index: number;
}

// The serving request a confirmation card is about (task.data.assignment).
export interface AssignmentContext {
  planId?: string;
  positionId?: string;
  personId?: string;
  planName?: string;
  positionName?: string;
  serviceDate?: string;
}

// The JSON kept in a card's task.data. Other keys may be present, so unknown ones pass through.
export interface CardData {
  entryPending?: boolean;
  appAlertAttempted?: boolean;
  humanFollowupCompletedAt?: string;
  assignmentOutcome?: string;
  actionCursor?: ActionCursor;
  actionAttempts?: Record<string, string>;
  assignment?: AssignmentContext;
  history?: HistoryEntry[];
  event?: EventContext;
  [key: string]: unknown;
}

// A workflow step action's parsed config JSON; which keys apply depends on the action type.
export interface StepActionConfig {
  days?: number | string;
  dueDays?: number | string;
  note?: string;
  url?: string;
  templateId?: string;
  subject?: string;
  message?: string;
  channel?: string;
  groupId?: string;
  groupLabel?: string;
  workflowId?: string;
  workflowLabel?: string;
  stepId?: string;
  field?: string;
  value?: string;
  title?: string;
  description?: string;
  assignedToType?: string;
  assignedToId?: string;
  assignedToLabel?: string;
  personId?: string;
  personLabel?: string;
}
