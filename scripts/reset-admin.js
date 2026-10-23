'use strict';
// Repõe a conta de acesso.
//   node scripts/reset-admin.js                 → volta a aplicar ADMIN_EMAIL / ADMIN_PASSWORD
//   node scripts/reset-admin.js email nova-pass → define outra (até ao próximo arranque)
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const db = require('../src/db');

const [email, password] = process.argv.slice(2);
if (!email) {
  require('../src/auth').syncAdmin();
  process.exit(0);
}
if (!password || password.length < 8) {
  console.error('Indique email e palavra-passe (mínimo 8 caracteres).');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 11);
db.prepare('DELETE FROM users').run();
db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
console.log(`Conta definida: ${email} (dados em ${config.dataDir}). Será substituída no próximo arranque se ADMIN_EMAIL/ADMIN_PASSWORD estiverem definidos.`);
