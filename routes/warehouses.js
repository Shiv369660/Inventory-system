const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Warehouses page
router.get('/', async (req, res) => {
  try {
    const warehouses = await pool.query(`SELECT w.*, (SELECT COUNT(*) FROM locations WHERE warehouse_id = w.id) as location_count,
      (SELECT COUNT(*) FROM products p JOIN locations l ON p.location_id = l.id WHERE l.warehouse_id = w.id) as product_count
      FROM warehouses w ORDER BY w.name`);
    const locations = await pool.query(`SELECT l.*, w.name as warehouse_name,
      (SELECT COUNT(*) FROM products WHERE location_id = l.id) as product_count
      FROM locations l JOIN warehouses w ON l.warehouse_id = w.id ORDER BY w.name, l.name`);
    res.render('warehouses', { title: 'Warehouses', warehouses: warehouses.rows, locations: locations.rows });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load warehouses' }); }
});

// Create warehouse
router.post('/api', async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = await pool.query('INSERT INTO warehouses (name, address) VALUES ($1, $2) RETURNING *', [name, address || null]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create warehouse' }); }
});

// Create location
router.post('/api/locations', async (req, res) => {
  try {
    const { warehouse_id, name, type } = req.body;
    if (!warehouse_id || !name) return res.status(400).json({ error: 'Warehouse and name required' });
    const result = await pool.query('INSERT INTO locations (warehouse_id, name, type) VALUES ($1,$2,$3) RETURNING *', [warehouse_id, name, type || 'rack']);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create location' }); }
});

// Delete warehouse
router.delete('/api/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM warehouses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete warehouse' }); }
});

// Delete location
router.delete('/api/locations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM locations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete location' }); }
});

module.exports = router;
