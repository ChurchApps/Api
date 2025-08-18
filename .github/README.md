# GitHub Actions for core API

This directory contains GitHub Actions workflows for the API modular monolith.

## Workflows Overview

### 🔄 Continuous Integration

#### `ci.yml` - Build and Test

- **Triggers**: Pull requests, pushes to main
- **Purpose**: Comprehensive testing including linting, type checking, unit tests, and security scans
- **Features**:
  - ESLint validation with module separation rules
  - TypeScript compilation
  - MySQL integration tests
  - Code coverage reporting
  - Security vulnerability scanning

### 🚀 Deployment Workflows

#### `deploy-demo.yml` - Demo Environment

- **Triggers**: Push to main, manual dispatch
- **Purpose**: Deploy to demo environment with automatic database setup
- **Features**:
  - Automated deployment
  - Database migration and demo data setup
  - Health checks and endpoint validation
  - Slack notifications

#### `deploy-staging.yml` - Staging Environment

- **Triggers**: Push to main, manual dispatch
- **Purpose**: Deploy to staging with comprehensive testing
- **Features**:
  - Integration testing
  - Performance monitoring
  - Security validation
  - Production-like environment testing

#### `deploy-prod.yml` - Production Environment

- **Triggers**: Release creation, manual dispatch with confirmation
- **Purpose**: Secure production deployment with safety checks
- **Features**:
  - Manual confirmation requirement
  - Pre-deployment validation
  - Smoke testing
  - Rollback procedures
  - Critical alert notifications

### 🛠️ Utility Workflows

#### `database-migration.yml` - Database Operations

- **Triggers**: Manual dispatch only
- **Purpose**: Run database migrations on any environment
- **Options**:
  - Initialize all databases
  - Reset databases with fresh data
  - Migrate specific modules
  - Environment selection (demo/staging/prod)

#### `cleanup-demo.yml` - Demo Environment Maintenance

- **Triggers**: Weekly schedule (Sundays), manual dispatch
- **Purpose**: Reset demo environment with fresh demo data
- **Features**:
  - Automated weekly cleanup
  - Database reset and re-initialization
  - Health verification

#### `dependency-update.yml` - Dependency Management

- **Triggers**: Weekly schedule (Mondays), manual dispatch
- **Purpose**: Automated dependency updates and security patches
- **Features**:
  - Minor and patch version updates
  - Security vulnerability fixes
  - Automated pull request creation
  - Testing validation

#### `health-check.yml` - System Monitoring

- **Triggers**: Every 15 minutes, manual dispatch
- **Purpose**: Continuous health monitoring of all environments
- **Features**:
  - API endpoint health checks
  - Database connectivity testing
  - Performance monitoring
  - Alert notifications for failures

## Environment Configuration

### GitHub Environments

1. **Demo** - Automatic deployment from main branch
2. **Staging** - Automatic deployment with testing
3. **Production** - Protected environment with review requirements

### Required Secrets

#### AWS Credentials

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (Production)
- `STAGING_AWS_ACCESS_KEY_ID` / `STAGING_AWS_SECRET_ACCESS_KEY` (Staging/Demo)

#### External Services

- `SLACK_WEBHOOK_URL` (Optional - for notifications)
- `SNYK_TOKEN` (Optional - for security scanning)

#### Database Configuration

Database connection strings are managed via environment variables or AWS Parameter Store:

- `MEMBERSHIP_DB_URL`
- `ATTENDANCE_DB_URL`
- `CONTENT_DB_URL`
- `GIVING_DB_URL`
- `MESSAGING_DB_URL`
- `DOING_DB_URL`

## Workflow Features

### 🔒 Security

- Secret scanning
- Dependency vulnerability checks
- Production deployment protection
- IAM role separation by environment

### 📊 Monitoring

- Health checks every 15 minutes
- Performance monitoring
- Slack alerting
- Deployment status tracking

### 🔄 Automation

- Automated dependency updates
- Demo environment cleanup
- Database migration workflows
- Build artifact caching

### 🧪 Testing

- Multi-environment testing
- Integration test suites
- Smoke testing in production
- Database connectivity validation

## Usage Examples

### Manual Deployment

```bash
# Deploy to specific environment
gh workflow run deploy-staging.yml

# Deploy to production with confirmation
gh workflow run deploy-prod.yml -f confirm_production="DEPLOY TO PRODUCTION"
```

### Database Operations

```bash
# Initialize databases in staging
gh workflow run database-migration.yml -f environment=staging -f migration_type=init

# Reset demo databases
gh workflow run database-migration.yml -f environment=demo -f migration_type=reset

# Migrate specific module
gh workflow run database-migration.yml -f environment=staging -f migration_type=specific-module -f module=membership
```

### Health Checks

```bash
# Check all environments
gh workflow run health-check.yml

# Check specific environment
gh workflow run health-check.yml -f environment=prod
```

## Monitoring and Alerts

### Slack Notifications

- Deployment status (success/failure)
- Health check alerts
- Database operation notifications
- Security scan results

### Monitoring Endpoints

- **Demo**: https://api-demo.churchapps.org/health
- **Staging**: https://api-staging.churchapps.org/health
- **Production**: https://api.churchapps.org/health

## Development Workflow

1. **Feature Development**
   - Create feature branch
   - Open pull request
   - CI workflow runs automatically
   - Merge after review and tests pass

2. **Staging Deployment**
   - Push to main branch
   - Automatic deployment to staging
   - Integration tests run
   - Manual testing and validation

3. **Production Deployment**
   - Create GitHub release
   - Production deployment workflow triggers
   - Smoke tests and health checks
   - Monitor for issues

## Troubleshooting

### Common Issues

#### Deployment Failures

1. Check AWS credentials and permissions
2. Verify serverless.yml configuration
3. Review CloudWatch logs
4. Check database connectivity

#### Test Failures

1. Verify database setup in CI
2. Check environment variable configuration
3. Review test database connectivity
4. Validate test data initialization

#### Health Check Failures

1. Check API endpoint availability
2. Verify database connections
3. Review Lambda function logs
4. Check security group configurations

### Support

- Review workflow logs in GitHub Actions tab
- Check CloudWatch logs for Lambda errors
- Monitor Slack channels for automated alerts
- Contact DevOps team for infrastructure issues

## Best Practices

1. **Always test in staging first** before production deployment
2. **Use manual confirmation** for production deployments
3. **Monitor health checks** after deployments
4. **Keep dependencies updated** via automated PRs
5. **Review security scan results** regularly
6. **Use environment-specific configurations**
7. **Test database migrations** in non-production first

For detailed setup instructions, see [DEPLOYMENT_SETUP.md](DEPLOYMENT_SETUP.md).
