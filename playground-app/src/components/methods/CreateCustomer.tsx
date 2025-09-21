import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const CreateCustomer: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading, onConfigUpdate }) => {
  const [email, setEmail] = useState('test@example.com');
  const [name, setName] = useState('Test User');

  const handleSubmit = async () => {
    try {
      if (!email) throw new Error('Email is required');
      if (!name) throw new Error('Name is required');

      const result = await playgroundApi.createCustomer(provider, config, email, name);
      onResponse('customer', result);

      if (result.success && result.result?.customerId && onConfigUpdate) {
        // Auto-populate customer ID in other forms
        onConfigUpdate({ customerId: result.result.customerId });
      }
    } catch (error) {
      onResponse('customer', null, (error as Error).message);
    }
  };

  return (
    <>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Email <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Name <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Test User"
            />
          </Form.Group>
        </Col>
      </Row>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Creating...' : 'Create Customer'}
      </Button>
    </>
  );
};