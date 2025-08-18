export interface PaymentDetails {
  id?: string;
  amount: number;
  currency: string;
  customer: string;
  payment_method?: string;
  source?: string;
  description?: string;
  off_session?: boolean;
  confirm?: boolean;
  productId?: string;
  payment_method_id?: string;
  type?: string;
  billing_cycle_anchor?: number;
  proration_behavior?: string;
  receipt_email?: string;
  interval?: {};
  metadata?: {};
}
