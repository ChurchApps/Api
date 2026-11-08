// The record that started a trigger, stored on the card (task.data.event) so later step actions can use it.
export interface EventContext {
  type: string;
  donationId?: string;
  amount?: number;
  currency?: string;
  donationDate?: string | Date;
  method?: string;
}
