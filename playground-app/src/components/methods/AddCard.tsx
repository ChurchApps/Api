import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const AddCard: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading }) => {
  const [customerId, setCustomerId] = useState('cus_test123');
  const [cardNumber, setCardNumber] = useState('4111111111111111');
  const [expMonth, setExpMonth] = useState('12');
  const [expYear, setExpYear] = useState('2030');
  const [cvc, setCvc] = useState('123');
  const [zip, setZip] = useState('90210');

  const handleSubmit = async () => {
    try {
      if (!customerId) throw new Error('Customer ID is required');
      if (!cardNumber) throw new Error('Card Number is required');
      if (!expMonth) throw new Error('Expiration Month is required');
      if (!expYear) throw new Error('Expiration Year is required');

      const cardData = {
        source: {
          object: 'card',
          number: cardNumber,
          exp_month: expMonth,
          exp_year: expYear,
          cvc: cvc,
          address_zip: zip
        }
      };

      const result = await playgroundApi.addCard(provider, config, customerId, cardData);
      onResponse('addCard', result);
    } catch (error) {
      onResponse('addCard', null, (error as Error).message);
    }
  };

  return (
    <>
      <p className="text-muted">Add a new card payment method to a customer. Pre-filled with test card data (4111 1111 1111 1111).</p>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Customer ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="Customer ID to add card to"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Card Number <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4111111111111111"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Expiration Month <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value)}
              placeholder="12"
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Expiration Year <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={expYear}
              onChange={(e) => setExpYear(e.target.value)}
              placeholder="2030"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>CVC</Form.Label>
            <Form.Control
              type="text"
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              placeholder="123"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>ZIP Code</Form.Label>
            <Form.Control
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="90210"
            />
          </Form.Group>
        </Col>
      </Row>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Adding...' : 'Add Card'}
      </Button>
    </>
  );
};