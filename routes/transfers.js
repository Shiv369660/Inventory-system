const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Transfers page
router.get('/', async (req, res) => {
  try {
    const transfers = await pool.query(`SELECT t.*, fl.name as from_loc, tl.name as to_loc, fw.name as from_wh, tw.name as to_wh, u.name as created_by_name,
      (SELECT COALESCE(SUM(quantity),0) FROM transfer_lines WHERE transfer_id = t.id) as total_qty
      FROM transfers t JOIN locations fl ON t.from_location_id = fl.id JOIN locations tl ON t.to_location_id = tl.id
      JOIN warehouses fw ON fl.warehouse_id = fw.id JOIN warehouses tw ON tl.warehouse_id = tw.id
      LEFT JOIN users u ON t.created_by = u.id ORDER BY t.created_at DESC`);
    const locations = await pool.query('SELECT l.id, l.name, w.name as warehouse_name FROM locations l JOIN warehouses w ON l.warehouse_id = w.id ORDER BY w.name, l.name');
    const products = await pool.query('SELECT id, name, sku, current_stock FROM products ORDER BY name');
    res.render('transfers', { title: 'Transfers', transfers: transfers.rows, locations: locations.rows, products: products.rows });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load transfers' }); }
});

// Create transfer
router.post('/api', async (req, res) => {
  try {
    const { from_location_id, to_location_id, notes, lines } = req.body;
    if (!from_location_id || !to_location_id || !lines || lines.length === 0) return res.status(400).json({ error: 'Locations and at least one product required' });
    if (from_location_id === to_location_id) return res.status(400).json({ error: 'Source and destination must differ' });
    const ref = 'TRF-' + String(Date.now()).slice(-6);
    const result = await pool.query('INSERT INTO transfers (reference, from_location_id, to_location_id, status, created_by, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [ref, from_location_id, to_location_id, 'draft', req.session.userId, notes || null]);
    for (const line of lines) {
      await pool.query('INSERT INTO transfer_lines (transfer_id, product_id, quantity) VALUES ($1,$2,$3)', [result.rows[0].id, line.product_id, line.quantity]);
    }
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create transfer' }); }
});

// Validate transfer
router.post('/api/:id/validate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transfer = await client.query("SELECT t.*, fl.name as from_loc, tl.name as to_loc, fw.name as from_wh, tw.name as to_wh FROM transfers t JOIN locations fl ON t.from_location_id = fl.id JOIN locations tl ON t.to_location_id = tl.id JOIN warehouses fw ON fl.warehouse_id = fw.id JOIN warehouses tw ON tl.warehouse_id = tw.id WHERE t.id = $1 AND t.status = 'draft'", [req.params.id]);
    if (transfer.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Transfer not found or already validated' }); }
    const t = transfer.rows[0];
    const lines = await client.query('SELECT tl.*, p.name as product_name FROM transfer_lines tl JOIN products p ON tl.product_id = p.id WHERE tl.transfer_id = $1', [req.params.id]);
    for (const line of lines.rows) {
      await client.query('INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference) VALUES ($1,$2,$3,$4,$5,$6)',
        [line.product_id, `${t.from_wh} / ${t.from_loc}`, `${t.to_wh} / ${t.to_loc}`, line.quantity, 'transfer', t.reference]);
    }
    await client.query("UPDATE transfers SET status = 'validated', validated_at = NOW() WHERE id = $1", [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Failed to validate transfer' }); }
  finally { client.release(); }
});

module.exports = router;
