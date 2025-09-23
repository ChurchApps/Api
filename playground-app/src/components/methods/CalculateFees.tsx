import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const CalculateFees: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading }) => {
  const [amount, setAmount] = useState('100.00');

  const handleSubmit = async () => {
    try {
      if (!amount) throw new Error('Amount is required');
      const result = await playgroundApi.calculateFees(provider, config, parseFloat(amount));
      onResponse('fees', result);
    } catch (error) {
      onResponse('fees', null, (error as Error).message);
    }
  };

  return (
    <>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Amount</Form.Label>
            <Form.Control
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              step="0.01"
            />
          </Form.Group>
        </Col>
        <Col md={6} className="pt-4">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Calculating...' : 'Calculate Fees'}
          </Button>
        </Col>
      </Row>
    </>
  );
};