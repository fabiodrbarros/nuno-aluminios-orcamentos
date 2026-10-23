'use strict';

// Sessão em cookie assinado; conta única definida pelas variáveis de ambiente.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('./config');
const db = require('./db');

const COOKIE = 'nuno_orc_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12 horas

function syncAdmin() {
  const { adminEmail, adminPassword } = config;
  if (!adminEmail || !adminPassword) {
    console.warn('[auth] ADMIN_EMAIL/ADMIN_PASSWORD não definidos: acesso à aplicação desativado.');
    return;
  }
  const existing = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(adminEmail);
  // Só regrava o hash se a palavra-passe mudou: assim as sessões abertas sobrevivem a reinícios
  // e deploys (e a gravação automática do editor não falha), mas mudar a palavra-passe termina-as.
  if (existing && !bcrypt.compareSync(adminPassword, existing.password_hash)) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(bcrypt.hashSync(adminPassword, 11), existing.id);
  } else if (!existing) {
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(adminEmail, bcrypt.hashSync(adminPassword, 11));
  }
  db.prepare('DELETE FROM users WHERE email <> ? COLLATE NOCASE').run(adminEmail);
  console.log(`[auth] conta sincronizada (${adminEmail})`);
}

function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function encode(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function sessionMiddleware(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  const payload = decode(req.cookies[COOKIE]);
  req.user = null;
  if (payload) {
    const user = db.prepare('SELECT id, email, password_hash FROM users WHERE id = ?').get(payload.uid);
    if (user && payload.v === user.password_hash.slice(-12)) {
      req.user = { id: user.id, email: user.email, csrf: payload.csrf };
    }
  }
  next();
}

function login(req, res, user) {
  const payload = {
    uid: user.id,
    v: user.password_hash.slice(-12),
    csrf: crypto.randomBytes(24).toString('base64url'),
    exp: Date.now() + MAX_AGE_MS,
  };
  res.cookie(COOKIE, encode(payload), { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', maxAge: MAX_AGE_MS });
}

function logout(req, res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function verify(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
  const hash = user ? user.password_hash : '$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = bcrypt.compareSync(String(password || ''), hash);
  return ok && user ? user : null;
}

function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.xhr || (req.get('accept') || '').includes('application/json')) return res.status(401).json({ error: 'Sessão terminada. Entre novamente.' });
  return res.redirect('/entrar');
}

function requireCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (req.user && token && token === req.user.csrf) return next();
  return res.status(403).send('Pedido inválido (CSRF). Volte atrás e recarregue a página.');
}

module.exports = { syncAdmin, sessionMiddleware, login, logout, verify, requireUser, requireCsrf };
