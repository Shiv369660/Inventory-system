const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const router = express.Router();

// Profile page
router.get('/', async (req, res) => {
  try {
    const user = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.session.userId]);
    res.render('profile', { title: 'Profile', profile: user.rows[0] });
  } catch (err) { console.error(err); res.status(500).render('error', { title: 'Error', message: 'Failed to load profile' }); }
});

// Update profile
router.post('/api', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
    // Bug #16 fix: validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    // Bug #16 fix: check email uniqueness (excluding current user)
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase().trim(), req.session.userId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already used by another account' });
    }
    await pool.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', [name.trim(), email.toLowerCase().trim(), req.session.userId]);
    req.session.user.name = name.trim();
    req.session.user.email = email.toLowerCase().trim();
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update profile' }); }
});

// Change password
router.post('/api/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to change password' }); }
});

module.exports = router;
