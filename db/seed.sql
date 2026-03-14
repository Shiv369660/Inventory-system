-- Seed data for CoreInventory demo

-- Demo user (password: admin123)
INSERT INTO users (name, email, password_hash, role) VALUES
('Admin User', 'admin@coreinventory.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Warehouses
INSERT INTO warehouses (name, address) VALUES
('Warehouse A', '123 Industrial Blvd, Sector 5'),
('Warehouse B', '456 Logistics Park, Zone 3');

-- Locations
INSERT INTO locations (warehouse_id, name, type) VALUES
(1, 'Rack A1', 'rack'),
(1, 'Rack A2', 'rack'),
(1, 'Rack B1', 'rack'),
(2, 'Rack C1', 'rack'),
(2, 'Rack C2', 'rack'),
(2, 'Cold Storage', 'cold');

-- Products
INSERT INTO products (name, sku, category, unit, current_stock, location_id, daily_usage) VALUES
('Steel Rods 12mm', 'STL-ROD-12', 'Raw Materials', 'pieces', 450, 1, 15),
('Copper Wire 2mm', 'COP-WIR-02', 'Raw Materials', 'meters', 1200, 1, 40),
('Aluminum Sheet 3mm', 'ALU-SHT-03', 'Raw Materials', 'sheets', 80, 2, 5),
('Hex Bolt M10', 'HEX-BLT-10', 'Fasteners', 'pieces', 5000, 2, 100),
('Spring Washer M8', 'SPR-WSH-08', 'Fasteners', 'pieces', 3000, 3, 50),
('Bearing 6204', 'BRG-6204', 'Components', 'pieces', 200, 3, 8),
('Hydraulic Pump HP200', 'HYD-PMP-200', 'Machinery', 'units', 12, 4, 0.5),
('Motor 5HP AC', 'MTR-5HP-AC', 'Machinery', 'units', 25, 4, 1),
('PVC Pipe 4inch', 'PVC-PIP-04', 'Plumbing', 'meters', 600, 5, 20),
('Cable 4sqmm', 'CBL-4SQ', 'Electrical', 'meters', 900, 5, 30),
('LED Panel 40W', 'LED-PNL-40', 'Electrical', 'pieces', 150, 6, 3),
('Coolant Fluid X1', 'CLN-FLD-X1', 'Chemicals', 'liters', 300, 6, 10),
('Safety Helmet SH1', 'SFT-HLM-01', 'Safety', 'pieces', 45, 1, 2),
('Welding Rod E6013', 'WLD-ROD-13', 'Consumables', 'kg', 120, 2, 8),
('Lubricant Oil 20W', 'LUB-OIL-20', 'Chemicals', 'liters', 5, 3, 2);

-- Sample movements
INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference, created_at) VALUES
(1, 'Supplier: SteelCorp', 'Warehouse A / Rack A1', 100, 'receipt', 'REC-001', NOW() - INTERVAL '5 days'),
(2, 'Supplier: CopperTech', 'Warehouse A / Rack A1', 500, 'receipt', 'REC-002', NOW() - INTERVAL '4 days'),
(1, 'Warehouse A / Rack A1', 'Warehouse A / Rack B1', 30, 'transfer', 'TRF-001', NOW() - INTERVAL '3 days'),
(4, 'Warehouse A / Rack A2', 'Customer: BuildPro', 200, 'delivery', 'DEL-001', NOW() - INTERVAL '2 days'),
(7, 'Warehouse B / Rack C1', 'Adjustment', -2, 'adjustment', 'ADJ-001', NOW() - INTERVAL '1 day'),
(10, 'Supplier: CableMart', 'Warehouse B / Rack C2', 300, 'receipt', 'REC-003', NOW() - INTERVAL '12 hours'),
(15, 'Warehouse A / Rack B1', 'Customer: AutoWorks', 3, 'delivery', 'DEL-002', NOW() - INTERVAL '6 hours'),
(3, 'Supplier: AluTech', 'Warehouse A / Rack A2', 50, 'receipt', 'REC-004', NOW() - INTERVAL '3 hours');

-- Sample receipts
INSERT INTO receipts (reference, supplier, status, created_by, created_at, validated_at) VALUES
('REC-001', 'SteelCorp Industries', 'validated', 1, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
('REC-002', 'CopperTech Ltd', 'validated', 1, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
('REC-003', 'CableMart Supplies', 'validated', 1, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours'),
('REC-004', 'AluTech Corp', 'draft', 1, NOW() - INTERVAL '3 hours', NULL);

INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES
(1, 1, 100), (2, 2, 500), (3, 10, 300), (4, 3, 50);

-- Sample deliveries
INSERT INTO deliveries (reference, customer, status, created_by, created_at, validated_at) VALUES
('DEL-001', 'BuildPro Construction', 'validated', 1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
('DEL-002', 'AutoWorks Services', 'validated', 1, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours'),
('DEL-003', 'MegaBuild Inc', 'draft', 1, NOW() - INTERVAL '1 hour', NULL);

INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES
(1, 4, 200), (2, 15, 3), (3, 1, 50);

-- Sample transfer
INSERT INTO transfers (reference, from_location_id, to_location_id, status, created_by, created_at, validated_at) VALUES
('TRF-001', 1, 3, 'validated', 1, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES
(1, 1, 30);

-- Sample adjustment
INSERT INTO adjustments (reference, product_id, location_id, recorded_qty, physical_qty, adjustment_qty, reason, created_by) VALUES
('ADJ-001', 7, 4, 14, 12, -2, 'Damaged during transport', 1);
