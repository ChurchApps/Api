import React, { useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { playgroundApi } from '../../services/playgroundApi';
import { MethodComponentProps } from './types';

export const GetGateways: React.FC<MethodComponentProps> = ({ config, onResponse, loading }) => {
  const [churchId, setChurchId] = useState(config.churchId || '');

  const handleSubmit = async () => {
    try {
      if (!churchId) throw new Error('Church ID is required');
      const result = await playgroundApi.getGateways(churchId);
      onResponse('getGateways', result);
    } catch (error) {
      onResponse('getGateways', null, (error as Error).message);
    }
  };

  return (
    <>
      <p className="text-muted">Retrieve all configured payment gateways for a church. This is a public endpoint that returns gateway information without sensitive data.</p>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Church ID <span className="text-danger">*</span></Form.Label>
            <Form.Control
              type="text"
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              placeholder="Enter church ID"
            />
            <Form.Text className="text-muted">
              The unique identifier of the church to get gateways for
            </Form.Text>
          </Form.Group>
        </Col>
      </Row>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={loading || !churchId}
      >
        {loading ? 'Getting...' : 'Get Gateways'}
      </Button>
    </>
  );
};