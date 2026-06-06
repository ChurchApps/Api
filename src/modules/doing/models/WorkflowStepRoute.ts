export class WorkflowStepRoute {
  public id?: string;
  public churchId?: string;
  public workflowId?: string;
  // Source step this route exits from.
  public stepId?: string;
  // Evaluation order among a step's routes; first match wins.
  public sort?: number;
  // "onEnter" = evaluated automatically when a card enters the step.
  // "onComplete" = presented to the user as an outcome button when completing.
  public trigger?: string;
  // "outcome" = a human-picked button (no predicate).
  // "personMatch" = evaluate a condition tree against the card's person.
  // "always" = unconditional default / fallthrough.
  public kind?: string;
  // Button text for outcome routes.
  public label?: string;
  // Destination step. NULL means complete/close the card.
  public targetStepId?: string;
}
