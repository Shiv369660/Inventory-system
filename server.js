require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./db/pool');

const expressLayouts = require('express-ejs-layouts');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-CHANGE-IN-PRODUCTION',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,                                      // Bug #9 fix: prevent JS access to cookie
    secure: process.env.NODE_ENV === 'production',       // Bug #9 fix: HTTPS-only in production
    sameSite: 'lax'                                      // Bug #9 fix: CSRF protection
  }
}));

// Make user available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Bug #4 fix: Root route registered BEFORE authRoutes to avoid Express matching /login first
// Root route - Landing page for all users
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('index', { title: 'Welcome', user: null });
});

// Auth routes (no middleware)
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// Protected routes
const authMiddleware = require('./middleware/auth');
app.use('/dashboard', authMiddleware, require('./routes/dashboard'));
app.use('/products', authMiddleware, require('./routes/products'));
app.use('/receipts', authMiddleware, require('./routes/receipts'));
app.use('/deliveries', authMiddleware, require('./routes/deliveries'));
app.use('/transfers', authMiddleware, require('./routes/transfers'));
app.use('/adjustments', authMiddleware, require('./routes/adjustments'));
app.use('/movements', authMiddleware, require('./routes/movements'));
app.use('/warehouses', authMiddleware, require('./routes/warehouses'));
app.use('/profile', authMiddleware, require('./routes/profile'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

// Bug #21 fix: Error handler detects browser vs API requests and responds appropriately
app.use((err, req, res, next) => {
  console.error(err.stack);
  const isApiOrXhr = req.xhr || req.path.startsWith('/api/') ||
    (req.headers.accept && req.headers.accept.includes('application/json'));
  if (isApiOrXhr) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).render('error', { title: 'Error', message: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CoreInventory running on http://localhost:${PORT}`);
  });
}

module.exports = app;
