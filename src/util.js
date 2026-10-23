'use strict';

const db = require('./db');

let settingsCache = null;

function getSettings() {
  if (!settingsCache) {
    settingsCache = {};
    for (const row of db.prepare('SELECT key, value FROM settings').all()) settingsCache[row.key] = row.value;
  }
  return settingsCache;
}

function saveSettings(values) {
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const [k, v] of Object.entries(values)) stmt.run(k, String(v == null ? '' : v).trim());
  })();
  settingsCache = null;
}

function lines(text) {
  return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Números em formato português. Os espaços especiais do Intl passam a espaço normal
// (a fonte do PDF não tem o espaço fino).
// useGrouping 'always': em pt-PT o Intl só agrupa a partir de 10 000; nos orçamentos agrupa-se sempre (1 238,40 €).
const eurFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const numFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2, useGrouping: 'always' });
const clean = (s) => s.replace(/[  ]/g, ' ');
const eur = (v) => clean(eurFmt.format(Number(v) || 0));
const num = (v) => clean(numFmt.format(Number(v) || 0));

function round2(v) {
  return Math.round((Number(v) || 0) * 100 + Number.EPSILON) / 100;
}

// Aceita "1.234,56", "1234.56", "1 234,5".
function parseNum(v, fallback = 0) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  let s = String(v == null ? '' : v).trim().replace(/[\s€%]/g, '');
  if (!s) return fallback;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

// "2026-10-23" → "23/10/2026"
function dataPt(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

// "2026-10-23 14:05:00" (UTC do SQLite) → "23/10/2026 15:05" na hora de Lisboa.
function dataHoraPt(sqlUtc) {
  if (!sqlUtc) return '';
  const d = new Date(String(sqlUtc).replace(' ', 'T') + (String(sqlUtc).endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return String(sqlUtc);
  return clean(d.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
}

// Contacto → só dígitos com indicativo (9 dígitos = Portugal). null se não parecer um telefone.
function phoneDigits(contacto) {
  const raw = String(contacto || '').replace(/\(0\)/g, '').trim();
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && !raw.startsWith('+')) d = `351${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

function phonePretty(digits) {
  if (!digits) return '';
  if (digits.startsWith('351') && digits.length === 12) {
    const n = digits.slice(3);
    return `+351 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return `+${digits}`;
}

// Limitador simples em memória (janela deslizante por chave).
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
  }, windowMs).unref();
  return {
    hit(key) {
      const now = Date.now();
      const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(key, arr);
      return arr.length <= max;
    },
    reset(key) { hits.delete(key); },
  };
}

const str = (v, max = 2000) => String(v == null ? '' : v).trim().slice(0, max);

module.exports = {
  getSettings, saveSettings, lines, eur, num, round2, parseNum, today, addDays, dataPt, dataHoraPt,
  phoneDigits, phonePretty, rateLimiter, str,
};
