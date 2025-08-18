# Core APIs - Modular Monolith

This is the consolidated Core APIs modular monolith for the church management system, migrated from 6 separate microservices.

## Overview

The Core APIs combine the following modules into a single deployable monolith:
- **MembershipApi** - Authentication, users, churches, and permissions
- **AttendanceApi** - Attendance tracking and reporting  
- **ContentApi** - Content management, sermons, and media
- **GivingApi** - Donation processing and financial management
- **MessagingApi** - Real-time messaging and notifications
- **DoingApi** - Task automation and workflows

## Quick Start

### Prerequisites
- Node.js 20.x or higher
- MySQL 8.0 or higher
- AWS CLI configured (for deployment)

### Local Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.sample .env
   # Edit .env with your database connection strings
   # Format: mysql://user:password@host:port/database
   ```

3. **Database Setup**
   ```bash
   # Configure database connection strings in .env:
   # MEMBERSHIP_DB_URL=mysql://root:password@localhost:3306/membership
   # ATTENDANCE_DB_URL=mysql://root:password@localhost:3306/attendance
   # etc.
   npm run initdb
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

The API will be available at: http://localhost:8084

### Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload
npm run initdb          # Initialize all module databases

# Building
npm run clean           # Clean dist directory
npm run lint            # Run TSLint with auto-fix
npm run tsc             # TypeScript compilation
npm run build           # Full build pipeline
npm run copy-assets     # Copy template assets

# Lambda Layers
npm run build-layer     # Build Lambda layer with dependencies
npm run rebuild-layer   # Clean and rebuild Lambda layer

# Deployment
npm run deploy-demo     # Deploy to demo environment
npm run deploy-staging  # Deploy to staging environment
npm run deploy-prod     # Deploy to production environment

# Testing
npm run test            # Run tests with coverage
npm run test:watch      # Run tests in watch mode

# Local Testing
npm run serverless-local # Test serverless functions locally
```

## Architecture

### Directory Structure

```
src/
├── modules/           # Individual API modules
│   ├── attendance/    # Attendance tracking
│   ├── content/       # Content management  
│   ├── doing/         # Task automation
│   ├── giving/        # Financial management
│   ├── membership/    # Authentication & users
│   └── messaging/     # Real-time messaging
├── shared/           # Shared infrastructure
│   ├── helpers/      # Utility classes
│   ├── infrastructure/ # Connection management
│   └── types/        # Shared type definitions
├── lambda/           # Lambda function handlers
├── app.ts           # Express application setup
└── index.ts         # Main entry point
```

### Module Isolation

Each module maintains:
- Independent database connections
- Separate repository patterns
- Isolated business logic
- Clean module boundaries through index.ts exports

### Database Strategy

- Each module has its own MySQL database
- Connection pooling per module using EnhancedPoolHelper
- Shared connection management through ConnectionManager
- Multi-tenant architecture with churchId scoping

## API Endpoints

The API provides endpoints for all modules under a unified structure:

- **Base URL**: `/api`
- **Health Check**: `/health`
- **API Documentation**: `/api`

Module-specific endpoints will be documented during migration.

## Environment Configuration

### Local Development (.env)
- Uses local MySQL databases
- Local file storage
- Debug logging enabled
- WebSocket server on port 8087

### Staging/Production
- AWS RDS for databases
- S3 for file storage
- CloudWatch logging
- AWS API Gateway for WebSocket

## Lambda Functions

The monolith deploys as multiple Lambda functions:

1. **web** - HTTP API endpoints (512MB)
2. **socket** - WebSocket handling (1024MB)
3. **timer15Min** - Individual email notifications (256MB, every 30 min)
4. **timerMidnight** - Daily digest emails (256MB, daily at 5 AM UTC)

## Migration Status

This is the initial project structure. Module migration will happen in phases:

- ✅ **Phase 1**: Core infrastructure setup (COMPLETE)
- ⏳ **Phase 2**: Module migration (IN PROGRESS)
  - [ ] MembershipApi
  - [ ] AttendanceApi  
  - [ ] ContentApi
  - [ ] GivingApi
  - [ ] DoingApi
  - [ ] MessagingApi
- ⏳ **Phase 3**: Integration testing
- ⏳ **Phase 4**: Deployment preparation

## Development Guidelines

1. **Module Boundaries**: Keep modules isolated through proper exports
2. **Database Access**: Always use `RepositoryManager.getRepositories<T>(moduleName)`
3. **Environment Config**: Use `Environment` class, never direct config access
4. **Authentication**: Use shared `CustomAuthProvider` for all modules
5. **Multi-tenancy**: Always scope operations by `churchId`
6. **Permissions**: Check permissions via `au.checkAccess()` before business logic

## Troubleshooting

### Database Connection Issues
- Verify database exists and credentials are correct in .env
- Check that MySQL service is running
- Ensure user has proper permissions

### Build Errors
- Run `npm run clean` and rebuild
- Check TypeScript compilation with `npm run tsc`
- Verify all dependencies are installed

### Lambda Layer Issues
- Rebuild layer with `npm run rebuild-layer`
- Check layer package.json has all production dependencies
- Verify serverless.yml references correct layer

## Support

For issues during migration or development, refer to:
- Migration plan documentation in `MIGRATION_PLAN.md`
- Technical analysis in `TECHNICAL_ANALYSIS.md`
- Implementation guide in `IMPLEMENTATION_GUIDE.md`