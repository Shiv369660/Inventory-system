const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Movements page (stock ledger)
router.get('/', async (req, res) => {
  try {
    const type = req.query.type || '';
    let query = `SELECT m.*, p.name as product_name, p.sku FROM movements m JOIN products p ON m.product_id = p.id`;
    const params = [];
    if (type) { params.push(type); query += ` WHERE m.operation_type = $1`; }
    query += ' ORDER BY m.created_at DESC LIMIT 200';
    const movements = await pool.query(query, params);
    res.render('movements', { title: 'Move History', movements: movements.rows, type });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load movements' }); }
});

module.exports = router;
