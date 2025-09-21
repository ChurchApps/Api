# Gateway Provider Playground

A React application for testing payment gateway functionality without authentication. This is a development-only tool for testing the IGatewayProvider interface methods.

## Overview

This playground allows you to:
- Configure gateway settings (Stripe, PayPal, Square, EPayMints)
- Test all IGatewayProvider methods including:
  - Calculate Fees
  - Process Charge
  - Create Customer
  - Generate Client Token
  - Create Webhook
  - Create Subscription
  - Update Subscription
  - Cancel Subscription
  - Create Product
  - Get Customer Payment Methods
  - Attach Payment Method
  - Detach Payment Method
  - Create Bank Account

## Prerequisites

1. **Main API Server**: The main ChurchApps API server must be running on port 8084
   ```bash
   cd ..  # Go to main API directory
   ENVIRONMENT=dev npm run dev
   ```

2. **Node.js**: Ensure you have Node.js installed

## Getting Started

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   PORT=3002 npm start
   ```

   The app will open at [http://localhost:3002](http://localhost:3002)

## Configuration

The playground comes pre-configured with default test values:
- **Provider**: Stripe (default)
- **Church ID**: 1
- **Public Key**: pk_test_IsC6UPM4P5EZ6KAEorHwEMvU00M6ioef1d
- **Private Key**: sk_test_ (you'll need to complete this)
- **Environment**: Sandbox

You can modify these values through the Gateway Configuration form.

## API Communication

The playground communicates with the main API server at `http://localhost:8084` using the following endpoints:
- `/playground/gateway/providers` - Get available providers
- `/playground/gateway/calculate-fees` - Calculate processing fees
- `/playground/gateway/process-charge` - Process one-time payments
- `/playground/gateway/create-customer` - Create customer records
- And more...

## Project Structure

```
src/
├── components/
│   ├── GatewayConfig.tsx      # Gateway configuration form
│   ├── MethodTesting.tsx      # Method testing interface
│   └── ResponseDisplay.tsx    # API response display
├── services/
│   └── playgroundApi.ts       # API service layer
├── types/
│   └── playground.types.ts    # TypeScript type definitions
└── App.tsx                    # Main application component
```

## Development Notes

- This is a **development-only** tool and should not be deployed to production
- The main API server restricts playground endpoints to `ENVIRONMENT=dev` only
- All form fields have pre-filled default values for quick testing
- Real-time API responses are displayed with syntax highlighting

## Available Scripts

### `npm start`
Runs the app in development mode on port 3002

### `npm test`
Launches the test runner

### `npm run build`
Builds the app for production (not recommended for this development tool)
