import { GatewayConfig } from '../../types/playground.types';

export interface MethodComponentProps {
  config: GatewayConfig;
  provider: string;
  onResponse: (method: string, data: any, error?: string) => void;
  loading: boolean;
  onConfigUpdate?: (updates: { productId?: string; customerId?: string }) => void;
}

export interface ResponseData {
  data: any;
  error?: string;
  loading: boolean;
}