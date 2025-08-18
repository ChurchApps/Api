# Database Scripts Directory

This directory contains the database initialization scripts for all modules in the API modular monolith.

## Structure

Each module has its own subdirectory containing SQL scripts:

- `membership/` - Core membership, authentication, and user management
- `attendance/` - Attendance tracking and service management
- `content/` - Content management system and media files
- `giving/` - Donation processing and financial management
- `messaging/` - Real-time messaging and notifications
- `doing/` - Task automation and workflow management

## File Naming Convention

SQL files are executed in alphabetical order:

- `01_tables.sql` - Table creation and schema definition
- `02_demo_data.sql` - Sample data for development/testing
- `03_procedures.sql` - Stored procedures and functions (if needed)
- `99_migrations.sql` - Any schema migrations or updates

## Usage

The database initialization system supports:

```bash
# Initialize all databases in dependency order
npm run initdb

# Initialize specific module database
npm run initdb:membership
npm run initdb:attendance
npm run initdb:content
npm run initdb:giving
npm run initdb:messaging
npm run initdb:doing

# Reset all databases (WARNING: Destructive!)
npm run reset-db
```

## Initialization Order

Modules are initialized in dependency order:

1. **membership** - Core authentication and user management (required first)
2. **attendance** - Attendance tracking
3. **content** - Content management
4. **giving** - Donation processing
5. **messaging** - Real-time messaging
6. **doing** - Task automation

## Multi-Database Architecture

Each module maintains its own MySQL database:

- `membership` database - Core church and user data
- `attendance` database - Attendance and service data
- `content` database - Pages, media, and sermon data
- `giving` database - Donation and financial data
- `messaging` database - Messages and notification data
- `doing` database - Task and workflow data

All databases are configured in the `config/dev.json` file and accessed via the unified `ConnectionManager`.

## Environment Support

The initialization system supports multiple environments:

- `dev` - Local development
- `staging` - Staging environment
- `prod` - Production environment

Environment-specific configurations are located in the `config/` directory.
