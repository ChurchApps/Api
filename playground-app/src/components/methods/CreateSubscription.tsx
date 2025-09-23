import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const CreateSubscription: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading }) => {
  const [amount, setAmount] = useState('15.00');
  const [currency, setCurrency] = useState('USD');
  const [interval, setInterval] = useState('month');
  const [customerId, setCustomerId] = useState('cus_test123');
  const [paymentMethodId, setPaymentMethodId] = useState('pm_test_4242424242424242');

  const handleSubmit = async () => {
    try {
      if (!amount) throw new Error('Amount is required');
      if (!customerId) throw new Error('Customer ID is required');
      if (!paymentMethodId) throw new Error('Payment Method ID is required');

      const subscriptionData = {
        amount: parseFloat(amount),
        currency,
        interval,
        customerId,
        id: paymentMethodId,
        type: 'card',
        notes: 'Test subscription from playground'
      };

      const result = await playgroundApi.createSubscription(provider, config, subscriptionData);
      onResponse('subscription', result);
    } catch (error) {
      onResponse('subscription', null, (error as Error).message);
    }
  };

  return (
    <>
      <Row>
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Amount <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="15.00"
              step="0.01"
            />
          </Form.Group>
        </Col>
        <Col md={2}>
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
        <Col md={3}>
          <Form.Group className="mb-3">
            <Form.Label>Interval</Form.Label>
            <Form.Select value={interval} onChange={(e) => setInterval(e.target.value)}>
              <option value="month">Monthly</option>
              <option value="week">Weekly</option>
              <option value="year">Yearly</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={4}>
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
      </Row>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Payment Method ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
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
        {loading ? 'Creating...' : 'Create Subscription'}
      </Button>
    </>
  );
};