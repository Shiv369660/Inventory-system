function authMiddleware(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login');
}

module.exports = authMiddleware;
