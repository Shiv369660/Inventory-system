const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Adjustments page
router.get('/', async (req, res) => {
  try {
    const adjustments = await pool.query(`SELECT a.*, p.name as product_name, p.sku, l.name as location_name, u.name as created_by_name
      FROM adjustments a JOIN products p ON a.product_id = p.id LEFT JOIN locations l ON a.location_id = l.id LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC`);
    const products = await pool.query('SELECT p.id, p.name, p.sku, p.current_stock, l.name as location_name FROM products p LEFT JOIN locations l ON p.location_id = l.id ORDER BY p.name');
    res.render('adjustments', { title: 'Adjustments', adjustments: adjustments.rows, products: products.rows });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load adjustments' }); }
});

// Create adjustment
router.post('/api', async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, physical_qty, reason } = req.body;
    if (!product_id || physical_qty === undefined) return res.status(400).json({ error: 'Product and physical quantity required' });
    await client.query('BEGIN');
    const product = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (product.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }); }
    const recorded = parseFloat(product.rows[0].current_stock);
    const physical = parseFloat(physical_qty);
    const adj = physical - recorded;
    const ref = 'ADJ-' + String(Date.now()).slice(-6);
    await client.query(
      'INSERT INTO adjustments (reference, product_id, location_id, recorded_qty, physical_qty, adjustment_qty, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [ref, product_id, product.rows[0].location_id, recorded, physical, adj, reason || null, req.session.userId]
    );
    await client.query('UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2', [physical, product_id]);
    await client.query('INSERT INTO movements (product_id, from_location, to_location, quantity, operation_type, reference) VALUES ($1,$2,$3,$4,$5,$6)',
      [product_id, 'Recorded Stock', 'Adjustment', adj, 'adjustment', ref]);
    await client.query('COMMIT');
    res.json({ success: true, adjustment: adj });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Failed to create adjustment' }); }
  finally { client.release(); }
});

module.exports = router;
