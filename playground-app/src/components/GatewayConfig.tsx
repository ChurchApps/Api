import React from 'react';
import { Card, Form, Row, Col } from 'react-bootstrap';
import { GatewayConfig } from '../types/playground.types';

interface GatewayConfigProps {
  config: GatewayConfig;
  provider: string;
  onConfigChange: (config: GatewayConfig) => void;
  onProviderChange: (provider: string) => void;
}

const GatewayConfigComponent: React.FC<GatewayConfigProps> = ({
  config,
  provider,
  onConfigChange,
  onProviderChange,
}) => {
  const handleInputChange = (field: keyof GatewayConfig, value: string) => {
    onConfigChange({
      ...config,
      [field]: value,
    });
  };

  const handleProviderChange = (newProvider: string) => {
    onProviderChange(newProvider);
    // Update placeholders based on provider
    let publicPlaceholder = 'Enter Public Key';
    let privatePlaceholder = 'Enter Private Key';

    switch (newProvider) {
      case 'stripe':
        publicPlaceholder = 'pk_test_...';
        privatePlaceholder = 'sk_test_...';
        break;
      case 'paypal':
        publicPlaceholder = 'PayPal Client ID';
        privatePlaceholder = 'PayPal Client Secret';
        break;
      case 'square':
        publicPlaceholder = 'Square Application ID';
        privatePlaceholder = 'Square Access Token';
        break;
      case 'epaymints':
        publicPlaceholder = 'EPayMints Public Key';
        privatePlaceholder = 'EPayMints Private Key';
        break;
    }
  };

  return (
    <Card className="mb-4">
      <Card.Header>
        <h3>Gateway Configuration</h3>
      </Card.Header>
      <Card.Body>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Gateway Provider</Form.Label>
              <Form.Select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                <option value="">Select Provider</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="square">Square</option>
                <option value="epaymints">EPayMints</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Church ID</Form.Label>
              <Form.Control
                type="text"
                value={config.churchId}
                onChange={(e) => handleInputChange('churchId', e.target.value)}
                placeholder="Enter Church ID"
              />
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Public Key</Form.Label>
              <Form.Control
                type="text"
                value={config.publicKey}
                onChange={(e) => handleInputChange('publicKey', e.target.value)}
                placeholder={provider === 'stripe' ? 'pk_test_...' : 'Enter Public Key'}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Private Key</Form.Label>
              <Form.Control
                type="password"
                value={config.privateKey}
                onChange={(e) => handleInputChange('privateKey', e.target.value)}
                placeholder={provider === 'stripe' ? 'sk_test_...' : 'Enter Private Key'}
              />
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Webhook Key</Form.Label>
              <Form.Control
                type="text"
                value={config.webhookKey}
                onChange={(e) => handleInputChange('webhookKey', e.target.value)}
                placeholder="Enter Webhook Key"
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Product ID (Optional)</Form.Label>
              <Form.Control
                type="text"
                value={config.productId || ''}
                onChange={(e) => handleInputChange('productId', e.target.value)}
                placeholder="Enter Product ID"
              />
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Environment</Form.Label>
              <Form.Select
                value={config.environment || 'sandbox'}
                onChange={(e) => handleInputChange('environment', e.target.value)}
              >
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default GatewayConfigComponent;