const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const router = express.Router();

// In-memory OTP Store: { email: { otp: string, expires_at: number, verified: boolean, attempts: number } }
// NOTE: In production, migrate this to the database for persistence across restarts.
const otps = new Map();

const OTP_MAX_ATTEMPTS = 5;

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Basic email format check
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Login page
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { layout: false, title: 'Login', error: null });
});

// Signup page
router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('signup', { layout: false, title: 'Sign Up', error: null });
});

// Login POST
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('login', { layout: false, title: 'Login', error: 'All fields are required' });
    }
    if (!isValidEmail(email)) {
      return res.render('login', { layout: false, title: 'Login', error: 'Please enter a valid email address' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.render('login', { layout: false, title: 'Login', error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.render('login', { layout: false, title: 'Login', error: 'Invalid email or password' });
    }
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { layout: false, title: 'Login', error: 'An error occurred. Please try again.' });
  }
});

// Signup POST
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    // Bug #3 fix: include confirmPassword in null-check
    if (!name || !email || !password || !confirmPassword) {
      return res.render('signup', { layout: false, title: 'Sign Up', error: 'All fields are required' });
    }
    // Bug #20 fix: validate email format
    if (!isValidEmail(email)) {
      return res.render('signup', { layout: false, title: 'Sign Up', error: 'Please enter a valid email address' });
    }
    if (password !== confirmPassword) {
      return res.render('signup', { layout: false, title: 'Sign Up', error: 'Passwords do not match' });
    }
    if (password.length < 6) {
      return res.render('signup', { layout: false, title: 'Sign Up', error: 'Password must be at least 6 characters' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (exists.rows.length > 0) {
      return res.render('signup', { layout: false, title: 'Sign Up', error: 'Email already registered' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name.trim(), normalizedEmail, hash]
    );
    const user = result.rows[0];
    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('signup', { layout: false, title: 'Sign Up', error: 'An error occurred. Please try again.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// API: current user
router.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

// Forgot Password page
router.get('/forgot-password', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('forgot-password', { layout: false, title: 'Reset Password', error: null });
});

// Forgot Password API
router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const userCount = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCount.rows.length === 0) {
      // Don't leak if email exists or not for security, just pretend we sent it
      return res.json({ message: 'If that email is registered, you will receive an OTP shortly.' });
    }

    const otp = generateOTP();
    otps.set(email, {
      otp: otp,
      expires_at: Date.now() + 300000, // 5 minutes
      verified: false
    });

    console.log(`\n\n=== HACKATHON OTP FOR ${email} ===\n${otp}\n================================\n\n`);

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to request OTP' });
  }
});

// Verify OTP API
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const record = otps.get(email);
    if (!record) return res.status(400).json({ error: 'No OTP requested for this email' });

    // Bug #2 fix: enforce attempt limit to prevent brute force
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      otps.delete(email);
      return res.status(429).json({ error: 'Too many attempts. Please request a new OTP.' });
    }
    record.attempts = (record.attempts || 0) + 1;

    if (record.expires_at <= Date.now()) {
      otps.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (record.otp === otp.toString()) {
      record.verified = true;
      res.json({ message: 'OTP verified successfully' });
    } else {
      res.status(400).json({ error: `Invalid OTP. ${OTP_MAX_ATTEMPTS - record.attempts} attempt(s) remaining.` });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Reset Password API
router.post('/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: 'Email and password are required' });

    const record = otps.get(email);
    if (!record || !record.verified) {
      return res.status(403).json({ error: 'OTP not verified or expired' });
    }

    if (newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);

    otps.delete(email); // Cleanup
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Bug #1 fix: Removed duplicate GET /api/auth/me (was defined twice — lines 90 and 175)
// The first definition at line 90 is the canonical one and remains.

module.exports = router;
