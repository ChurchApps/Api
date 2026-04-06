# Database Scripts Directory

Schema creation is handled by Kysely migrations in `tools/migrations/`.
This directory now only contains **demo data** SQL scripts for development/testing.

## Structure

Each module subdirectory contains:
- `demo.sql` - Sample data for development/testing
- `populateData.sql` - Additional seed data (membership only)

## Usage

```bash
# Initialize schema (via migrations) + load demo data
npm run initdb

# Initialize specific module
npm run initdb -- --module=membership

# Load demo data only (schema must already exist)
npm run populateDemo

# Reset all databases (WARNING: Destructive!)
npm run reset-db
```
