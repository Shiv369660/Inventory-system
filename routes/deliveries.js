const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Deliveries page
router.get('/', async (req, res) => {
  try {
    const deliveries = await pool.query(`SELECT d.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM delivery_lines WHERE delivery_id = d.id) as line_count,
      (SELECT COALESCE(SUM(quantity),0) FROM delivery_lines WHERE delivery_id = d.id) as total_qty
      FROM deliveries d LEFT JOIN users u ON d.created_by = u.id ORDER BY d.created_at DESC`);
    const products = await pool.query('SELECT id, name, sku, current_stock FROM products ORDER BY name');
    res.render('deliveries', { title: 'Deliveries', deliveries: deliveries.rows, products: products.rows });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load deliveries' }); }
});

// Get delivery details
router.get('/api/:id', async (req, res) => {
  try {
    const delivery = await pool.query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
    if (delivery.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lines = await pool.query(`SELECT dl.*, p.name as product_name, p.sku, p.current_stock FROM delivery_lines dl JOIN products p ON dl.product_id = p.id WHERE dl.delivery_id = $1`, [req.params.id]);
    res.json({ ...delivery.rows[0], lines: lines.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get delivery' }); }
});

// Create delivery
router.post('/api', async (req, res) => {
  try {
    const { customer, notes, lines } = req.body;
    if (!customer || !lines || lines.length === 0) return res.status(400).json({ error: 'Customer and at least one product line required' });
    const ref = 'DEL-' + String(Date.now()).slice(-6);
    const result = await pool.query('INSERT INTO deliveries (reference, customer, status, created_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [ref, customer, 'draft', req.session.userId, notes || null]);
    const deliveryId = result.rows[0].id;
    for (const line of lines) {
      await pool.query('INSERT INTO delivery_lines (delivery_id, product_id, quantity) VALUES ($1,$2,$3)', [deliveryId, line.product_id, line.quantity]);
    }
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create delivery' }); }
});

// Validate delivery (decrements stock)
router.post('/api/:id/validate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const delivery = await client.query("SELECT * FROM deliveries WHERE id = $1 AND status = 'draft'", [req.params.id]);
    if (delivery.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Delivery not found or already validated' }); }
    const lines = await client.query('SELECT dl.*, p.name as product_name, p.current_stock, l.name as loc_name, w.name as wh_name FROM delivery_lines dl JOIN products p ON dl.product_id = p.id LEFT JOIN locations l ON p.location_id = l.id LEFT JOIN warehouses w ON l.warehouse_id = w.id WHERE dl.delivery_id = $1', [req.params.id]);
    for (const line of lines.rows) {
      if (parseFloat(line.current_stock) < parseFloat(line.quantity)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient stock for ${line.product_name}. Available: ${line.current_stock}` });
      }
      await client.query('UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2', [line.quantity, line.product_id]);
      const fromLoc = line.wh_name ? `${line.wh_name} / ${line.loc_name}` : 'Warehouse';
      await client.query('INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference) VALUES ($1,$2,$3,$4,$5,$6)',
        [line.product_id, fromLoc, `Customer: ${delivery.rows[0].customer}`, line.quantity, 'delivery', delivery.rows[0].reference]);
    }
    await client.query("UPDATE deliveries SET status = 'validated', validated_at = NOW() WHERE id = $1", [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Failed to validate delivery' }); }
  finally { client.release(); }
});

module.exports = router;
