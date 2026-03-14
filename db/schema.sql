-- CoreInventory Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'staff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Locations (sub-locations within warehouses)
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) DEFAULT 'rack',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(80),
    unit VARCHAR(30) DEFAULT 'units',
    current_stock NUMERIC(12,2) DEFAULT 0,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    daily_usage NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Receipts (incoming stock)
CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50),
    supplier VARCHAR(150),
    status VARCHAR(30) DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receipt_lines (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Deliveries (outgoing stock)
CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50),
    customer VARCHAR(150),
    status VARCHAR(30) DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_lines (
    id SERIAL PRIMARY KEY,
    delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Internal Transfers
CREATE TABLE IF NOT EXISTS transfers (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50),
    from_location_id INTEGER NOT NULL REFERENCES locations(id),
    to_location_id INTEGER NOT NULL REFERENCES locations(id),
    status VARCHAR(30) DEFAULT 'draft',
    created_by INTEGER REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transfer_lines (
    id SERIAL PRIMARY KEY,
    transfer_id INTEGER NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Inventory Adjustments
CREATE TABLE IF NOT EXISTS adjustments (
    id SERIAL PRIMARY KEY,
    reference VARCHAR(50),
    product_id INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER REFERENCES locations(id),
    recorded_qty NUMERIC(12,2) NOT NULL,
    physical_qty NUMERIC(12,2) NOT NULL,
    adjustment_qty NUMERIC(12,2) NOT NULL,
    reason TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movements (ledger)
CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    from_location VARCHAR(150),
    to_location VARCHAR(150),
    quantity NUMERIC(12,2) NOT NULL,
    operation_type VARCHAR(30) NOT NULL,
    reference VARCHAR(80),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(operation_type);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
