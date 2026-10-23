'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const whatsapp = require('./whatsapp');
const calculo = require('./calculo');
const { icon, brandIcon } = require('./icons');
const util = require('./util');

auth.syncAdmin();

// Versão dos ficheiros estáticos pelo conteúdo (o browser não reutiliza CSS/JS antigos).
const publicDir = path.join(__dirname, '..', 'public');
const assetCache = new Map();
function asset(rel) {
  const file = rel === 'js/desenho.js' ? path.join(__dirname, 'desenho.js') : path.join(publicDir, rel);
  let stat;
  try { stat = fs.statSync(file); } catch { return `/static/${rel}`; }
  const hit = assetCache.get(rel);
  if (!hit || hit.mtime !== stat.mtimeMs) {
    const hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
    assetCache.set(rel, { mtime: stat.mtimeMs, url: `/static/${rel}?v=${hash}` });
  }
  return assetCache.get(rel).url;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (config.isProd) app.set('view cache', true);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "form-action 'self' https://wa.me https://api.whatsapp.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "object-src 'self'",
    ].join('; '),
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

app.get('/api/health', (req, res) => {
  let dbOk = true;
  try { db.prepare('SELECT 1').get(); } catch { dbOk = false; }
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, uptime: Math.round(process.uptime()) });
});

// O módulo de desenho é partilhado com o servidor: serve-se diretamente de src/.
app.get('/static/js/desenho.js', (req, res) => {
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.type('application/javascript').sendFile(path.join(__dirname, 'desenho.js'));
});
app.use('/static', (req, res, next) => {
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : (config.isProd ? 'public, max-age=3600' : 'no-cache'));
  next();
}, express.static(publicDir, { index: false, cacheControl: false }));
// Fotografias: nomes aleatórios (não adivinháveis), usados também na página pública do orçamento.
app.use('/media', express.static(config.uploadsDir, { maxAge: '30d', index: false, dotfiles: 'deny' }));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(publicDir, 'icons', 'favicon.ico'), { maxAge: '7d' }));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(auth.sessionMiddleware);

app.use((req, res, next) => {
  res.locals.asset = asset;
  res.locals.icon = icon;
  res.locals.brandIcon = brandIcon;
  res.locals.u = util;
  res.locals.calculo = calculo;
  res.locals.settings = util.getSettings();
  res.locals.user = req.user;
  res.locals.csrf = req.user ? req.user.csrf : '';
  res.locals.reqPath = req.path;
  res.locals.waOn = whatsapp.configurado();
  res.locals.hoje = util.today();
  let fl = null;
  if (req.cookies.nuno_orc_flash) {
    try { fl = JSON.parse(req.cookies.nuno_orc_flash); } catch { fl = null; }
    res.clearCookie('nuno_orc_flash', { path: '/' });
  }
  res.locals.flash = fl;
  next();
});

app.use(require('./routes/publico'));
app.use(require('./routes/conta'));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(auth.requireUser);
app.use(require('./routes/painel'));
app.use('/clientes', require('./routes/clientes'));
app.use('/orcamentos', require('./routes/orcamentos'));
app.use('/artigos', require('./routes/artigos'));
app.use('/definicoes', require('./routes/definicoes'));

app.use((req, res) => {
  res.status(404).render('erro', { title: 'Página não encontrada', mensagem: 'A página pedida não existe ou foi removida.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[erro]', err);
  if (res.headersSent) return;
  if ((req.get('accept') || '').includes('application/json')) return res.status(500).json({ error: 'Ocorreu um erro. Tente novamente.' });
  res.status(err.status || 500).type('text/html').send(`<!doctype html><html lang="pt"><meta charset="utf-8"><title>Erro</title><style>@font-face{font-family:Montserrat;src:url(/static/fonts/Montserrat-Variable.woff2) format("woff2");font-weight:100 900}body{font-family:Montserrat,Arial,sans-serif;padding:48px;background:#F3F4EF;color:#171A17}</style><body><h1>Ocorreu um erro</h1><p>Não foi possível concluir o pedido. Tente novamente dentro de instantes.</p><p><a href="/">Voltar ao início</a></p></body></html>`);
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[http] orçamentos em http://0.0.0.0:${config.port} (dados em ${config.dataDir})`);
  console.log(`[whatsapp] ${whatsapp.configurado() ? `ponte WAHA em ${config.whatsappUrl}` : 'sem ponte: envio manual (wa.me)'}`);
});

function shutdown() {
  server.close(() => {
    try { db.close(); } catch { /* já fechada */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
