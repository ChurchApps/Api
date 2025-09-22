import React, { useState, useCallback } from 'react';
import { Card, Accordion, Alert } from 'react-bootstrap';
import { GatewayConfig } from '../types/playground.types';
import ResponseDisplay from './ResponseDisplay';
import {
  GetCharge,
  GetGateways,
  CalculateFees,
  ProcessCharge,
  CreateCustomer,
  AddCard,
  CreateSubscription,
} from './methods';

interface MethodTestingProps {
  config: GatewayConfig;
  provider: string;
  onConfigChange: (config: GatewayConfig) => void;
}

const MethodTesting: React.FC<MethodTestingProps> = ({ config, provider, onConfigChange }) => {
  const [responses, setResponses] = useState<Record<string, { data: any; error?: string; loading: boolean }>>({});
  const [autoPopulatedFields, setAutoPopulatedFields] = useState<Set<string>>(new Set());

  const handleResponse = useCallback((method: string, data: any, error?: string) => {
    setResponses(prev => ({
      ...prev,
      [method]: { data, error, loading: false }
    }));
  }, []);

  const setLoading = useCallback((method: string, loading: boolean) => {
    setResponses(prev => ({
      ...prev,
      [method]: { ...prev[method], loading }
    }));
  }, []);

  const handleMethodCall = useCallback(async (method: string, callback: () => void) => {
    setLoading(method, true);
    try {
      if (!provider) throw new Error('Please select a gateway provider');
      if (!config.churchId) throw new Error('Church ID is required');
      if (!config.publicKey) throw new Error('Public Key is required');
      if (!config.privateKey) throw new Error('Private Key is required');

      await callback();
    } catch (error) {
      handleResponse(method, null, (error as Error).message);
    }
  }, [provider, config, handleResponse, setLoading]);

  const handleConfigUpdate = useCallback((updates: { productId?: string; customerId?: string }) => {
    if (updates.productId && config.productId !== updates.productId) {
      onConfigChange({ ...config, productId: updates.productId });
      setAutoPopulatedFields(prev => new Set(Array.from(prev).concat('productId')));
    }
    if (updates.customerId) {
      setAutoPopulatedFields(prev => new Set(Array.from(prev).concat('customerId')));
    }
  }, [config, onConfigChange]);

  return (
    <Card>
      <Card.Header>
        <h3>Method Testing</h3>
      </Card.Header>
      <Card.Body>
        {autoPopulatedFields.size > 0 && (
          <Alert variant="success" className="mb-3">
            <strong>✨ Auto-population:</strong> Some fields have been automatically filled based on your last successful operation!
          </Alert>
        )}

        <Accordion defaultActiveKey="0">
          {/* Get Gateways */}
          <Accordion.Item eventKey="0">
            <Accordion.Header>
              <strong>⚙️ Configuration:</strong> Get Payment Gateways
            </Accordion.Header>
            <Accordion.Body>
              <GetGateways
                config={config}
                provider={provider}
                onResponse={handleResponse}
                loading={responses.getGateways?.loading || false}
              />
              <ResponseDisplay response={responses.getGateways} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Transaction Lookup */}
          <Accordion.Item eventKey="1">
            <Accordion.Header>
              <strong>🔍 Transactions:</strong> Get Charge Details
            </Accordion.Header>
            <Accordion.Body>
              <GetCharge
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('getCharge', () => handleResponse(method, data, error))}
                loading={responses.getCharge?.loading || false}
              />
              <ResponseDisplay response={responses.getCharge} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Calculate Fees */}
          <Accordion.Item eventKey="2">
            <Accordion.Header>
              <strong>💰 Charges:</strong> Calculate Fees
            </Accordion.Header>
            <Accordion.Body>
              <CalculateFees
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('fees', () => handleResponse(method, data, error))}
                loading={responses.fees?.loading || false}
              />
              <ResponseDisplay response={responses.fees} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Process Charge */}
          <Accordion.Item eventKey="3">
            <Accordion.Header>
              <strong>💳 Charges:</strong> Process Charge
            </Accordion.Header>
            <Accordion.Body>
              <ProcessCharge
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('charge', () => handleResponse(method, data, error))}
                loading={responses.charge?.loading || false}
                onConfigUpdate={handleConfigUpdate}
              />
              <ResponseDisplay response={responses.charge} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Customer */}
          <Accordion.Item eventKey="4">
            <Accordion.Header>
              <strong>👤 Customer:</strong> Create Customer
            </Accordion.Header>
            <Accordion.Body>
              <CreateCustomer
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('customer', () => handleResponse(method, data, error))}
                loading={responses.customer?.loading || false}
                onConfigUpdate={handleConfigUpdate}
              />
              <ResponseDisplay response={responses.customer} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Add Card */}
          <Accordion.Item eventKey="5">
            <Accordion.Header>
              <strong>💳 Payment Methods:</strong> Add New Card
            </Accordion.Header>
            <Accordion.Body>
              <AddCard
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('addCard', () => handleResponse(method, data, error))}
                loading={responses.addCard?.loading || false}
              />
              <ResponseDisplay response={responses.addCard} />
            </Accordion.Body>
          </Accordion.Item>

          {/* Create Subscription */}
          <Accordion.Item eventKey="6">
            <Accordion.Header>
              <strong>🔄 Subscriptions:</strong> Create Subscription
            </Accordion.Header>
            <Accordion.Body>
              <CreateSubscription
                config={config}
                provider={provider}
                onResponse={(method, data, error) => handleMethodCall('subscription', () => handleResponse(method, data, error))}
                loading={responses.subscription?.loading || false}
              />
              <ResponseDisplay response={responses.subscription} />
            </Accordion.Body>
          </Accordion.Item>

          {/* You can add more method components here as needed */}
        </Accordion>
      </Card.Body>
    </Card>
  );
};

export default MethodTesting;