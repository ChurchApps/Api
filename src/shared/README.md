# Shared Infrastructure

This directory contains the consolidated shared infrastructure for the API modular monolith. All modules should use these shared components to ensure consistency and avoid code duplication.

## Directory Structure

```
src/shared/
├── helpers/              # Utility classes and functions
│   ├── Environment.ts    # Consolidated environment configuration
│   ├── Permissions.ts    # Unified permission definitions
│   ├── UniqueIdHelper.ts # ID generation utilities
│   ├── DateHelper.ts     # Date/time utilities
│   ├── ValidationHelper.ts # Input validation utilities
│   └── index.ts         # Consolidated exports
├── infrastructure/      # Core infrastructure components
│   ├── ConnectionManager.ts    # Database connection management
│   ├── RepositoryManager.ts    # Repository instantiation and caching
│   ├── CustomAuthProvider.ts   # Shared authentication provider
│   ├── BaseController.ts       # Base controller with common functionality
│   └── index.ts               # Consolidated exports
├── types/               # Shared type definitions
│   ├── common.ts        # Common interfaces and types
│   └── index.ts         # Type exports
└── index.ts            # Main shared module exports
```

## Key Components

### Environment Configuration

The `Environment` class consolidates all environment configuration from the original microservices:

```typescript
import { Environment } from "../shared";

// Initialize environment (typically done in app startup)
await Environment.init("dev");

// Access configuration
const membershipApi = Environment.membershipApi;
const dbConfig = Environment.getDatabaseConfig("membership");
const youTubeKey = Environment.youTubeApiKey;
```

**Features:**

- Supports all original microservice configurations
- Automatic AWS Parameter Store integration
- Lambda-aware path resolution
- Fallback to legacy config formats

### Database Management

#### ConnectionManager

Manages database connections per module with connection pooling:

```typescript
import { ConnectionManager } from "../shared";

// Get a connection pool for a specific module
const pool = await ConnectionManager.getPool("membership");

// Check if pool exists
if (ConnectionManager.hasPool("attendance")) {
  // Pool is available
}

// Clean up (typically in app shutdown)
await ConnectionManager.closeAll();
```

#### RepositoryManager

Handles repository instantiation and caching:

```typescript
import { RepositoryManager } from "../shared";

// Get repositories for a module
const repos = await RepositoryManager.getRepositories<MembershipRepositories>("membership");

// Set up database context for queries
await RepositoryManager.setupModuleContext("membership");

// Legacy support for getCurrent() pattern
const legacyRepos = await RepositoryManager.getCurrentForModule("membership");
```

### Authentication

The shared `CustomAuthProvider` extends the base provider from @churchapps/apihelper:

```typescript
import { CustomAuthProvider } from "../shared";

// Use in Inversify server setup
const app = new InversifyExpressServer(container, null, null, null, CustomAuthProvider);
```

### Base Controllers

All module controllers should extend the shared base controller:

```typescript
import { BaseController } from "../shared";
import { MembershipRepositories } from "./repositories";

export class MembershipBaseController extends BaseController {
  protected repositories: MembershipRepositories;

  constructor() {
    super("membership"); // Pass module name
  }

  protected async initialize(): Promise<void> {
    await this.setupContext();
    this.repositories = await this.getRepositories<MembershipRepositories>();
  }
}
```

**Base Controller Features:**

- Automatic repository management
- Standard response formats
- Input validation and sanitization
- Permission checking helpers
- Error handling
- Church ID validation
- Audit logging hooks

### Permissions

Unified permission system across all modules:

```typescript
import { Permissions } from "../shared";

// Use in controllers
if (au.checkAccess(Permissions.people.edit)) {
  // User can edit people
}

// Module-specific permissions
if (au.checkAccess(Permissions.attendance.checkin)) {
  // User can perform checkin
}
```

### Utilities

#### UniqueIdHelper

Consistent ID generation:

```typescript
import { UniqueIdHelper } from "../shared";

const id = UniqueIdHelper.shortId(); // 8-character ID
const uuid = UniqueIdHelper.uuid(); // Full UUID
const timestampId = UniqueIdHelper.timestampId(); // Time-based ID
```

#### DateHelper

Date/time utilities:

```typescript
import { DateHelper } from "../shared";

const now = DateHelper.now(); // MySQL format
const today = DateHelper.today(); // Date only
const churchTime = DateHelper.toChurchTime(date, "America/New_York");
const age = DateHelper.getAge(birthDate);
```

#### ValidationHelper

Input validation:

```typescript
import { ValidationHelper } from "../shared";

// Basic validation
const isValid = ValidationHelper.isValidEmail(email);
const errors = ValidationHelper.validateRequired(data, ["name", "email"]);

// Sanitization
const clean = ValidationHelper.sanitizeString(userInput);
```

### Types

Common type definitions for consistency:

```typescript
import { BaseEntity, ApiResponse, Person, ModuleName } from "../shared";

interface MyEntity extends BaseEntity {
  name: string;
}

function handleResponse(response: ApiResponse<MyEntity[]>) {
  if (response.success) {
    // Handle data
  }
}
```

## Migration Guidelines

When migrating modules to use the shared infrastructure:

### 1. Update Environment Usage

Replace module-specific Environment classes:

```typescript
// Before (in individual microservices)
import { Environment } from "../helpers/Environment";

// After (in monolith modules)
import { Environment } from "../../shared";
```

### 2. Update Repository Patterns

Replace singleton repository patterns:

```typescript
// Before
import { Repositories } from "../repositories";
const repos = Repositories.getCurrent();

// After
import { RepositoryManager } from "../../shared";
const repos = await RepositoryManager.getRepositories<MembershipRepositories>("membership");
```

### 3. Update Base Controllers

Extend the shared base controller:

```typescript
// Before
import { CustomBaseController } from "@churchapps/apihelper";

export class MembershipBaseController extends CustomBaseController {
  public repositories: Repositories;

  constructor() {
    super();
    this.repositories = Repositories.getCurrent();
  }
}

// After
import { BaseController } from "../../shared";

export class MembershipBaseController extends BaseController {
  protected repositories: MembershipRepositories;

  constructor() {
    super("membership");
  }

  protected async initialize(): Promise<void> {
    await this.setupContext();
    this.repositories = await this.getRepositories<MembershipRepositories>();
  }
}
```

### 4. Update Permission Imports

Use consolidated permissions:

```typescript
// Before (module-specific)
import { Permissions } from "../helpers/Permissions";

// After (shared)
import { Permissions } from "../../shared";
```

### 5. Use Shared Utilities

Replace module-specific utilities:

```typescript
// Before
import { UniqueIdHelper } from "../helpers";

// After
import { UniqueIdHelper } from "../../shared";
```

## Benefits

1. **Consistency**: All modules use the same patterns and utilities
2. **Maintainability**: Single source of truth for common functionality
3. **Type Safety**: Shared type definitions ensure compatibility
4. **Performance**: Connection pooling and caching optimizations
5. **Security**: Centralized authentication and validation
6. **Flexibility**: Easy to extend and customize per module needs

## Best Practices

1. **Always use shared utilities** instead of creating module-specific ones
2. **Extend base controllers** to inherit common functionality
3. **Use RepositoryManager** for all database access
4. **Validate inputs** using ValidationHelper
5. **Check permissions** before business logic operations
6. **Ensure church ID scoping** for multi-tenancy
7. **Use standard response formats** from base controller
8. **Import from shared index files** for cleaner imports

## Example Usage

Complete example of using shared infrastructure in a controller:

```typescript
import { controller, httpGet, httpPost } from "inversify-express-utils";
import { Request, Response } from "express";
import { BaseController, Permissions, ValidationHelper, UniqueIdHelper } from "../../shared";
import { MyModuleRepositories } from "../repositories";

@controller("/api/mymodule")
export class MyController extends BaseController {
  private repositories: MyModuleRepositories;

  constructor() {
    super("mymodule");
  }

  @httpGet("/")
  public async getAll(req: Request, res: Response) {
    try {
      await this.setupContext();
      this.repositories = await this.getRepositories<MyModuleRepositories>();

      const au = res.locals.user;
      if (!this.checkPermission(au, Permissions.myModule.view)) {
        return res.status(401).json(this.error("Unauthorized"));
      }

      const items = await this.repositories.myEntity.loadAll(au.churchId);
      return res.json(this.success(items));
    } catch (error) {
      return res.status(500).json(this.handleError(error));
    }
  }

  @httpPost("/")
  public async create(req: Request, res: Response) {
    try {
      await this.setupContext();
      this.repositories = await this.getRepositories<MyModuleRepositories>();

      const au = res.locals.user;
      if (!this.checkPermission(au, Permissions.myModule.edit)) {
        return res.status(401).json(this.error("Unauthorized"));
      }

      // Validate input
      const errors = this.validateRequired(req.body, ["name"]);
      if (errors.length > 0) {
        return res.status(400).json(this.validationError(errors));
      }

      // Sanitize and prepare data
      const data = this.sanitizeInput(req.body);
      data.id = UniqueIdHelper.shortId();
      data.churchId = au.churchId;

      const result = await this.repositories.myEntity.save(data);
      this.logAction(au, "create", "MyEntity", result.id);

      return res.json(this.success(result, "Created successfully"));
    } catch (error) {
      return res.status(500).json(this.handleError(error));
    }
  }
}
```
