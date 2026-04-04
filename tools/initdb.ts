import { Environment } from "../src/shared/helpers/Environment.js";
import { KyselyPool } from "../src/shared/infrastructure/KyselyPool.js";
import { sql } from "kysely";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module definitions with their table sections
const moduleDefinitions = {
  membership: {
    order: 1,
    sections: [
      {
        name: "Access",
        tables: [
          { title: "AccessLogs", file: "accessLogs.sql" },
          { title: "Churches", file: "churches.sql" },
          { title: "Domains", file: "domains.sql" },
          { title: "Role Members", file: "roleMembers.sql" },
          { title: "Role Permissions", file: "rolePermissions.sql" },
          { title: "Roles", file: "roles.sql" },
          { title: "Users", file: "users.sql" },
          { title: "User Churches", file: "userChurches.sql" },
        ]
      },
      {
        name: "Forms",
        tables: [
          { title: "Answers", file: "answers.sql" },
          { title: "Forms", file: "forms.sql" },
          { title: "FormSubmissions", file: "formSubmissions.sql" },
          { title: "Questions", file: "questions.sql" },
        ]
      },
      {
        name: "People",
        tables: [
          { title: "Households", file: "households.sql" },
          { title: "People", file: "people.sql" },
          { title: "Member Permissions", file: "memberPermissions.sql" },
          { title: "Notes", file: "notes.sql" },
          { title: "Visibility Preferences", file: "visibilityPreferences.sql" },
        ]
      },
      {
        name: "Groups",
        tables: [
          { title: "Groups", file: "groups.sql" },
          { title: "Group Members", file: "groupMembers.sql" },
        ]
      },
      {
        name: "OAuth",
        tables: [
          { title: "OAuth Clients", file: "oAuthClients.sql" },
          { title: "OAuth Codes", file: "oAuthCodes.sql" },
          { title: "OAuth Device Codes", file: "oAuthDeviceCodes.sql" },
          { title: "OAuth Relay Sessions", file: "oAuthRelaySessions.sql" },
          { title: "OAuth Tokens", file: "oAuthTokens.sql" },
        ]
      },
      {
        name: "Misc",
        tables: [
          { title: "Audit Logs", file: "auditLogs.sql" },
          { title: "Client Errors", file: "clientErrors.sql" },
          { title: "Settings", file: "settings.sql" },
          { title: "Usage Trends", file: "usageTrends.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
      { title: "Populate Data", file: "populateData.sql" },
    ]
  },
  attendance: {
    order: 2,
    sections: [
      {
        name: "Attendance",
        tables: [
          { title: "Campuses", file: "campuses.sql" },
          { title: "Services", file: "services.sql" },
          { title: "Service Times", file: "serviceTimes.sql" },
          { title: "Group Service Times", file: "groupServiceTimes.sql" },
          { title: "Sessions", file: "sessions.sql" },
          { title: "Settings", file: "settings.sql" },
          { title: "Visits", file: "visits.sql" },
          { title: "Visit Sessions", file: "visitSessions.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
    ]
  },
  content: {
    order: 3,
    sections: [
      {
        name: "Events",
        tables: [
          { title: "Events", file: "events.sql" },
          { title: "Event Exceptions", file: "eventExceptions.sql" },
          { title: "Curated Calendars", file: "curatedCalendars.sql" },
          { title: "Curated Events", file: "curatedEvents.sql" },
        ]
      },
      {
        name: "Streaming",
        tables: [
          { title: "Playlists", file: "playlists.sql" },
          { title: "Sermons", file: "sermons.sql" },
          { title: "Streaming Services", file: "streamingServices.sql" },
        ]
      },
      {
        name: "Content",
        tables: [
          { title: "Blocks", file: "blocks.sql" },
          { title: "Elements", file: "elements.sql" },
          { title: "Global Styles", file: "globalStyles.sql" },
          { title: "Pages", file: "pages.sql" },
          { title: "Sections", file: "sections.sql" },
          { title: "Links", file: "links.sql" },
          { title: "Files", file: "files.sql" },
          { title: "Settings", file: "settings.sql" },
        ]
      },
      {
        name: "Bible",
        tables: [
          { title: "Translations", file: "bibleTranslations.sql" },
          { title: "Books", file: "bibleBooks.sql" },
          { title: "Chapters", file: "bibleChapters.sql" },
          { title: "Verses", file: "bibleVerses.sql" },
          { title: "Verse Texts", file: "bibleVerseTexts.sql" },
          { title: "Lookups", file: "bibleLookups.sql" },
        ]
      },
      {
        name: "Songs",
        tables: [
          { title: "Arrangements", file: "arrangements.sql" },
          { title: "Arrangement Keys", file: "arrangementKeys.sql" },
          { title: "Song Detail Links", file: "songDetailLinks.sql" },
          { title: "Song Details", file: "songDetails.sql" },
          { title: "Songs", file: "songs.sql" },
        ]
      },
      {
        name: "Registrations",
        tables: [
          { title: "Registrations", file: "registrations.sql" },
          { title: "Registration Members", file: "registrationMembers.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
    ]
  },
  giving: {
    order: 4,
    sections: [
      {
        name: "Giving",
        tables: [
          { title: "Funds", file: "funds.sql" },
          { title: "Donations", file: "donations.sql" },
          { title: "Fund Donations", file: "fundDonations.sql" },
          { title: "Donation Batches", file: "donationBatches.sql" },
          { title: "Gateways", file: "gateways.sql" },
          { title: "Customers", file: "customers.sql" },
          { title: "Gateway Payment Methods", file: "gatewayPaymentMethods.sql" },
          { title: "Event Logs", file: "eventLogs.sql" },
          { title: "Settings", file: "settings.sql" },
          { title: "Subscriptions", file: "subscriptions.sql" },
          { title: "Subscription Funds", file: "subscriptionFunds.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
    ]
  },
  messaging: {
    order: 5,
    sections: [
      {
        name: "Messaging",
        tables: [
          { title: "Connections", file: "connections.sql" },
          { title: "Conversations", file: "conversations.sql" },
          { title: "Devices", file: "devices.sql" },
          { title: "Device Contents", file: "deviceContents.sql" },
          { title: "Messages", file: "messages.sql" },
          { title: "Notifications", file: "notifications.sql" },
          { title: "Notification Preferences", file: "notificationPreferences.sql" },
          { title: "Private Messages", file: "privateMessages.sql" },
          { title: "Sent Texts", file: "sentTexts.sql" },
          { title: "Delivery Logs", file: "deliveryLogs.sql" },
          { title: "Email Templates", file: "emailTemplates.sql" },
          { title: "Texting Providers", file: "textingProviders.sql" },
          { title: "Blocked IPs", file: "blockedIps.sql" },
          { title: "Cleanup Procedure", file: "cleanup.sql" },
          { title: "Update Conversation Stats", file: "updateConversationStats.sql" },
          { title: "Cleanup", file: "cleanup.sql" },
          { title: "Delete For Church", file: "deleteForChurch.sql" },
          { title: "Update Conversation Stats", file: "updateConversationStats.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
    ]
  },
  doing: {
    order: 6,
    sections: [
      {
        name: "Tasks",
        tables: [
          { title: "Actions", file: "actions.sql" },
          { title: "Automations", file: "automations.sql" },
          { title: "Tasks", file: "tasks.sql" },
          { title: "Conditions", file: "conditions.sql" },
          { title: "Conjunctions", file: "conjunctions.sql" },
        ]
      },
      {
        name: "Scheduling",
        tables: [
          { title: "Assignments", file: "assignments.sql" },
          { title: "Blockout Dates", file: "blockoutDates.sql" },
          { title: "Notes", file: "notes.sql" },
          { title: "Plans", file: "plans.sql" },
          { title: "Plan Items", file: "planItems.sql" },
          { title: "Plan Types", file: "planTypes.sql" },
          { title: "Positions", file: "positions.sql" },
          { title: "Times", file: "times.sql" },
        ]
      }
    ],
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
    ]
  }
};

interface InitOptions {
  module?: string;
  reset?: boolean;
  environment?: string;
  demoOnly?: boolean;
  schemaOnly?: boolean;
}

async function initializeDatabases(options: InitOptions = {}) {
  try {
    const environment = options.environment || process.env.ENVIRONMENT || 'dev';
    await Environment.init(environment);

    if (options.reset) {
      console.log('🔥 Resetting all databases...');
      await resetDatabases(options);
      return;
    }

    if (options.module) {
      console.log(`🔧 Initializing ${options.module} database...`);
      await initializeModuleDatabase(options.module, options);
      console.log(`✅ ${options.module} database initialization completed!`);
      return;
    }

    console.log('🚀 Initializing Core API databases...');

    // Get modules in order
    const orderedModules = Object.entries(moduleDefinitions)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([name]) => name);

    console.log(`📋 Module order: ${orderedModules.join(' → ')}`);

    for (const moduleName of orderedModules) {
      console.log(`\n🔧 Initializing ${moduleName} database...`);
      await initializeModuleDatabase(moduleName, options);
    }

    console.log('\n✅ All databases initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await KyselyPool.destroyAll();
  }
}

async function initializeModuleDatabase(moduleName: string, options: InitOptions = {}) {
  try {
    const moduleConfig = moduleDefinitions[moduleName as keyof typeof moduleDefinitions];
    if (!moduleConfig) {
      console.log(`⚠️  No configuration found for ${moduleName}, skipping...`);
      return;
    }

    const dbConfig = Environment.getDatabaseConfig(moduleName);
    if (!dbConfig) {
      console.log(`⚠️  No database configuration found for ${moduleName}, skipping...`);
      return;
    }

    // Ensure the database exists
    await ensureDatabaseExists(moduleName, dbConfig);

    // Ensure the Kysely instance exists for this module
    KyselyPool.getDb(moduleName);

    const scriptsPath = path.join(__dirname, 'dbScripts', moduleName);

    if (!fs.existsSync(scriptsPath)) {
      console.log(`⚠️  No database scripts found for ${moduleName} at ${scriptsPath}, skipping...`);
      return;
    }

    if (options.demoOnly) {
      // Only run demo data
      await initializeDemoData(moduleName, moduleConfig.demoTables, scriptsPath);
    } else if (options.schemaOnly) {
      // Only run schema sections, skip demo data
      for (const section of moduleConfig.sections) {
        await initializeSection(moduleName, section.name, section.tables, scriptsPath);
      }
    } else {
      // Run schema sections only (default behavior)
      for (const section of moduleConfig.sections) {
        await initializeSection(moduleName, section.name, section.tables, scriptsPath);
      }
    }

    console.log(`   ✅ ${moduleName} database initialized successfully`);
  } catch (error) {
    console.error(`   ❌ Failed to initialize ${moduleName} database:`, error);
    throw error;
  }
}

async function initializeSection(moduleName: string, sectionName: string, tables: { title: string, file: string }[], scriptsPath: string) {
  if (tables.length === 0) {
    console.log(`   ⏭️  ${sectionName} section is empty, skipping...`);
    return;
  }

  console.log(`   📂 SECTION: ${sectionName}`);

  for (const table of tables) {
    const filePath = path.join(scriptsPath, table.file);

    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  ${table.title}: File ${table.file} not found, skipping...`);
      continue;
    }

    console.log(`   📄 ${table.title}: ${table.file}`);

    const sql = fs.readFileSync(filePath, 'utf8');

    // Skip empty files or placeholder content
    if (sql.includes('-- This file will be populated') || sql.trim().length < 50) {
      console.log(`   ⏭️  Skipping placeholder file: ${table.file}`);
      continue;
    }

    // Split SQL file by statements and handle various SQL delimiters
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      const cleanStatement = statement.trim();
      if (cleanStatement && !cleanStatement.startsWith('--')) {
        try {
          const db = KyselyPool.getDb(moduleName);
          await sql.raw(cleanStatement).execute(db);
        } catch (error) {
          console.error(`   ❌ Failed to execute statement in ${table.file}:`, error);
          console.error(`   Statement: ${cleanStatement.substring(0, 100)}...`);
          throw error;
        }
      }
    }
  }
}

async function initializeDemoData(moduleName: string, demoTables: { title: string, file: string }[], scriptsPath: string) {
  if (demoTables.length === 0) {
    console.log(`   ⚠️  No demo data configured for ${moduleName}, skipping...`);
    return;
  }

  console.log(`   🎭 DEMO DATA`);

  for (const table of demoTables) {
    const filePath = path.join(scriptsPath, table.file);

    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  ${table.title}: File ${table.file} not found, skipping...`);
      continue;
    }

    console.log(`   📄 ${table.title}: ${table.file}`);

    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      const cleanStatement = statement.trim();
      if (cleanStatement && !cleanStatement.startsWith('--')) {
        try {
          const db = KyselyPool.getDb(moduleName);
          await sql.raw(cleanStatement).execute(db);
        } catch (error) {
          console.error(`   ❌ Failed to execute statement in ${table.file}:`, error);
          console.error(`   Statement: ${cleanStatement.substring(0, 100)}...`);
          throw error;
        }
      }
    }
  }
}

async function ensureDatabaseExists(moduleName: string, dbConfig: any) {
  // Connect without specifying database to create it if needed
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port || 3306
  });

  try {
    console.log(`   🏗️  Ensuring database '${dbConfig.database}' exists...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log(`   ✅ Database '${dbConfig.database}' ready`);
  } catch (error) {
    console.error(`   ❌ Failed to ensure database exists for ${moduleName}:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

function splitSqlStatements(sql: string): string[] {
  // Simply split on semicolon at end of line, but handle procedures specially
  const statements: string[] = [];
  const lines = sql.split('\n');
  let current = '';
  let inProcedure = false;
  let procedureContent = '';

  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();
    const originalLine = line;

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('--') || line.trim().startsWith('/*')) {
      continue;
    }

    // Check for stored procedure/function start
    if (trimmedLine.startsWith('CREATE PROCEDURE') || 
        trimmedLine.startsWith('CREATE FUNCTION') ||
        trimmedLine.startsWith('CREATE DEFINER')) {
      inProcedure = true;
      procedureContent = originalLine + '\n';
      continue;
    }

    // Handle DROP statements separately
    if (trimmedLine.startsWith('DROP PROCEDURE') || 
        trimmedLine.startsWith('DROP FUNCTION')) {
      statements.push(originalLine);
      continue;
    }

    // Skip DELIMITER statements - they're MySQL client commands, not SQL
    if (trimmedLine.startsWith('DELIMITER')) {
      continue;
    }

    if (inProcedure) {
      procedureContent += originalLine + '\n';
      // Check for end of procedure - handle various formats
      // END$$ or END // or END; or just END followed by delimiter
      if (trimmedLine === 'END' || 
          trimmedLine === 'END;' || 
          trimmedLine === 'END$$' || 
          trimmedLine === 'END//' || 
          trimmedLine.match(/^END\s*\/\//) || 
          trimmedLine.match(/^END\s*\$\$/)) {
        // Remove any delimiter suffix ($$, //, or whitespace followed by these)
        let cleanProc = procedureContent.trim();
        // Remove $$ or // at the end, including any spaces before them
        cleanProc = cleanProc.replace(/\s*(\/\/|\$\$)\s*$/, '');
        statements.push(cleanProc);
        procedureContent = '';
        inProcedure = false;
      }
    } else {
      current += originalLine + '\n';
      // Normal statement ends with semicolon
      if (originalLine.trim().endsWith(';')) {
        if (current.trim()) {
          statements.push(current.trim());
          current = '';
        }
      }
    }
  }

  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }
  if (procedureContent.trim()) {
    statements.push(procedureContent.trim());
  }

  return statements.filter(stmt => stmt.length > 0);
}

async function resetDatabases(options: InitOptions = {}) {
  console.log('⚠️  WARNING: This will drop and recreate all databases!');
  console.log('   This action cannot be undone.');

  // Get modules in order
  const orderedModules = Object.entries(moduleDefinitions)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([name]) => name);

  for (const moduleName of orderedModules) {
    const dbConfig = Environment.getDatabaseConfig(moduleName);
    if (!dbConfig) {
      console.log(`⏭️  No configuration for ${moduleName}, skipping...`);
      continue;
    }

    console.log(`\n🗑️  Resetting ${moduleName} database...`);
    await resetModuleDatabase(moduleName, dbConfig);

    console.log(`🔧 Re-initializing ${moduleName} database...`);
    await initializeModuleDatabase(moduleName, options);
  }

  console.log('\n🔥 Database reset completed!');
}

async function resetModuleDatabase(moduleName: string, dbConfig: any) {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port || 3306
  });

  try {
    console.log(`   🗑️  Dropping database '${dbConfig.database}'...`);
    await connection.execute(`DROP DATABASE IF EXISTS \`${dbConfig.database}\``);

    console.log(`   🏗️  Creating database '${dbConfig.database}'...`);
    await connection.execute(`CREATE DATABASE \`${dbConfig.database}\``);

    console.log(`   ✅ ${moduleName} database reset completed`);
  } catch (error) {
    console.error(`   ❌ Failed to reset ${moduleName} database:`, error);
    throw error;
  } finally {
    await connection.end();
  }
}

function parseArguments(): InitOptions {
  const args = process.argv.slice(2);
  const options: InitOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--module=')) {
      options.module = arg.split('=')[1];
    } else if (arg === '--reset') {
      options.reset = true;
    } else if (arg.startsWith('--environment=')) {
      options.environment = arg.split('=')[1];
    } else if (arg === '--demo-only') {
      options.demoOnly = true;
    } else if (arg === '--schema-only') {
      options.schemaOnly = true;
    }
  }

  // Validate module name if provided
  const validModules = Object.keys(moduleDefinitions);
  if (options.module && !validModules.includes(options.module)) {
    console.error(`❌ Invalid module: ${options.module}`);
    console.error(`   Valid modules: ${validModules.join(', ')}`);
    process.exit(1);
  }

  return options;
}

// Main execution
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const options = parseArguments();
  initializeDatabases(options);
}
