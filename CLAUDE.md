# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a **modular monolith** for a church management system that consolidates 6 microservices into a single deployable unit:

- **MembershipApi** - Authentication, users, churches, permissions, and form builder
- **AttendanceApi** - Attendance tracking and reporting with campus/service hierarchy  
- **ContentApi** - Content management, sermons, media, and external API integrations
- **GivingApi** - Donation processing and financial management with Stripe and PayPal integration
- **MessagingApi** - Real-time messaging, notifications, and WebSocket management
- **DoingApi** - Task automation and workflow management

Each module maintains **database isolation** with separate MySQL databases while sharing infrastructure components.

## Common Development Commands

```bash
# Development setup
npm install                           # Install dependencies
npm run dev                          # Start development server with hot reload (port 8084)

# Database initialization
npm run initdb                       # Initialize all module databases with schema and demo data
npm run initdb:membership            # Initialize specific module database
npm run populateDemo                 # Add demo data only (without schema changes)
npm run reset-db                     # Reset all databases (destructive)

# Build pipeline
npm run clean                        # Clean dist directory
npm run lint                         # Run ESLint with auto-fix and Prettier
npm run tsc                          # TypeScript compilation only
npm run build                        # Full build: clean + tsc + copy-assets

# Lambda layer management
npm run build-layer                  # Build Lambda layer with production dependencies
npm run rebuild-layer                # Clean and rebuild Lambda layer
npm run clean-layer                  # Remove layer directory

# Deployment
npm run deploy-demo                  # Deploy to demo environment
npm run deploy-staging               # Deploy to staging environment  
npm run deploy-prod                  # Deploy to production environment

# Testing and local development
npm run test                         # Run Jest tests with coverage
npm run test:watch                   # Run tests in watch mode
npm run serverless-local             # Test serverless functions locally (port 8084)
```

## Technology Stack & Architectural Patterns

**Core Stack:**
- Node.js 20.x + TypeScript 5.x
- Express.js with Inversify dependency injection
- MySQL 8.0 with connection pooling per module
- AWS Lambda + Serverless Framework v3 deployment
- `@codegenie/serverless-express` for Lambda HTTP handling
- Lambda layers for dependency optimization

**Key Architectural Patterns:**

1. **Module Isolation**: Each module has separate database, repositories, and business logic with clean boundaries
2. **Repository Pattern**: Access data via `RepositoryManager.getRepositories<T>(moduleName)` 
3. **Base Controllers**: All controllers extend module-specific base controllers (e.g., `MembershipBaseController`)
4. **Dependency Injection**: Controllers use Inversify with `@controller`, `@httpGet`, `@httpPost` decorators
5. **Multi-tenant Architecture**: All operations scoped by `churchId` for tenant isolation
6. **Permission-based Security**: Check permissions via `au.checkAccess(Permissions.xxx)` before business logic

## Database Management

**Structure:**
- Each module has its own MySQL database (membership, attendance, content, giving, messaging, doing)
- Connection pooling managed by `ConnectionManager` and `MultiDatabasePool`
- Environment-specific connection strings via environment variables or AWS Parameter Store

**Setup Process:**
1. Configure database connections in `.env` (copy from `.env.sample`) using format: `MODULENAME_CONNECTION_STRING=mysql://user:password@host:port/database`
2. Run `npm run initdb` to execute schema scripts from `tools/dbScripts/[module]/`
3. Each module's database scripts are organized by functional sections and executed in dependency order

## Configuration Management

**Environment Files:**
- `config/dev.json` - Local development with local MySQL and file storage
- `config/staging.json` - Staging environment with AWS RDS and S3
- `config/prod.json` - Production environment with full AWS integration

**Access Pattern:**
- Use `Environment.ts` class for all configuration access
- Never read config files directly - always use `Environment.getDatabaseConfig(moduleName)`
- AWS Parameter Store integration for sensitive values in deployed environments

## Lambda Deployment Architecture

**Multi-Function Setup:**
1. **web** function - HTTP API endpoints (512MB memory, 30s timeout)
2. **socket** function - WebSocket handling (1024MB memory, 30s timeout)
3. **timer15Min** function - Individual email notifications (256MB, every 30 minutes)
4. **timerMidnight** function - Daily digest emails (256MB, daily at 5 AM UTC)

**Lambda Layer Strategy:**
- Production dependencies packaged in reusable Lambda layer at `/opt/nodejs/node_modules/`
- Application code excludes `node_modules` for faster deployments and cold starts
- Layer rebuilt automatically when `tools/layer-package.json` dependencies change

## Module-Specific Patterns

**MembershipApi** - Central authentication hub:
- JWT token management with 2-day expiration
- OAuth integrations with custom token handling
- Form builder with granular permission system via `formAccess()` method
- `CustomAuthProvider` used across all modules for authentication

**ContentApi** - External integrations:
- YouTube, Vimeo, OpenAI, PraiseCharts API integrations
- CMS hierarchy: Pages → Sections → Elements
- Sermon management with audio processing

**AttendanceApi** - Hierarchical tracking:
- Campus → Service → ServiceTime → Session → Visit → VisitSession structure
- Session-based attendance aggregation

**MessagingApi** - Real-time communication:
- WebSocket connection management via AWS API Gateway WebSocket
- Firebase push notifications for mobile
- Notification preferences and batching (individual vs daily digest)
- Connection state persistence in database

**GivingApi** - Payment processing:
- Multi-gateway support: Stripe and PayPal integrations
- One-time and recurring donations for both payment providers
- Fund allocation and batch processing
- Automatic fee calculation per payment provider
- Webhook handling for both Stripe and PayPal events

**DoingApi** - Automation engine:
- Condition-based automation triggers
- Task assignment with position/time scheduling

## Development Guidelines

**Repository Access:**
```typescript
// In controllers, use the repository manager
const repos = await this.getRepositories<MembershipRepositories>();
const user = await repos.user.load(churchId, userId);
```

**Permission Checking:**
```typescript
// Always check permissions before business logic
if (!au.checkAccess(Permissions.membership.edit)) {
  return this.errorResponse("Insufficient permissions");
}
```

**Multi-tenancy:**
```typescript
// Always scope by churchId
const data = await repository.loadByChurch(au.churchId, entityId);
```

**Controller Structure:**
```typescript
// Extend appropriate base controller
export class UserController extends MembershipBaseController {
  @httpGet("/:id")
  async load(req: Request, res: Response): Promise<any> {
    return this.actionWrapper(req, res, async (au: AuthenticatedUser) => {
      // Permission check
      if (!au.checkAccess(Permissions.membership.view)) {
        return this.errorResponse("Access denied");
      }
      
      // Business logic with proper error handling
      const repos = await this.getMembershipRepositories();
      const user = await repos.user.load(au.churchId, req.params.id);
      return this.success(user);
    });
  }
}
```

**Environment Configuration:**
```typescript
// Use Environment class for all config access
const dbConfig = Environment.getDatabaseConfig("membership");
const apiKey = Environment.youTubeApiKey;
```

## WebSocket and Real-time Features (MessagingApi)

**Connection Management:**
- Lambda functions handle WebSocket events via `lambda/socket-handler.ts`
- Connection state managed in database via `ConnectionRepository`
- Use `SocketHelper` for broadcasting and connection lifecycle

**Notification System:**
- Firebase integration for mobile push notifications
- Email batching based on user preferences
- Timer functions handle scheduled notification delivery

**Local Development:**
- WebSocket server runs on port 8087 when `deliveryProvider: "local"`
- Use `npm run serverless-local` to test Lambda functions locally

## Testing and Quality Assurance

- Jest for unit testing with coverage reporting
- ESLint + Prettier for code formatting (auto-fix enabled)
- TypeScript strict mode with `--noEmitOnError false` for builds
- Database integration tests use separate test databases per module

## PayPal Integration Setup

The GivingApi now supports both Stripe and PayPal as payment gateways. Here's how to configure PayPal:

### Database Configuration

PayPal gateways are configured in the `Gateway` table with these fields:
- `provider`: "paypal" 
- `publicKey`: PayPal Client ID (encrypted)
- `privateKey`: PayPal Client Secret (encrypted)
- `webhookKey`: PayPal Webhook ID (encrypted)
- `productId`: Not used for PayPal (can be null)

### PayPal Developer Setup

1. Create a PayPal Developer account at https://developer.paypal.com
2. Create a new application to get Client ID and Client Secret
3. Webhooks for PayPal events are auto-configured when saving the PayPal gateway via the API. The system creates webhooks for:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`

### Environment Variables

No additional environment variables are required. PayPal credentials are stored encrypted in the Gateway table.

### API Endpoints

All existing donation endpoints support PayPal by specifying `provider: "paypal"` in the request body:
- `/donate/charge` - One-time PayPal donations
- `/donate/subscribe` - PayPal recurring donations
- `/donate/fee` - PayPal fee calculation
- `/donate/webhook/paypal?churchId={id}` - PayPal webhook handler

### Frontend Integration

Use the new `MultiGatewayDonationForm` component from `@churchapps/apphelper` which supports both Stripe and PayPal:

```typescript
import { MultiGatewayDonationForm } from "@churchapps/apphelper";

<MultiGatewayDonationForm
  person={person}
  customerId={customerId}
  paymentMethods={paymentMethods} // Include both Stripe and PayPal methods
  paymentGateways={gateways}     // Gateway configuration
  donationSuccess={handleSuccess}
  church={church}
/>
```

### Fee Calculation

PayPal fees are calculated automatically:
- Default: 2.9% + $0.30 for domestic transactions
- Configurable via church settings: `transFeePayPal` and `flatRatePayPal`