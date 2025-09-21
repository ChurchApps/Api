import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const ProcessCharge: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading, onConfigUpdate }) => {
  const [amount, setAmount] = useState('25.00');
  const [currency, setCurrency] = useState('USD');
  const [email, setEmail] = useState('customer@example.com');
  const [paymentMethod, setPaymentMethod] = useState('pm_test_4242424242424242');
  const [customerId, setCustomerId] = useState('cus_test123');

  const handleSubmit = async () => {
    try {
      if (!amount) throw new Error('Amount is required');
      if (!customerId) throw new Error('Customer ID is required');
      if (!paymentMethod) throw new Error('Payment method is required');

      const donationData = {
        amount: parseFloat(amount),
        currency,
        email,
        customer: {
          id: customerId,
          email: email
        },
        paymentMethodId: paymentMethod,
        id: paymentMethod,
        type: 'card',
        funds: [{ fundId: '1', amount: parseFloat(amount) }],
        notes: 'Test donation from playground'
      };

      const result = await playgroundApi.processCharge(provider, config, donationData);
      onResponse('charge', result);

      if (result.success && result.result?.transactionId && onConfigUpdate) {
        // Auto-populate fields with successful transaction
        onConfigUpdate({ customerId });
      }
    } catch (error) {
      onResponse('charge', null, (error as Error).message);
    }
  };

  return (
    <>
      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Amount <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              step="0.01"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Currency</Form.Label>
            <Form.Control
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="USD"
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </Form.Group>
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Customer ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Customer ID"
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Payment Method ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Payment Method ID"
            />
          </Form.Group>
        </Col>
      </Row>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Process Charge'}
      </Button>
    </>
  );
};