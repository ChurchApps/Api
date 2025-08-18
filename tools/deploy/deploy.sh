#!/bin/bash

# Core API Deployment Script
# Usage: ./deploy.sh [stage] [region]

STAGE=${1:-dev}
REGION=${2:-us-east-2}

echo "Deploying Core API to stage: $STAGE in region: $REGION"

# Build the application
echo "Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "Build failed. Exiting."
    exit 1
fi

# Build Lambda layer
echo "Building Lambda layer..."
npm run build-layer

if [ $? -ne 0 ]; then
    echo "Layer build failed. Exiting."
    exit 1
fi

# Deploy with Serverless
echo "Deploying with Serverless..."
serverless deploy --stage $STAGE --region $REGION

if [ $? -eq 0 ]; then
    echo "Deployment successful!"
    echo "API Gateway URL:"
    serverless info --stage $STAGE --region $REGION | grep endpoints -A 1
else
    echo "Deployment failed!"
    exit 1
fi