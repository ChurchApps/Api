// Type definitions (inline since we're not using modules)
interface GatewayConfig {
  gatewayId: string;
  churchId: string;
  publicKey: string;
  privateKey: string;
  webhookKey: string;
  productId?: string | null;
  environment?: string;
  settings?: Record<string, unknown> | null;
}

interface DonationData {
  amount: number;
  currency: string;
  customer: {
    email: string;
  };
  customerId?: string;
  paymentMethodId: string;
  type?: string;
  id?: string;
  description?: string;
}

interface SubscriptionData {
  amount: number;
  currency: string;
  interval: string;
  customerId: string;
  id?: string;
  subscriptionId?: string;
  description?: string;
}

interface APIResponse<T = any> {
  success: boolean;
  method?: string;
  provider?: string;
  input?: any;
  result?: T;
  error?: string;
  message?: string;
}

interface FeeResult {
  fees: number;
  total: number;
}

interface ChargeResult {
  success: boolean;
  transactionId: string;
  data: any;
}

interface SubscriptionResult {
  success: boolean;
  subscriptionId: string;
  data: any;
}

interface WebhookResult {
  id: string;
  secret?: string;
}

interface CustomerResult {
  customerId: string;
}

interface ClientTokenResult {
  clientToken: string;
}

interface ProductResult {
  productId: string;
}

type ResponseElementId =
  | 'feesResponse'
  | 'chargeResponse'
  | 'customerResponse'
  | 'subscriptionResponse'
  | 'tokenResponse'
  | 'webhookResponse'
  | 'updateSubResponse'
  | 'cancelSubResponse'
  | 'productResponse';

// Base URL for API calls (adjust based on your environment)
const BASE_URL: string = window.location.origin;

// Helper function to get gateway configuration from form
function getGatewayConfig(): GatewayConfig {
  return {
    gatewayId: Date.now().toString(), // Generate a temporary ID
    churchId: (document.getElementById('churchId') as HTMLInputElement).value,
    publicKey: (document.getElementById('publicKey') as HTMLInputElement).value,
    privateKey: (document.getElementById('privateKey') as HTMLInputElement).value,
    webhookKey: (document.getElementById('webhookKey') as HTMLInputElement).value,
    productId: (document.getElementById('productId') as HTMLInputElement).value || null,
    environment: (document.getElementById('environment') as HTMLSelectElement).value
  };
}

// Helper function to get selected provider
function getSelectedProvider(): string {
  return (document.getElementById('gatewayProvider') as HTMLSelectElement).value;
}

// Helper function to display response
function displayResponse(elementId: ResponseElementId, response: any, isError: boolean = false): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  const timestamp = new Date().toLocaleTimeString();

  let content = `<div class="response-header"><strong>${timestamp}</strong></div>`;

  if (isError) {
    content += `<div class="error"><strong>Error:</strong> ${response}</div>`;
  } else {
    content += `<div class="success"><pre>${JSON.stringify(response, null, 2)}</pre></div>`;
  }

  element.innerHTML = content;
}

// Helper function to show loading state
function showLoading(elementId: ResponseElementId): void {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.innerHTML = '<div class="loading">Loading...</div>';
}

// Helper function to make API calls
async function makeAPICall<T = any>(endpoint: string, data: any = null): Promise<T> {
  try {
    const options: RequestInit = {
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || result.message || 'API call failed');
    }

    return result;
  } catch (error) {
    throw new Error((error as Error).message);
  }
}

// Validation helper
function validateGatewayConfig(): { config: GatewayConfig; provider: string } {
  const config = getGatewayConfig();
  const provider = getSelectedProvider();

  if (!provider) {
    throw new Error('Please select a gateway provider');
  }

  if (!config.churchId) {
    throw new Error('Church ID is required');
  }

  if (!config.publicKey) {
    throw new Error('Public Key is required');
  }

  if (!config.privateKey) {
    throw new Error('Private Key is required');
  }

  return { config, provider };
}

// Test Calculate Fees
async function testCalculateFees(): Promise<void> {
  showLoading('feesResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const amount = parseFloat((document.getElementById('feeAmount') as HTMLInputElement).value);

    if (!amount || amount <= 0) {
      throw new Error('Please enter a valid amount');
    }

    const result = await makeAPICall<APIResponse<FeeResult>>('/playground/gateway/calculate-fees', {
      provider,
      config,
      amount
    });

    displayResponse('feesResponse', result);
  } catch (error) {
    displayResponse('feesResponse', (error as Error).message, true);
  }
}

// Test Process Charge
async function testProcessCharge(): Promise<void> {
  showLoading('chargeResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const amount = parseFloat((document.getElementById('chargeAmount') as HTMLInputElement).value);
    const currency = (document.getElementById('chargeCurrency') as HTMLInputElement).value;
    const email = (document.getElementById('chargeEmail') as HTMLInputElement).value;
    const paymentMethod = (document.getElementById('chargePaymentMethod') as HTMLInputElement).value;
    const customerId = (document.getElementById('chargeCustomerId') as HTMLInputElement).value;

    if (!amount || amount <= 0) {
      throw new Error('Please enter a valid amount');
    }

    if (!email) {
      throw new Error('Customer email is required');
    }

    if (!paymentMethod) {
      throw new Error('Payment method token is required');
    }

    const donationData: DonationData = {
      amount,
      currency: currency || 'USD',
      customer: { email },
      customerId: customerId || undefined,
      paymentMethodId: paymentMethod,
      type: 'card',
      id: paymentMethod,
      description: 'Test donation from playground'
    };

    const result = await makeAPICall<APIResponse<ChargeResult>>('/playground/gateway/process-charge', {
      provider,
      config,
      donationData
    });

    displayResponse('chargeResponse', result);
  } catch (error) {
    displayResponse('chargeResponse', (error as Error).message, true);
  }
}

// Test Create Customer
async function testCreateCustomer(): Promise<void> {
  showLoading('customerResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const email = (document.getElementById('customerEmail') as HTMLInputElement).value;
    const name = (document.getElementById('customerName') as HTMLInputElement).value;

    if (!email) {
      throw new Error('Customer email is required');
    }

    if (!name) {
      throw new Error('Customer name is required');
    }

    const result = await makeAPICall<APIResponse<CustomerResult>>('/playground/gateway/create-customer', {
      provider,
      config,
      email,
      name
    });

    displayResponse('customerResponse', result);
  } catch (error) {
    displayResponse('customerResponse', (error as Error).message, true);
  }
}

// Test Create Subscription
async function testCreateSubscription(): Promise<void> {
  showLoading('subscriptionResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const amount = parseFloat((document.getElementById('subAmount') as HTMLInputElement).value);
    const interval = (document.getElementById('subInterval') as HTMLSelectElement).value;
    const customerId = (document.getElementById('subCustomerId') as HTMLInputElement).value;
    const resourceId = (document.getElementById('subResourceId') as HTMLInputElement).value;

    if (!amount || amount <= 0) {
      throw new Error('Please enter a valid amount');
    }

    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    const subscriptionData: SubscriptionData = {
      amount,
      currency: 'USD',
      interval,
      customerId,
      description: 'Test subscription from playground'
    };

    if (resourceId) {
      subscriptionData.id = resourceId;
    }

    const result = await makeAPICall<APIResponse<SubscriptionResult>>('/playground/gateway/create-subscription', {
      provider,
      config,
      subscriptionData
    });

    displayResponse('subscriptionResponse', result);
  } catch (error) {
    displayResponse('subscriptionResponse', (error as Error).message, true);
  }
}

// Test Generate Client Token
async function testGenerateClientToken(): Promise<void> {
  showLoading('tokenResponse');

  try {
    const { config, provider } = validateGatewayConfig();

    const result = await makeAPICall<APIResponse<ClientTokenResult>>('/playground/gateway/generate-client-token', {
      provider,
      config
    });

    displayResponse('tokenResponse', result);
  } catch (error) {
    displayResponse('tokenResponse', (error as Error).message, true);
  }
}

// Test Create Webhook
async function testCreateWebhook(): Promise<void> {
  showLoading('webhookResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const webhookUrl = (document.getElementById('webhookUrl') as HTMLInputElement).value;

    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    const result = await makeAPICall<APIResponse<WebhookResult>>('/playground/gateway/create-webhook', {
      provider,
      config,
      webhookUrl
    });

    displayResponse('webhookResponse', result);
  } catch (error) {
    displayResponse('webhookResponse', (error as Error).message, true);
  }
}

// Test Update Subscription
async function testUpdateSubscription(): Promise<void> {
  showLoading('updateSubResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const subscriptionId = (document.getElementById('updateSubId') as HTMLInputElement).value;
    const amount = parseFloat((document.getElementById('updateSubAmount') as HTMLInputElement).value);

    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    if (!amount || amount <= 0) {
      throw new Error('Please enter a valid amount');
    }

    const subscriptionData: SubscriptionData = {
      id: subscriptionId,
      subscriptionId,
      amount,
      currency: 'USD',
      interval: '',
      customerId: ''
    };

    const result = await makeAPICall<APIResponse<SubscriptionResult>>('/playground/gateway/update-subscription', {
      provider,
      config,
      subscriptionData
    });

    displayResponse('updateSubResponse', result);
  } catch (error) {
    displayResponse('updateSubResponse', (error as Error).message, true);
  }
}

// Test Cancel Subscription
async function testCancelSubscription(): Promise<void> {
  showLoading('cancelSubResponse');

  try {
    const { config, provider } = validateGatewayConfig();
    const subscriptionId = (document.getElementById('cancelSubId') as HTMLInputElement).value;
    const reason = (document.getElementById('cancelReason') as HTMLInputElement).value;

    if (!subscriptionId) {
      throw new Error('Subscription ID is required');
    }

    const result = await makeAPICall<APIResponse>('/playground/gateway/cancel-subscription', {
      provider,
      config,
      subscriptionId,
      reason: reason || undefined
    });

    displayResponse('cancelSubResponse', result);
  } catch (error) {
    displayResponse('cancelSubResponse', (error as Error).message, true);
  }
}

// Test Create Product
async function testCreateProduct(): Promise<void> {
  showLoading('productResponse');

  try {
    const { config, provider } = validateGatewayConfig();

    const result = await makeAPICall<APIResponse<ProductResult>>('/playground/gateway/create-product', {
      provider,
      config
    });

    displayResponse('productResponse', result);
  } catch (error) {
    displayResponse('productResponse', (error as Error).message, true);
  }
}

// Initialize provider dropdown helper
function updateProviderPlaceholders(provider: string): void {
  const publicKeyField = document.getElementById('publicKey') as HTMLInputElement;
  const privateKeyField = document.getElementById('privateKey') as HTMLInputElement;

  if (!publicKeyField || !privateKeyField) return;

  switch(provider) {
    case 'stripe':
      publicKeyField.placeholder = 'pk_test_...';
      privateKeyField.placeholder = 'sk_test_...';
      break;
    case 'paypal':
      publicKeyField.placeholder = 'PayPal Client ID';
      privateKeyField.placeholder = 'PayPal Client Secret';
      break;
    case 'square':
      publicKeyField.placeholder = 'Square Application ID';
      privateKeyField.placeholder = 'Square Access Token';
      break;
    case 'epaymints':
      publicKeyField.placeholder = 'EPayMints Public Key';
      privateKeyField.placeholder = 'EPayMints Private Key';
      break;
    default:
      publicKeyField.placeholder = 'Enter Public Key';
      privateKeyField.placeholder = 'Enter Private Key';
  }
}

// Initialize page
function initializePage(): void {
  // Set default values for testing
  const elements: { [key: string]: string } = {
    // Gateway Configuration
    'gatewayProvider': 'stripe',
    'churchId': 'test-church-' + Date.now(),
    'publicKey': 'pk_test_IsC6UPM4P5EZ6KAEorHwEMvU00M6ioef1d',
    'privateKey': 'sk_test_51234567890abcdef',
    'webhookKey': 'whsec_test1234567890abcdef',
    'productId': 'prod_test123',
    'environment': 'sandbox',

    // Calculate Fees
    'feeAmount': '100.00',

    // Process Charge
    'chargeAmount': '25.00',
    'chargeCurrency': 'USD',
    'chargeEmail': 'customer@example.com',
    'chargePaymentMethod': 'pm_test_4242424242424242',
    'chargeCustomerId': 'cus_test123',

    // Create Customer
    'customerEmail': 'test@example.com',
    'customerName': 'Test User',

    // Create Subscription
    'subAmount': '15.00',
    'subInterval': 'month',
    'subCustomerId': 'cus_test123',
    'subResourceId': 'pm_test_4242424242424242',

    // Generate Client Token - no fields needed

    // Create Webhook
    'webhookUrl': 'https://api.example.com/webhook',

    // Update Subscription
    'updateSubId': 'sub_test123',
    'updateSubAmount': '35.00',

    // Cancel Subscription
    'cancelSubId': 'sub_test123',
    'cancelReason': 'User requested cancellation'

    // Create Product - no fields needed
  };

  for (const [id, value] of Object.entries(elements)) {
    const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (element) {
      element.value = value;
    }
  }

  // Show helpful messages based on selected provider
  const providerSelect = document.getElementById('gatewayProvider') as HTMLSelectElement;
  if (providerSelect) {
    providerSelect.addEventListener('change', function() {
      updateProviderPlaceholders(this.value);
    });

    // Trigger the change event for the default selected provider
    updateProviderPlaceholders(providerSelect.value);
  }
}

// Attach functions to window object for HTML onclick handlers
console.log('Attaching functions to window object...');
(window as any).testCalculateFees = testCalculateFees;
(window as any).testProcessCharge = testProcessCharge;
(window as any).testCreateCustomer = testCreateCustomer;
(window as any).testCreateSubscription = testCreateSubscription;
(window as any).testGenerateClientToken = testGenerateClientToken;
(window as any).testCreateWebhook = testCreateWebhook;
(window as any).testUpdateSubscription = testUpdateSubscription;
(window as any).testCancelSubscription = testCancelSubscription;
(window as any).testCreateProduct = testCreateProduct;
console.log('Functions attached. testCalculateFees:', typeof (window as any).testCalculateFees);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}