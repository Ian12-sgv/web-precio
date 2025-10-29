// src/app.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { buscar } = require('./controllers/searchController');
const { query }  = require('./db/sqlserver');

const app = express();

/* Básicos */
app.disable('x-powered-by');
app.set('trust proxy', true);

/* Logging + body parsers */
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* CORS: permite front (Netlify) o * en dev */
const ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: ORIGIN }));
app.use((req, res, next) => {
  // Para que los proxies no confundan cachés por origen
  res.set('Vary', 'Origin');
  next();
});

/* ⚠️ Anti-caché en /api para evitar 304 y revalidaciones */
app.set('etag', false);
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

/* Rutas API (prefijo /api) */
app.get('/api/health', (_req, res) => res.json({ status:'ok', uptime:process.uptime() }));
app.get('/api/db/health', async (_req, res) => {
  try {
    const r = await query('SELECT 1 AS ok, DB_NAME() AS db, SYSTEM_USER AS userName');
    res.json({ db:'up', result:r.recordset });
  } catch (e) {
    res.status(500).json({ db:'down', error:e.message });
  }
});

// buscar (compatibilidad con /buscar y /buscar.php)
app.all(['/api/buscar', '/buscar', '/buscar.php'], buscar);

/* 404 + errores */
app.use((req, res) => res.status(404).json({ error:'Not Found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

/* Arranque: PRIVADO en loopback (Caddy lo expone por 443) */
const port = process.env.PORT || 5000;
app.listen(port, '127.0.0.1', () => {
  console.log(`API escuchando en http://127.0.0.1:${port}`);
});

module.exports = app;
