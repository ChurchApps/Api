import React, { useState } from 'react';
import { Card, Form, Button, Row, Col, Accordion, Alert } from 'react-bootstrap';
import { GatewayConfig, APIResponse } from '../types/playground.types';
import { playgroundApi } from '../services/playgroundApi';
import ResponseDisplay from './ResponseDisplay';

interface MethodTestingProps {
  config: GatewayConfig;
  provider: string;
  onConfigChange: (config: GatewayConfig) => void;
}

const MethodTesting: React.FC<MethodTestingProps> = ({ config, provider, onConfigChange }) => {
  const [responses, setResponses] = useState<Record<string, { data: any; error?: string; loading: boolean }>>({});
  const [autoPopulatedFields, setAutoPopulatedFields] = useState<Set<string>>(new Set());

  // Form states for different methods
  const [feeAmount, setFeeAmount] = useState('100.00');
  const [chargeAmount, setChargeAmount] = useState('25.00');
  const [chargeCurrency, setChargeCurrency] = useState('USD');
  const [chargeEmail, setChargeEmail] = useState('customer@example.com');
  const [chargePaymentMethod, setChargePaymentMethod] = useState('pm_test_4242424242424242');
  const [chargeCustomerId, setChargeCustomerId] = useState('cus_test123');
  const [customerEmail, setCustomerEmail] = useState('test@example.com');
  const [customerName, setCustomerName] = useState('Test User');
  const [subAmount, setSubAmount] = useState('15.00');
  const [subInterval, setSubInterval] = useState('month');
  const [subCustomerId, setSubCustomerId] = useState('cus_test123');
  const [subResourceId, setSubResourceId] = useState('pm_test_4242424242424242');
  const [webhookUrl, setWebhookUrl] = useState('https://api.example.com/webhook');
  const [updateSubId, setUpdateSubId] = useState('sub_test123');
  const [updateSubAmount, setUpdateSubAmount] = useState('35.00');
  const [cancelSubId, setCancelSubId] = useState('sub_test123');
  const [cancelReason, setCancelReason] = useState('User requested cancellation');

  // Helper function to get field class with auto-population highlighting
  const getFieldClass = (fieldName: string) => {
    return autoPopulatedFields.has(fieldName) ? 'border-success bg-light' : '';
  };

  const validateConfig = () => {
    if (!provider) throw new Error('Please select a gateway provider');
    if (!config.churchId) throw new Error('Church ID is required');
    if (!config.publicKey) throw new Error('Public Key is required');
    if (!config.privateKey) throw new Error('Private Key is required');
  };

  const setLoading = (method: string, loading: boolean) => {
    setResponses(prev => ({
      ...prev,
      [method]: { ...prev[method], loading }
    }));
  };

  const setResponse = (method: string, data: any, error?: string) => {
    setResponses(prev => ({
      ...prev,
      [method]: { data, error, loading: false }
    }));

    // Auto-populate related fields based on successful responses
    if (!error && data?.success && data?.result) {
      const result = data.result;
      const newAutoPopulated = new Set<string>();

      // Auto-populate Customer ID from create customer response
      if (method === 'customer' && result.customerId) {
        setChargeCustomerId(result.customerId);
        setSubCustomerId(result.customerId);
        newAutoPopulated.add('chargeCustomerId');
        newAutoPopulated.add('subCustomerId');
      }

      // Auto-populate Subscription ID from create subscription response
      if (method === 'subscription' && result.subscriptionId) {
        setUpdateSubId(result.subscriptionId);
        setCancelSubId(result.subscriptionId);
        newAutoPopulated.add('updateSubId');
        newAutoPopulated.add('cancelSubId');
      }

      // Auto-populate Product ID from create product response
      if (method === 'product' && result.productId) {
        // Update the config with the product ID
        onConfigChange({
          ...config,
          productId: result.productId
        });
        newAutoPopulated.add('productId');
      }

      // Auto-populate payment method token from charge response (if available)
      if (method === 'charge' && result.data?.paymentMethodId) {
        setChargePaymentMethod(result.data.paymentMethodId);
        setSubResourceId(result.data.paymentMethodId);
        newAutoPopulated.add('chargePaymentMethod');
        newAutoPopulated.add('subResourceId');
      }

      // Update auto-populated fields and clear after 3 seconds
      if (newAutoPopulated.size > 0) {
        setAutoPopulatedFields(newAutoPopulated);
        setTimeout(() => {
          setAutoPopulatedFields(new Set());
        }, 3000);
      }
    }
  };

  const testCalculateFees = async () => {
    setLoading('fees', true);
    try {
      validateConfig();
      const amount = parseFloat(feeAmount);
      if (!amount || amount <= 0) throw new Error('Please enter a valid amount');

      const result = await playgroundApi.calculateFees(provider, config, amount);
      setResponse('fees', result);
    } catch (error) {
      setResponse('fees', null, (error as Error).message);
    }
  };

  const testProcessCharge = async () => {
    setLoading('charge', true);
    try {
      validateConfig();
      const amount = parseFloat(chargeAmount);
      if (!amount || amount <= 0) throw new Error('Please enter a valid amount');
      if (!chargeEmail) throw new Error('Customer email is required');
      if (!chargePaymentMethod) throw new Error('Payment method token is required');

      const donationData = {
        amount,
        currency: chargeCurrency || 'USD',
        customer: { email: chargeEmail },
        customerId: chargeCustomerId || undefined,
        paymentMethodId: chargePaymentMethod,
        type: 'card',
        id: chargePaymentMethod,
        description: 'Test donation from playground'
      };

      const result = await playgroundApi.processCharge(provider, config, donationData);
      setResponse('charge', result);
    } catch (error) {
      setResponse('charge', null, (error as Error).message);
    }
  };

  const testCreateCustomer = async () => {
    setLoading('customer', true);
    try {
      validateConfig();
      if (!customerEmail) throw new Error('Customer email is required');
      if (!customerName) throw new Error('Customer name is required');

      const result = await playgroundApi.createCustomer(provider, config, customerEmail, customerName);
      setResponse('customer', result);
    } catch (error) {
      setResponse('customer', null, (error as Error).message);
    }
  };

  const testCreateSubscription = async () => {
    setLoading('subscription', true);
    try {
      validateConfig();
      const amount = parseFloat(subAmount);
      if (!amount || amount <= 0) throw new Error('Please enter a valid amount');
      if (!subCustomerId) throw new Error('Customer ID is required');

      const subscriptionData = {
        amount,
        currency: 'USD',
        interval: subInterval,
        customerId: subCustomerId,
        id: subResourceId || undefined,
        description: 'Test subscription from playground'
      };

      const result = await playgroundApi.createSubscription(provider, config, subscriptionData);
      setResponse('subscription', result);
    } catch (error) {
      setResponse('subscription', null, (error as Error).message);
    }
  };

  const testGenerateClientToken = async () => {
    setLoading('token', true);
    try {
      validateConfig();
      const result = await playgroundApi.generateClientToken(provider, config);
      setResponse('token', result);
    } catch (error) {
      setResponse('token', null, (error as Error).message);
    }
  };

  const testCreateWebhook = async () => {
    setLoading('webhook', true);
    try {
      validateConfig();
      if (!webhookUrl) throw new Error('Webhook URL is required');

      const result = await playgroundApi.createWebhook(provider, config, webhookUrl);
      setResponse('webhook', result);
    } catch (error) {
      setResponse('webhook', null, (error as Error).message);
    }
  };

  const testUpdateSubscription = async () => {
    setLoading('updateSub', true);
    try {
      validateConfig();
      if (!updateSubId) throw new Error('Subscription ID is required');
      const amount = parseFloat(updateSubAmount);
      if (!amount || amount <= 0) throw new Error('Please enter a valid amount');

      const subscriptionData = {
        id: updateSubId,
        subscriptionId: updateSubId,
        amount,
        currency: 'USD',
        interval: '',
        customerId: ''
      };

      const result = await playgroundApi.updateSubscription(provider, config, subscriptionData);
      setResponse('updateSub', result);
    } catch (error) {
      setResponse('updateSub', null, (error as Error).message);
    }
  };

  const testCancelSubscription = async () => {
    setLoading('cancelSub', true);
    try {
      validateConfig();
      if (!cancelSubId) throw new Error('Subscription ID is required');

      const result = await playgroundApi.cancelSubscription(provider, config, cancelSubId, cancelReason);
      setResponse('cancelSub', result);
    } catch (error) {
      setResponse('cancelSub', null, (error as Error).message);
    }
  };

  const testCreateProduct = async () => {
    setLoading('product', true);
    try {
      validateConfig();
      const result = await playgroundApi.createProduct(provider, config);
      setResponse('product', result);
    } catch (error) {
      setResponse('product', null, (error as Error).message);
    }
  };

  return (
    <Card>
      <Card.Header>
        <h3>Method Testing</h3>
      </Card.Header>
      <Card.Body>
        {autoPopulatedFields.size > 0 && (
          <Alert variant="success" className="mb-3">
            <strong>✨ Auto-population:</strong> Some fields below have been automatically filled based on your last successful operation!
          </Alert>
        )}
        <Accordion>
          {/* Calculate Fees */}
          <Accordion.Item eventKey="0">
            <Accordion.Header>Calculate Fees</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Amount</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      placeholder="100.00"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Button
                    variant="primary"
                    onClick={testCalculateFees}
                    disabled={responses.fees?.loading}
                  >
                    {responses.fees?.loading ? 'Calculating...' : 'Calculate Fees'}
                  </Button>
                </Col>
              </Row>
              <ResponseDisplay response={responses.fees} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Process Charge */}
          <Accordion.Item eventKey="1">
            <Accordion.Header>Process Charge</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Amount</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      placeholder="25.00"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Currency</Form.Label>
                    <Form.Control
                      type="text"
                      value={chargeCurrency}
                      onChange={(e) => setChargeCurrency(e.target.value)}
                      placeholder="USD"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Customer Email</Form.Label>
                    <Form.Control
                      type="email"
                      value={chargeEmail}
                      onChange={(e) => setChargeEmail(e.target.value)}
                      placeholder="customer@example.com"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Method Token</Form.Label>
                    <Form.Control
                      type="text"
                      value={chargePaymentMethod}
                      onChange={(e) => setChargePaymentMethod(e.target.value)}
                      placeholder="pm_test_token"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Customer ID (Optional) {autoPopulatedFields.has('chargeCustomerId') && <span className="text-success">✨ Auto-filled</span>}</Form.Label>
                    <Form.Control
                      type="text"
                      value={chargeCustomerId}
                      onChange={(e) => setChargeCustomerId(e.target.value)}
                      placeholder="cus_test_id"
                      className={getFieldClass('chargeCustomerId')}
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button
                variant="primary"
                onClick={testProcessCharge}
                disabled={responses.charge?.loading}
              >
                {responses.charge?.loading ? 'Processing...' : 'Process Charge'}
              </Button>
              <ResponseDisplay response={responses.charge} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Customer */}
          <Accordion.Item eventKey="2">
            <Accordion.Header>Create Customer</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Name</Form.Label>
                    <Form.Control
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="John Doe"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button
                variant="primary"
                onClick={testCreateCustomer}
                disabled={responses.customer?.loading}
              >
                {responses.customer?.loading ? 'Creating...' : 'Create Customer'}
              </Button>
              <ResponseDisplay response={responses.customer} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Generate Client Token */}
          <Accordion.Item eventKey="3">
            <Accordion.Header>Generate Client Token</Accordion.Header>
            <Accordion.Body>
              <Button
                variant="primary"
                onClick={testGenerateClientToken}
                disabled={responses.token?.loading}
              >
                {responses.token?.loading ? 'Generating...' : 'Generate Client Token'}
              </Button>
              <ResponseDisplay response={responses.token} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Webhook */}
          <Accordion.Item eventKey="4">
            <Accordion.Header>Create Webhook Endpoint</Accordion.Header>
            <Accordion.Body>
              <Form.Group className="mb-3">
                <Form.Label>Webhook URL</Form.Label>
                <Form.Control
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                />
              </Form.Group>
              <Button
                variant="primary"
                onClick={testCreateWebhook}
                disabled={responses.webhook?.loading}
              >
                {responses.webhook?.loading ? 'Creating...' : 'Create Webhook'}
              </Button>
              <ResponseDisplay response={responses.webhook} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Subscription */}
          <Accordion.Item eventKey="5">
            <Accordion.Header>Create Subscription</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Amount</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={subAmount}
                      onChange={(e) => setSubAmount(e.target.value)}
                      placeholder="15.00"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Interval</Form.Label>
                    <Form.Select
                      value={subInterval}
                      onChange={(e) => setSubInterval(e.target.value)}
                    >
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                      <option value="week">Weekly</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group className="mb-3">
                    <Form.Label>Customer ID {autoPopulatedFields.has('subCustomerId') && <span className="text-success">✨ Auto-filled</span>}</Form.Label>
                    <Form.Control
                      type="text"
                      value={subCustomerId}
                      onChange={(e) => setSubCustomerId(e.target.value)}
                      placeholder="cus_test123"
                      className={getFieldClass('subCustomerId')}
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Payment Method/Resource ID (Optional)</Form.Label>
                    <Form.Control
                      type="text"
                      value={subResourceId}
                      onChange={(e) => setSubResourceId(e.target.value)}
                      placeholder="pm_test_token"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button
                variant="primary"
                onClick={testCreateSubscription}
                disabled={responses.subscription?.loading}
              >
                {responses.subscription?.loading ? 'Creating...' : 'Create Subscription'}
              </Button>
              <ResponseDisplay response={responses.subscription} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Update Subscription */}
          <Accordion.Item eventKey="6">
            <Accordion.Header>Update Subscription</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Subscription ID {autoPopulatedFields.has('updateSubId') && <span className="text-success">✨ Auto-filled</span>}</Form.Label>
                    <Form.Control
                      type="text"
                      value={updateSubId}
                      onChange={(e) => setUpdateSubId(e.target.value)}
                      placeholder="sub_test123"
                      className={getFieldClass('updateSubId')}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>New Amount</Form.Label>
                    <Form.Control
                      type="number"
                      step="0.01"
                      value={updateSubAmount}
                      onChange={(e) => setUpdateSubAmount(e.target.value)}
                      placeholder="35.00"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button
                variant="primary"
                onClick={testUpdateSubscription}
                disabled={responses.updateSub?.loading}
              >
                {responses.updateSub?.loading ? 'Updating...' : 'Update Subscription'}
              </Button>
              <ResponseDisplay response={responses.updateSub} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Cancel Subscription */}
          <Accordion.Item eventKey="7">
            <Accordion.Header>Cancel Subscription</Accordion.Header>
            <Accordion.Body>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Subscription ID {autoPopulatedFields.has('cancelSubId') && <span className="text-success">✨ Auto-filled</span>}</Form.Label>
                    <Form.Control
                      type="text"
                      value={cancelSubId}
                      onChange={(e) => setCancelSubId(e.target.value)}
                      placeholder="sub_test123"
                      className={getFieldClass('cancelSubId')}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Cancellation Reason (Optional)</Form.Label>
                    <Form.Control
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="User requested cancellation"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button
                variant="primary"
                onClick={testCancelSubscription}
                disabled={responses.cancelSub?.loading}
              >
                {responses.cancelSub?.loading ? 'Cancelling...' : 'Cancel Subscription'}
              </Button>
              <ResponseDisplay response={responses.cancelSub} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Product */}
          <Accordion.Item eventKey="8">
            <Accordion.Header>Create Product</Accordion.Header>
            <Accordion.Body>
              <p className="text-muted">Creates a product for the specified church. Some providers require products for subscription management.</p>
              <Button
                variant="primary"
                onClick={testCreateProduct}
                disabled={responses.product?.loading}
              >
                {responses.product?.loading ? 'Creating...' : 'Create Product'}
              </Button>
              <ResponseDisplay response={responses.product} />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Card.Body>
    </Card>
  );
};

export default MethodTesting;