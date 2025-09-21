import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const GetCharge: React.FC<MethodComponentProps> = ({ config, provider, onResponse, loading }) => {
  const [chargeId, setChargeId] = useState('ch_test_1234567890');

  const handleSubmit = async () => {
    try {
      if (!chargeId) throw new Error('Charge ID is required');
      const result = await playgroundApi.getCharge(provider, config, chargeId);
      onResponse('getCharge', result);
    } catch (error) {
      onResponse('getCharge', null, (error as Error).message);
    }
  };

  return (
    <>
      <p className="text-muted">Retrieve detailed information about a specific charge/transaction by its ID.</p>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Charge ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={chargeId}
              onChange={(e) => setChargeId(e.target.value)}
              placeholder="ch_test_1234567890"
            />
          </Form.Group>
        </Col>
      </Row>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Getting...' : 'Get Charge'}
      </Button>
    </>
  );
};