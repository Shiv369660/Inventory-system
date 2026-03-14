const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Receipts page
router.get('/', async (req, res) => {
  try {
    const receipts = await pool.query(`SELECT r.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM receipt_lines WHERE receipt_id = r.id) as line_count,
      (SELECT COALESCE(SUM(quantity),0) FROM receipt_lines WHERE receipt_id = r.id) as total_qty
      FROM receipts r LEFT JOIN users u ON r.created_by = u.id ORDER BY r.created_at DESC`);
    const products = await pool.query('SELECT id, name, sku FROM products ORDER BY name');
    res.render('receipts', { title: 'Receipts', receipts: receipts.rows, products: products.rows });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load receipts' }); }
});

// Get receipt details
router.get('/api/:id', async (req, res) => {
  try {
    const receipt = await pool.query('SELECT * FROM receipts WHERE id = $1', [req.params.id]);
    if (receipt.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lines = await pool.query(`SELECT rl.*, p.name as product_name, p.sku FROM receipt_lines rl JOIN products p ON rl.product_id = p.id WHERE rl.receipt_id = $1`, [req.params.id]);
    res.json({ ...receipt.rows[0], lines: lines.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to get receipt' }); }
});

// Create receipt
router.post('/api', async (req, res) => {
  try {
    const { supplier, notes, lines } = req.body;
    if (!supplier || !lines || lines.length === 0) return res.status(400).json({ error: 'Supplier and at least one product line required' });
    const ref = 'REC-' + String(Date.now()).slice(-6);
    const result = await pool.query('INSERT INTO receipts (reference, supplier, status, created_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [ref, supplier, 'draft', req.session.userId, notes || null]);
    const receiptId = result.rows[0].id;
    for (const line of lines) {
      await pool.query('INSERT INTO receipt_lines (receipt_id, product_id, quantity) VALUES ($1,$2,$3)', [receiptId, line.product_id, line.quantity]);
    }
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create receipt' }); }
});

// Validate receipt (updates stock)
router.post('/api/:id/validate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receipt = await client.query("SELECT * FROM receipts WHERE id = $1 AND status = 'draft'", [req.params.id]);
    if (receipt.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Receipt not found or already validated' }); }
    const lines = await client.query('SELECT rl.*, p.name as product_name, l.name as loc_name, w.name as wh_name FROM receipt_lines rl JOIN products p ON rl.product_id = p.id LEFT JOIN locations l ON p.location_id = l.id LEFT JOIN warehouses w ON l.warehouse_id = w.id WHERE rl.receipt_id = $1', [req.params.id]);
    for (const line of lines.rows) {
      await client.query('UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2', [line.quantity, line.product_id]);
      const toLoc = line.wh_name ? `${line.wh_name} / ${line.loc_name}` : 'Warehouse';
      await client.query('INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference) VALUES ($1,$2,$3,$4,$5,$6)',
        [line.product_id, `Supplier: ${receipt.rows[0].supplier}`, toLoc, line.quantity, 'receipt', receipt.rows[0].reference]);
    }
    await client.query("UPDATE receipts SET status = 'validated', validated_at = NOW() WHERE id = $1", [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Failed to validate receipt' }); }
  finally { client.release(); }
});

module.exports = router;
