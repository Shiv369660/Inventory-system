const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Products page
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    const category = req.query.category || '';
    let query = `SELECT p.*, l.name as location_name, w.name as warehouse_name
      FROM products p LEFT JOIN locations l ON p.location_id = l.id LEFT JOIN warehouses w ON l.warehouse_id = w.id`;
    const params = [];
    const conditions = [];
    if (search) { 
      params.push(`%${search}%`); 
      const searchIdx = params.length;
      params.push(`%${search}%`); 
      conditions.push(`(p.name ILIKE $${searchIdx} OR p.sku ILIKE $${params.length})`); 
    }
    if (category) { params.push(category); conditions.push(`p.category = $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.name';
    console.log('Search query:', query);
    console.log('Search params:', params);
    const products = await pool.query(query, params);
    const categories = await pool.query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
    const locations = await pool.query('SELECT l.id, l.name, w.name as warehouse_name FROM locations l JOIN warehouses w ON l.warehouse_id = w.id ORDER BY w.name, l.name');
    res.render('products', { title: 'Products', products: products.rows, categories: categories.rows, locations: locations.rows, search, category });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load products' }); }
});

// Create product
router.post('/api', async (req, res) => {
  try {
    const { name, sku, category, unit, current_stock, location_id, daily_usage } = req.body;
    if (!name || !sku) return res.status(400).json({ error: 'Name and SKU are required' });
    const result = await pool.query(
      'INSERT INTO products (name, sku, category, unit, current_stock, location_id, daily_usage) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, sku, category || null, unit || 'units', current_stock || 0, location_id || null, daily_usage || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU already exists' });
    console.error(err); res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/api/:id', async (req, res) => {
  try {
    const { name, sku, category, unit, current_stock, location_id, daily_usage } = req.body;
    const result = await pool.query(
      `UPDATE products SET name=$1, sku=$2, category=$3, unit=$4, current_stock=$5, location_id=$6, daily_usage=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, sku, category, unit, current_stock, location_id, daily_usage, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update product' }); }
});

// Delete product
router.delete('/api/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete product' }); }
});

module.exports = router;
