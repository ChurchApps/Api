import React from 'react';
import { Alert } from 'react-bootstrap';

interface ResponseDisplayProps {
  response?: {
    data: any;
    error?: string;
    loading: boolean;
  };
}

const ResponseDisplay: React.FC<ResponseDisplayProps> = ({ response }) => {
  if (!response) return null;

  if (response.loading) {
    return (
      <Alert variant="info" className="mt-3">
        <div className="d-flex align-items-center">
          <div className="spinner-border spinner-border-sm me-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          Loading...
        </div>
      </Alert>
    );
  }

  if (response.error) {
    return (
      <Alert variant="danger" className="mt-3">
        <strong>Error:</strong> {response.error}
      </Alert>
    );
  }

  if (response.data) {
    const timestamp = new Date().toLocaleTimeString();
    return (
      <Alert variant="success" className="mt-3">
        <div>
          <strong>{timestamp}</strong>
        </div>
        <pre className="mt-2 mb-0" style={{
          backgroundColor: '#f8f9fa',
          padding: '10px',
          borderRadius: '4px',
          fontSize: '0.875rem',
          maxHeight: '300px',
          overflow: 'auto'
        }}>
          {JSON.stringify(response.data, null, 2)}
        </pre>
      </Alert>
    );
  }

  return null;
};

export default ResponseDisplay;