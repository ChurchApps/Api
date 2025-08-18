#!/usr/bin/env node

/**
 * Migration script to convert old .env format to new connection string format
 */
const fs = require('fs');
const path = require('path');

const MODULES = ['membership', 'attendance', 'content', 'giving', 'messaging', 'doing'];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const env = {};
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key] = valueParts.join('=');
      }
    }
  }
  
  return { env, lines };
}

function buildConnectionString(module, env) {
  const prefix = module.toUpperCase();
  const host = env[`${prefix}_DB_HOST`];
  const user = env[`${prefix}_DB_USER`];
  const password = env[`${prefix}_DB_PASSWORD`];
  const database = env[`${prefix}_DB_DATABASE`];
  const port = env[`${prefix}_DB_PORT`] || '3306';
  
  if (!host || !database) {
    return null; // Missing required components
  }
  
  const userPart = password ? `${user}:${password}` : user;
  return `mysql://${userPart}@${host}:${port}/${database}`;
}

function migrateEnvFile(inputPath, outputPath) {
  console.log(`🔄 Migrating ${inputPath} to connection string format...`);
  
  const { env, lines } = parseEnvFile(inputPath);
  const newLines = [];
  const processedKeys = new Set();
  const connectionStrings = {};
  
  // Generate connection strings for each module
  for (const module of MODULES) {
    const connectionString = buildConnectionString(module, env);
    if (connectionString) {
      connectionStrings[module] = connectionString;
      console.log(`  ✅ ${module}: Found database config`);
    } else {
      console.log(`  ⚠️  ${module}: No database config found`);
    }
  }
  
  // Process existing lines
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip old database config lines
    let shouldSkip = false;
    for (const module of MODULES) {
      const prefix = module.toUpperCase();
      if (trimmed.startsWith(`${prefix}_DB_HOST=`) ||
          trimmed.startsWith(`${prefix}_DB_USER=`) ||
          trimmed.startsWith(`${prefix}_DB_PASSWORD=`) ||
          trimmed.startsWith(`${prefix}_DB_DATABASE=`) ||
          trimmed.startsWith(`${prefix}_DB_PORT=`)) {
        shouldSkip = true;
        break;
      }
    }
    
    if (!shouldSkip) {
      newLines.push(line);
    }
  }
  
  // Add database connection strings section
  if (Object.keys(connectionStrings).length > 0) {
    newLines.push('');
    newLines.push('# Database Connection Strings (mysql://user:password@host:port/database)');
    
    for (const module of MODULES) {
      if (connectionStrings[module]) {
        newLines.push(`${module.toUpperCase()}_DB_URL=${connectionStrings[module]}`);
      }
    }
  }
  
  // Write the new file
  fs.writeFileSync(outputPath, newLines.join('\n'));
  console.log(`✅ Migration completed! New file saved as: ${outputPath}`);
  
  // Summary
  const migratedCount = Object.keys(connectionStrings).length;
  console.log(`\n📊 Migration Summary:`);
  console.log(`  - Modules migrated: ${migratedCount}/${MODULES.length}`);
  console.log(`  - Connection strings created: ${migratedCount}`);
  
  if (migratedCount > 0) {
    console.log(`\n🔍 Review the new connection strings in ${outputPath}`);
    console.log(`💡 Test with: npm run initdb`);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const inputFile = args[0] || '.env';
  const outputFile = args[1] || '.env.new';
  
  try {
    const inputPath = path.resolve(inputFile);
    const outputPath = path.resolve(outputFile);
    
    if (inputPath === outputPath) {
      console.error('❌ Input and output files cannot be the same');
      process.exit(1);
    }
    
    migrateEnvFile(inputPath, outputPath);
    
    console.log(`\n📝 Next steps:`);
    console.log(`  1. Review ${outputFile}`);
    console.log(`  2. Backup your current .env: mv .env .env.backup`);
    console.log(`  3. Use the new format: mv ${outputFile} .env`);
    console.log(`  4. Test: npm run initdb`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  console.log('🚀 Database Environment Migration Tool\n');
  main();
}