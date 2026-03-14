const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'coreinventory.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Wrapper to provide pg-like query interface
const pool = {
  query: (text, params = []) => {
    // Convert PostgreSQL $1, $2... placeholders to SQLite ?
    let sqliteText = text;
    let paramIndex = 0;
    sqliteText = sqliteText.replace(/\$(\d+)/g, () => '?');

    // Convert PostgreSQL-specific syntax to SQLite
    sqliteText = sqliteText.replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    sqliteText = sqliteText.replace(/NUMERIC\(\d+,\d+\)/gi, 'REAL');
    sqliteText = sqliteText.replace(/VARCHAR\(\d+\)/gi, 'TEXT');
    sqliteText = sqliteText.replace(/TIMESTAMP/gi, 'TEXT');
    sqliteText = sqliteText.replace(/ILIKE/gi, 'LIKE');
    sqliteText = sqliteText.replace(/NOW\(\)/gi, "datetime('now')");
    sqliteText = sqliteText.replace(/CURRENT_TIMESTAMP/gi, "datetime('now')");
    sqliteText = sqliteText.replace(/INTERVAL '(\d+) days?'/gi, "'$1 days'");
    sqliteText = sqliteText.replace(/INTERVAL '(\d+) hours?'/gi, "'$1 hours'");
    sqliteText = sqliteText.replace(/NOW\(\)\s*-\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')");
    sqliteText = sqliteText.replace(/NOW\(\)\s*-\s*'(\d+)\s*hours?'/gi, "datetime('now', '-$1 hours')");
    sqliteText = sqliteText.replace(/datetime\('now'\)\s*-\s*INTERVAL\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')");
    sqliteText = sqliteText.replace(/datetime\('now'\)\s*-\s*INTERVAL\s*'(\d+)\s*hours?'/gi, "datetime('now', '-$1 hours')");
    sqliteText = sqliteText.replace(/datetime\('now'\)\s*-\s*'(\d+)\s*days?'/gi, "datetime('now', '-$1 days')");
    sqliteText = sqliteText.replace(/datetime\('now'\)\s*-\s*'(\d+)\s*hours?'/gi, "datetime('now', '-$1 hours')");
    // FILTER (WHERE ...) syntax -> CASE WHEN ... THEN 1 ELSE NULL END
    sqliteText = sqliteText.replace(/COUNT\(\*\)\s*FILTER\s*\(WHERE\s+(.+?)\)\s+as\s+(\w+)/gi,
      'SUM(CASE WHEN $1 THEN 1 ELSE 0 END) as $2');
    sqliteText = sqliteText.replace(/NULLIF\((\w+),\s*0\)/gi, 'CASE WHEN $1 = 0 THEN NULL ELSE $1 END');
    sqliteText = sqliteText.replace(/ROUND\((.+?),\s*(\d+)\)/gi, 'ROUND($1, $2)');
    sqliteText = sqliteText.replace(/DATE\((\w+)\)/gi, 'date($1)');
    // ON CONFLICT (email) DO NOTHING
    sqliteText = sqliteText.replace(/ON CONFLICT \(\w+\) DO NOTHING/gi, 'ON CONFLICT DO NOTHING');
    const trimmed = sqliteText.trim();
    const hasReturning = /RETURNING\s+/i.test(trimmed);

    try {
      if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('WITH') || hasReturning) {
        const rows = db.prepare(trimmed).all(...params);
        return { rows, rowCount: rows.length };
      } else {
        const info = db.prepare(trimmed).run(...params);
        return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
      }
    } catch (err) {
      // Handle unique constraint violations
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        err.code = '23505'; // PostgreSQL unique violation code
      }
      throw err;
    }
  },
  connect: () => {
    // For transaction support, return a client-like object
    return Promise.resolve({
      query: (text, params) => {
        const trimmedText = text.trim().toUpperCase();
        if (trimmedText === 'BEGIN') {
          db.exec('BEGIN');
          return Promise.resolve({ rows: [] });
        }
        if (trimmedText === 'COMMIT') {
          db.exec('COMMIT');
          return Promise.resolve({ rows: [] });
        }
        if (trimmedText === 'ROLLBACK') {
          try { db.exec('ROLLBACK'); } catch(e) { /* no active transaction */ }
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve(pool.query(text, params));
      },
      release: () => {}
    });
  }
};

// Initialize database
function initializeDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'rack',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      category TEXT,
      unit TEXT DEFAULT 'units',
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 20,
      supplier_email TEXT DEFAULT 'supplier@example.com',
      price REAL DEFAULT 0,
      location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
      daily_usage REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      supplier TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      validated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS receipt_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      customer TEXT,
      status TEXT DEFAULT 'draft',
      created_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      validated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS delivery_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      from_location_id INTEGER NOT NULL REFERENCES locations(id),
      to_location_id INTEGER NOT NULL REFERENCES locations(id),
      status TEXT DEFAULT 'draft',
      created_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      validated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS transfer_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      location_id INTEGER REFERENCES locations(id),
      recorded_qty REAL NOT NULL,
      physical_qty REAL NOT NULL,
      adjustment_qty REAL NOT NULL,
      reason TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      from_location TEXT,
      to_location TEXT,
      quantity REAL NOT NULL,
      operation_type TEXT NOT NULL,
      reference TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Create indexes
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(created_at);
      CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(operation_type);
    `);
  } catch (e) { /* indexes may already exist */ }

  // Migrations for existing databases
  try { db.exec("ALTER TABLE products ADD COLUMN min_stock REAL DEFAULT 20;"); } catch (e) { /* column may already exist */ }
  try { db.exec("ALTER TABLE products ADD COLUMN supplier_email TEXT DEFAULT 'supplier@example.com';"); } catch (e) { /* column may already exist */ }
  try { db.exec("ALTER TABLE products ADD COLUMN price REAL DEFAULT 0;"); } catch (e) { /* column may already exist */ }

  // Seed demo data if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    seedDatabase();
  }
}

function seedDatabase() {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('admin123', 10);

  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  insertUser.run('Admin User', 'admin@coreinventory.com', hash, 'admin');

  db.prepare('INSERT INTO warehouses (name, address) VALUES (?, ?)').run('Warehouse A', '123 Industrial Blvd, Sector 5');
  db.prepare('INSERT INTO warehouses (name, address) VALUES (?, ?)').run('Warehouse B', '456 Logistics Park, Zone 3');

  const locs = [
    [1, 'Rack A1', 'rack'], [1, 'Rack A2', 'rack'], [1, 'Rack B1', 'rack'],
    [2, 'Rack C1', 'rack'], [2, 'Rack C2', 'rack'], [2, 'Cold Storage', 'cold']
  ];
  const insertLoc = db.prepare('INSERT INTO locations (warehouse_id, name, type) VALUES (?, ?, ?)');
  locs.forEach(l => insertLoc.run(...l));

  const products = [
    ['Steel Rods 12mm', 'STL-ROD-12', 'Raw Materials', 'pieces', 450, 1, 15],
    ['Copper Wire 2mm', 'COP-WIR-02', 'Raw Materials', 'meters', 1200, 1, 40],
    ['Aluminum Sheet 3mm', 'ALU-SHT-03', 'Raw Materials', 'sheets', 80, 2, 5],
    ['Hex Bolt M10', 'HEX-BLT-10', 'Fasteners', 'pieces', 5000, 2, 100],
    ['Spring Washer M8', 'SPR-WSH-08', 'Fasteners', 'pieces', 3000, 3, 50],
    ['Bearing 6204', 'BRG-6204', 'Components', 'pieces', 200, 3, 8],
    ['Hydraulic Pump HP200', 'HYD-PMP-200', 'Machinery', 'units', 12, 4, 0.5],
    ['Motor 5HP AC', 'MTR-5HP-AC', 'Machinery', 'units', 25, 4, 1],
    ['PVC Pipe 4inch', 'PVC-PIP-04', 'Plumbing', 'meters', 600, 5, 20],
    ['Cable 4sqmm', 'CBL-4SQ', 'Electrical', 'meters', 900, 5, 30],
    ['LED Panel 40W', 'LED-PNL-40', 'Electrical', 'pieces', 150, 6, 3],
    ['Coolant Fluid X1', 'CLN-FLD-X1', 'Chemicals', 'liters', 300, 6, 10],
    ['Safety Helmet SH1', 'SFT-HLM-01', 'Safety', 'pieces', 45, 1, 2],
    ['Welding Rod E6013', 'WLD-ROD-13', 'Consumables', 'kg', 120, 2, 8],
    ['Lubricant Oil 20W', 'LUB-OIL-20', 'Chemicals', 'liters', 5, 3, 2]
  ];
  const insertProd = db.prepare('INSERT INTO products (name, sku, category, unit, current_stock, location_id, daily_usage) VALUES (?, ?, ?, ?, ?, ?, ?)');
  products.forEach(p => insertProd.run(...p));

  // Sample movements
  const movements = [
    [1, 'Supplier: SteelCorp', 'Warehouse A / Rack A1', 100, 'receipt', 'REC-001'],
    [2, 'Supplier: CopperTech', 'Warehouse A / Rack A1', 500, 'receipt', 'REC-002'],
    [1, 'Warehouse A / Rack A1', 'Warehouse A / Rack B1', 30, 'transfer', 'TRF-001'],
    [4, 'Warehouse A / Rack A2', 'Customer: BuildPro', 200, 'delivery', 'DEL-001'],
    [7, 'Warehouse B / Rack C1', 'Adjustment', -2, 'adjustment', 'ADJ-001'],
    [10, 'Supplier: CableMart', 'Warehouse B / Rack C2', 300, 'receipt', 'REC-003'],
    [15, 'Warehouse A / Rack B1', 'Customer: AutoWorks', 3, 'delivery', 'DEL-002'],
    [3, 'Supplier: AluTech', 'Warehouse A / Rack A2', 50, 'receipt', 'REC-004']
  ];
  const insertMov = db.prepare("INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))");
  movements.forEach((m, i) => insertMov.run(...m, (movements.length - i) * 12));

  // Sample receipts
  db.prepare("INSERT INTO receipts (reference, supplier, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, datetime('now', '-5 days'), datetime('now', '-5 days'))").run('REC-001', 'SteelCorp Industries', 'validated', 1);
  db.prepare("INSERT INTO receipts (reference, supplier, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, datetime('now', '-4 days'), datetime('now', '-4 days'))").run('REC-002', 'CopperTech Ltd', 'validated', 1);
  db.prepare("INSERT INTO receipts (reference, supplier, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, datetime('now', '-12 hours'), datetime('now', '-12 hours'))").run('REC-003', 'CableMart Supplies', 'validated', 1);
  db.prepare("INSERT INTO receipts (reference, supplier, status, created_by, created_at) VALUES (?, ?, ?, ?, datetime('now', '-3 hours'))").run('REC-004', 'AluTech Corp', 'draft', 1);

  db.prepare('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES (?, ?, ?)').run(1, 1, 100);
  db.prepare('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES (?, ?, ?)').run(2, 2, 500);
  db.prepare('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES (?, ?, ?)').run(3, 10, 300);
  db.prepare('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES (?, ?, ?)').run(4, 3, 50);

  // Sample deliveries
  db.prepare("INSERT INTO deliveries (reference, customer, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'))").run('DEL-001', 'BuildPro Construction', 'validated', 1);
  db.prepare("INSERT INTO deliveries (reference, customer, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, datetime('now', '-6 hours'), datetime('now', '-6 hours'))").run('DEL-002', 'AutoWorks Services', 'validated', 1);
  db.prepare("INSERT INTO deliveries (reference, customer, status, created_by, created_at) VALUES (?, ?, ?, ?, datetime('now', '-1 hours'))").run('DEL-003', 'MegaBuild Inc', 'draft', 1);

  db.prepare('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES (?, ?, ?)').run(1, 4, 200);
  db.prepare('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES (?, ?, ?)').run(2, 15, 3);
  db.prepare('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES (?, ?, ?)').run(3, 1, 50);

  // Sample transfer
  db.prepare("INSERT INTO transfers (reference, from_location_id, to_location_id, status, created_by, created_at, validated_at) VALUES (?, ?, ?, ?, ?, datetime('now', '-3 days'), datetime('now', '-3 days'))").run('TRF-001', 1, 3, 'validated', 1);
  db.prepare('INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES (?, ?, ?)').run(1, 1, 30);

  // Sample adjustment
  db.prepare('INSERT INTO adjustments (reference, product_id, location_id, recorded_qty, physical_qty, adjustment_qty, reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('ADJ-001', 7, 4, 14, 12, -2, 'Damaged during transport', 1);

  console.log('Database seeded with demo data');
}

// Run initialization
initializeDatabase();

module.exports = pool;
