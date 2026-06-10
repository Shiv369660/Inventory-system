const fs = require('fs');
const path = require('path');

console.log('=== CoreInventory Deployment Configuration Validator ===');
let hasErrors = false;
let hasWarnings = false;

// 1. Check netlify.toml
const tomlPath = path.join(__dirname, '..', 'netlify.toml');
console.log('\n[1/4] Checking netlify.toml...');
if (!fs.existsSync(tomlPath)) {
  console.error('❌ ERROR: netlify.toml file is missing!');
  hasErrors = true;
} else {
  try {
    const tomlContent = fs.readFileSync(tomlPath, 'utf8');
    const checks = [
      { name: 'publish folder', pattern: /publish\s*=\s*"public"/, fix: 'publish = "public"' },
      { name: 'functions folder', pattern: /functions\s*=\s*"netlify\/functions"/, fix: 'functions = "netlify/functions"' },
      { name: 'views inclusion', pattern: /"views\/\*\*"/, fix: 'views/** in included_files' },
      { name: 'db inclusion', pattern: /"db\/coreinventory\.db"/, fix: 'db/coreinventory.db in included_files' },
      { name: 'redirect rule', pattern: /to\s*=\s*"\/.netlify\/functions\/api"/, fix: 'redirect to /.netlify/functions/api' }
    ];

    checks.forEach(check => {
      if (check.pattern.test(tomlContent)) {
        console.log(`  ✅ ${check.name} configuration verified`);
      } else {
        console.error(`  ❌ ERROR: Missing or invalid ${check.name} (${check.fix})`);
        hasErrors = true;
      }
    });
  } catch (err) {
    console.error('  ❌ ERROR: Failed to read netlify.toml:', err.message);
    hasErrors = true;
  }
}

// 2. Check Environmental Variables & .env file
console.log('\n[2/4] Checking environment configuration...');
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('  ⚠️ WARNING: .env file is missing from local path (using default system/provider environment settings)');
  hasWarnings = true;
} else {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const secretMatch = envContent.match(/SESSION_SECRET\s*=\s*(.*)/);
    if (secretMatch) {
      const value = secretMatch[1].trim().replace(/['"]/g, '');
      if (value === 'dev-secret-CHANGE-IN-PRODUCTION' || value === '') {
        console.log('  ⚠️ WARNING: SESSION_SECRET is unset or using unsafe default values');
        hasWarnings = true;
      } else {
        console.log('  ✅ SESSION_SECRET environment variable format verified');
      }
    } else {
      console.log('  ⚠️ WARNING: SESSION_SECRET is not explicitly declared in .env');
      hasWarnings = true;
    }
  } catch (err) {
    console.log('  ⚠️ WARNING: Failed to read .env file:', err.message);
    hasWarnings = true;
  }
}

// 3. Check Database integrity and schema state
console.log('\n[3/4] Checking SQLite Database configuration & integrity...');
const dbFilePath = path.join(__dirname, '..', 'db', 'coreinventory.db');
if (!fs.existsSync(dbFilePath)) {
  console.log('  ⚠️ WARNING: db/coreinventory.db database file does not exist locally (will be seeded dynamically on function build/init)');
  hasWarnings = true;
} else {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbFilePath, { fileMustExist: true });
    
    // Verify core tables
    const requiredTables = ['users', 'warehouses', 'locations', 'products', 'receipts', 'deliveries', 'transfers', 'adjustments', 'movements'];
    let tablesOk = true;
    
    requiredTables.forEach(table => {
      const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
      const row = stmt.get(table);
      if (row) {
        console.log(`  ✅ Table '${table}' structure verified`);
      } else {
        console.error(`  ❌ ERROR: Table '${table}' is missing from schema`);
        tablesOk = false;
        hasErrors = true;
      }
    });

    if (tablesOk) {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      console.log(`  ✅ Database integrity verified (${userCount.count} users configured)`);
    }
    db.close();
  } catch (err) {
    console.error('  ❌ ERROR: Failed to access SQLite database file:', err.message);
    hasErrors = true;
  }
}

// 4. Server configuration verify
console.log('\n[4/4] Checking Server Entrypoint...');
const serverPath = path.join(__dirname, '..', 'server.js');
if (!fs.existsSync(serverPath)) {
  console.error('❌ ERROR: server.js file is missing!');
  hasErrors = true;
} else {
  try {
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    if (serverContent.includes('module.exports = app')) {
      console.log('  ✅ server.js app export configuration verified');
    } else {
      console.error('  ❌ ERROR: server.js must export the Express app object (module.exports = app) for Netlify wrapper integration');
      hasErrors = true;
    }
  } catch (err) {
    console.error('  ❌ ERROR: Failed to parse server.js:', err.message);
    hasErrors = true;
  }
}

console.log('\n========================================================');
if (hasErrors) {
  console.error('❌ CONFIGURATION VALIDATION FAILED: Correct errors before deploying!');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️ CONFIGURATION PASSED WITH WARNINGS: Review security alerts above before prod deployment.');
  process.exit(0);
} else {
  console.log('✅ CONFIGURATION VALIDATION SUCCESSFUL: Project config is healthy!');
  process.exit(0);
}
