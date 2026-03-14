const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Dashboard page
router.get('/', async (req, res) => {
  try {
    // KPI queries
    const totalProducts = pool.query('SELECT COUNT(*) as count FROM products');
    const lowStock = pool.query("SELECT COUNT(*) as count FROM products WHERE daily_usage > 0 AND current_stock / daily_usage < 10");
    const pendingReceipts = pool.query("SELECT COUNT(*) as count FROM receipts WHERE status = 'draft'");
    const pendingDeliveries = pool.query("SELECT COUNT(*) as count FROM deliveries WHERE status = 'draft'");
    const totalTransfers = pool.query('SELECT COUNT(*) as count FROM transfers');
    const recentMovements = pool.query(`SELECT m.*, p.name as product_name, p.sku
      FROM movements m JOIN products p ON m.product_id = p.id
      ORDER BY m.created_at DESC LIMIT 10`);

    // Stock predictions
    const predictions = pool.query(`
      SELECT p.id, p.name, p.sku, p.current_stock, p.daily_usage,
        CASE WHEN p.daily_usage > 0 THEN ROUND(p.current_stock / p.daily_usage, 1) ELSE NULL END as days_remaining,
        CASE WHEN p.daily_usage > 0 THEN ROUND(p.daily_usage * 14, 1) ELSE 0 END as reorder_qty,
        l.name as location_name, w.name as warehouse_name
      FROM products p
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN warehouses w ON l.warehouse_id = w.id
      WHERE p.daily_usage > 0
      ORDER BY days_remaining ASC
    `);

    // Dead inventory (no movement in 30 days)
    const deadInventory = pool.query(`
      SELECT p.id, p.name, p.sku, p.current_stock,
        MAX(m.created_at) as last_movement
      FROM products p
      LEFT JOIN movements m ON p.id = m.product_id
      GROUP BY p.id, p.name, p.sku, p.current_stock
      HAVING MAX(m.created_at) < datetime('now', '-30 days') OR MAX(m.created_at) IS NULL
    `);

    // Fetch automation data
    const automationDataResult = pool.query(`
      SELECT 
        p.id, 
        p.name, 
        p.current_stock as stock, 
        p.min_stock as minStock, 
        p.daily_usage as dailyUsage, 
        p.supplier_email as supplierEmail, 
        p.price,
        MAX(m.created_at) as lastMovedDate,
        COALESCE(SUM(CASE WHEN date(m.created_at) = date('now', 'localtime') AND m.operation_type = 'delivery' THEN m.quantity ELSE 0 END), 0) as todayMovement
      FROM products p
      LEFT JOIN movements m ON p.id = m.product_id
      GROUP BY p.id
    `);

    // Inventory Health Score
    const healthResult = pool.query(`
      SELECT
        SUM(CASE WHEN daily_usage = 0 OR current_stock / (CASE WHEN daily_usage = 0 THEN 1 ELSE daily_usage END) > 10 THEN 1 ELSE 0 END) as healthy,
        COUNT(*) as total
      FROM products
    `);
    const healthScore = healthResult.rows[0].total > 0
      ? Math.round((healthResult.rows[0].healthy / healthResult.rows[0].total) * 100) : 100;

    // Stock by category for chart
    const stockByCategory = pool.query(`
      SELECT category, SUM(current_stock) as total_stock, COUNT(*) as product_count
      FROM products WHERE category IS NOT NULL
      GROUP BY category ORDER BY total_stock DESC
    `);

    // Movements per day (last 7 days)
    const movementsPerDay = pool.query(`
      SELECT date(created_at) as day, operation_type, COUNT(*) as count
      FROM movements
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY date(created_at), operation_type
      ORDER BY day
    `);

    // Copilot alerts
    const copilotAlerts = [];
    predictions.rows.filter(p => p.days_remaining !== null && p.days_remaining < 10).forEach(p => {
      copilotAlerts.push({ type: 'danger', icon: 'alert-triangle', message: `${p.name} will run out in ${p.days_remaining} days. Reorder ${p.reorder_qty} ${p.sku}.` });
    });
    predictions.rows.filter(p => p.days_remaining !== null && p.days_remaining >= 10 && p.days_remaining < 20).forEach(p => {
      copilotAlerts.push({ type: 'warning', icon: 'clock', message: `${p.name} has ${p.days_remaining} days of stock remaining.` });
    });
    deadInventory.rows.forEach(p => {
      copilotAlerts.push({ type: 'info', icon: 'archive', message: `${p.name} (${p.sku}) has had no movement in 30+ days.` });
    });

    res.render('dashboard', {
      title: 'Dashboard',
      kpi: {
        totalProducts: totalProducts.rows[0].count,
        lowStock: lowStock.rows[0].count,
        pendingReceipts: pendingReceipts.rows[0].count,
        pendingDeliveries: pendingDeliveries.rows[0].count,
        totalTransfers: totalTransfers.rows[0].count,
        healthScore
      },
      predictions: predictions.rows,
      deadInventory: deadInventory.rows,
      recentMovements: recentMovements.rows,
      stockByCategory: stockByCategory.rows,
      movementsPerDay: movementsPerDay.rows,
      copilotAlerts,
      automationProducts: automationDataResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Failed to load dashboard' });
  }
});

module.exports = router;
