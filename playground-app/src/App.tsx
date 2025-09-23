import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Alert } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import GatewayConfigComponent from './components/GatewayConfig';
import MethodTesting from './components/MethodTesting';
import { GatewayConfig, GatewayProvider } from './types/playground.types';
import { playgroundApi } from './services/playgroundApi';

function App() {
  const [config, setConfig] = useState<GatewayConfig>({
    gatewayId: '',
    churchId: '1',
    publicKey: 'pk_test_IsC6UPM4P5EZ6KAEorHwEMvU00M6ioef1d',
    privateKey: 'sk_test_',
    webhookKey: 'whsec_',
    productId: '',
    environment: 'sandbox'
  });

  const [provider, setProvider] = useState<string>('stripe');
  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const result = await playgroundApi.getAvailableProviders();
        if (result.success) {
          setProviders(result.providers);
        }
      } catch (error) {
        setError('Failed to load available providers: ' + (error as Error).message);
      }
    };

    loadProviders();
  }, []);

  const handleConfigChange = (newConfig: GatewayConfig) => {
    setConfig(newConfig);
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
  };

  return (
    <div className="App">
      <Container fluid className="py-4">
        <Row>
          <Col>
            <h1 className="text-center mb-4">Gateway Provider Playground</h1>
            <p className="text-center text-muted mb-4">
              Test payment gateway functionality without authentication
            </p>

            {error && (
              <Alert variant="danger" className="mb-4">
                {error}
              </Alert>
            )}

            <GatewayConfigComponent
              config={config}
              provider={provider}
              onConfigChange={handleConfigChange}
              onProviderChange={handleProviderChange}
            />

            {provider && (
              <MethodTesting
                config={config}
                provider={provider}
                onConfigChange={handleConfigChange}
              />
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
}

export default App;
