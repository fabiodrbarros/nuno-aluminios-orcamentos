'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.resolve(process.env.DATA_DIR || '/data');

function sessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return process.env.SESSION_SECRET;
  // Sem segredo configurado: gerar um e guardá-lo em DATA_DIR para sobreviver a reinícios.
  const file = path.join(dataDir, '.session-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file, secret, { mode: 0o600 });
    } catch (err) {
      console.warn('[config] não foi possível guardar o segredo de sessão:', err.message);
    }
    return secret;
  }
}

const trimUrl = (v) => (v || '').trim().replace(/\/+$/, '');

module.exports = {
  port: Number(process.env.PORT) || 3100,
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  // URL público desta aplicação (links enviados aos clientes). Sem barra final.
  publicUrl: trimUrl(process.env.PUBLIC_URL),
  adminEmail: (process.env.ADMIN_EMAIL || '').trim(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Ponte WhatsApp (WAHA). Vazio = envio manual pelo WhatsApp do telemóvel/computador (wa.me).
  whatsappUrl: trimUrl(process.env.WHATSAPP_API_URL),
  whatsappKey: (process.env.WHATSAPP_API_KEY || '').trim(),
  whatsappSession: (process.env.WHATSAPP_SESSION || 'default').trim(),
  isProd: process.env.NODE_ENV === 'production',
  get sessionSecret() {
    if (!this._secret) this._secret = sessionSecret();
    return this._secret;
  },
};
