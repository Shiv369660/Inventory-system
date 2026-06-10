// Database optimization — adds missing indexes and runs PRAGMA optimize
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'coreinventory.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status)',
  'CREATE INDEX IF NOT EXISTS idx_receipts_created_by ON receipts(created_by)',
  'CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)',
  'CREATE INDEX IF NOT EXISTS idx_deliveries_created_by ON deliveries(created_by)',
  'CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status)',
  'CREATE INDEX IF NOT EXISTS idx_receipt_lines_receipt ON receipt_lines(receipt_id)',
  'CREATE INDEX IF NOT EXISTS idx_delivery_lines_delivery ON delivery_lines(delivery_id)',
  'CREATE INDEX IF NOT EXISTS idx_transfer_lines_transfer ON transfer_lines(transfer_id)',
  'CREATE INDEX IF NOT EXISTS idx_adjustments_product ON adjustments(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_location ON products(location_id)',
  'CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations(warehouse_id)',
];

indexes.forEach(stmt => {
  try {
    db.exec(stmt);
    const name = stmt.match(/idx_\w+/)[0];
    console.log('✓ Created index:', name);
  } catch (e) {
    console.log('⚠ Skip:', e.message);
  }
});

db.pragma('optimize');
console.log('\n✓ PRAGMA optimize: done');

const allIdx = db.prepare(
  "SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name"
).all();
console.log('\nAll indexes in database:');
allIdx.forEach(i => console.log(' ', i.tbl_name + '.' + i.name));

db.close();
console.log('\n✓ Database optimization complete.');
