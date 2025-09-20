// Base URL for API calls (adjust based on your environment)
const BASE_URL = window.location.origin;

// Helper function to get gateway configuration from form
function getGatewayConfig() {
    return {
        gatewayId: Date.now().toString(), // Generate a temporary ID
        churchId: document.getElementById('churchId').value,
        publicKey: document.getElementById('publicKey').value,
        privateKey: document.getElementById('privateKey').value,
        webhookKey: document.getElementById('webhookKey').value,
        productId: document.getElementById('productId').value || null,
        environment: document.getElementById('environment').value
    };
}

// Helper function to get selected provider
function getSelectedProvider() {
    return document.getElementById('gatewayProvider').value;
}

// Helper function to display response
function displayResponse(elementId, response, isError = false) {
    const element = document.getElementById(elementId);
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
function showLoading(elementId) {
    const element = document.getElementById(elementId);
    element.innerHTML = '<div class="loading">Loading...</div>';
}

// Helper function to make API calls
async function makeAPICall(endpoint, data = null) {
    try {
        const options = {
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
        throw new Error(error.message);
    }
}

// Validation helper
function validateGatewayConfig() {
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
async function testCalculateFees() {
    showLoading('feesResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const amount = parseFloat(document.getElementById('feeAmount').value);

        if (!amount || amount <= 0) {
            throw new Error('Please enter a valid amount');
        }

        const result = await makeAPICall('/playground/gateway/calculate-fees', {
            provider,
            config,
            amount
        });

        displayResponse('feesResponse', result);
    } catch (error) {
        displayResponse('feesResponse', error.message, true);
    }
}

// Test Process Charge
async function testProcessCharge() {
    showLoading('chargeResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const amount = parseFloat(document.getElementById('chargeAmount').value);
        const currency = document.getElementById('chargeCurrency').value;
        const email = document.getElementById('chargeEmail').value;
        const paymentMethod = document.getElementById('chargePaymentMethod').value;

        if (!amount || amount <= 0) {
            throw new Error('Please enter a valid amount');
        }

        if (!email) {
            throw new Error('Customer email is required');
        }

        if (!paymentMethod) {
            throw new Error('Payment method token is required');
        }

        const donationData = {
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency || 'USD',
            customer: { email },
            paymentMethodId: paymentMethod,
            description: 'Test donation from playground'
        };

        const result = await makeAPICall('/playground/gateway/process-charge', {
            provider,
            config,
            donationData
        });

        displayResponse('chargeResponse', result);
    } catch (error) {
        displayResponse('chargeResponse', error.message, true);
    }
}

// Test Create Customer
async function testCreateCustomer() {
    showLoading('customerResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const email = document.getElementById('customerEmail').value;
        const name = document.getElementById('customerName').value;

        if (!email) {
            throw new Error('Customer email is required');
        }

        if (!name) {
            throw new Error('Customer name is required');
        }

        const result = await makeAPICall('/playground/gateway/create-customer', {
            provider,
            config,
            email,
            name
        });

        displayResponse('customerResponse', result);
    } catch (error) {
        displayResponse('customerResponse', error.message, true);
    }
}

// Test Create Subscription
async function testCreateSubscription() {
    showLoading('subscriptionResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const amount = parseFloat(document.getElementById('subAmount').value);
        const interval = document.getElementById('subInterval').value;
        const customerId = document.getElementById('subCustomerId').value;

        if (!amount || amount <= 0) {
            throw new Error('Please enter a valid amount');
        }

        if (!customerId) {
            throw new Error('Customer ID is required');
        }

        const subscriptionData = {
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'USD',
            interval,
            customerId,
            description: 'Test subscription from playground'
        };

        const result = await makeAPICall('/playground/gateway/create-subscription', {
            provider,
            config,
            subscriptionData
        });

        displayResponse('subscriptionResponse', result);
    } catch (error) {
        displayResponse('subscriptionResponse', error.message, true);
    }
}

// Test Generate Client Token
async function testGenerateClientToken() {
    showLoading('tokenResponse');

    try {
        const { config, provider } = validateGatewayConfig();

        const result = await makeAPICall('/playground/gateway/generate-client-token', {
            provider,
            config
        });

        displayResponse('tokenResponse', result);
    } catch (error) {
        displayResponse('tokenResponse', error.message, true);
    }
}

// Test Create Webhook
async function testCreateWebhook() {
    showLoading('webhookResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const webhookUrl = document.getElementById('webhookUrl').value;

        if (!webhookUrl) {
            throw new Error('Webhook URL is required');
        }

        const result = await makeAPICall('/playground/gateway/create-webhook', {
            provider,
            config,
            webhookUrl
        });

        displayResponse('webhookResponse', result);
    } catch (error) {
        displayResponse('webhookResponse', error.message, true);
    }
}

// Test Update Subscription
async function testUpdateSubscription() {
    showLoading('updateSubResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const subscriptionId = document.getElementById('updateSubId').value;
        const amount = parseFloat(document.getElementById('updateSubAmount').value);

        if (!subscriptionId) {
            throw new Error('Subscription ID is required');
        }

        if (!amount || amount <= 0) {
            throw new Error('Please enter a valid amount');
        }

        const subscriptionData = {
            subscriptionId,
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'USD'
        };

        const result = await makeAPICall('/playground/gateway/update-subscription', {
            provider,
            config,
            subscriptionData
        });

        displayResponse('updateSubResponse', result);
    } catch (error) {
        displayResponse('updateSubResponse', error.message, true);
    }
}

// Test Cancel Subscription
async function testCancelSubscription() {
    showLoading('cancelSubResponse');

    try {
        const { config, provider } = validateGatewayConfig();
        const subscriptionId = document.getElementById('cancelSubId').value;
        const reason = document.getElementById('cancelReason').value;

        if (!subscriptionId) {
            throw new Error('Subscription ID is required');
        }

        const result = await makeAPICall('/playground/gateway/cancel-subscription', {
            provider,
            config,
            subscriptionId,
            reason: reason || undefined
        });

        displayResponse('cancelSubResponse', result);
    } catch (error) {
        displayResponse('cancelSubResponse', error.message, true);
    }
}

// Test Create Product
async function testCreateProduct() {
    showLoading('productResponse');

    try {
        const { config, provider } = validateGatewayConfig();

        const result = await makeAPICall('/playground/gateway/create-product', {
            provider,
            config
        });

        displayResponse('productResponse', result);
    } catch (error) {
        displayResponse('productResponse', error.message, true);
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Set default values for testing
    document.getElementById('churchId').value = 'test-church-' + Date.now();
    document.getElementById('chargeAmount').value = '25.00';
    document.getElementById('feeAmount').value = '100.00';
    document.getElementById('subAmount').value = '15.00';
    document.getElementById('customerEmail').value = 'test@example.com';
    document.getElementById('customerName').value = 'Test User';
    document.getElementById('chargeEmail').value = 'customer@example.com';
    document.getElementById('webhookUrl').value = 'https://api.example.com/webhook';

    // Show helpful messages based on selected provider
    document.getElementById('gatewayProvider').addEventListener('change', function() {
        const provider = this.value;
        const publicKeyField = document.getElementById('publicKey');
        const privateKeyField = document.getElementById('privateKey');

        // Update placeholders based on provider
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
    });
});