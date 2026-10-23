'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const orcamentos = require('../orcamentos');
const { str, phoneDigits } = require('../util');
const { flash, wantsJson } = require('../web');

const router = express.Router();

const CAMPOS = ['tipo', 'nome', 'contacto_nome', 'nif', 'email', 'telefone', 'telemovel', 'whatsapp', 'morada', 'codigo_postal', 'localidade', 'notas'];

function ler(body) {
  const c = {};
  for (const k of CAMPOS) c[k] = str(body[k], k === 'notas' ? 4000 : 300);
  c.tipo = c.tipo === 'empresa' ? 'empresa' : 'particular';
  c.nif = c.nif.replace(/\s+/g, ' ');
  return c;
}

function validar(c) {
  const erros = {};
  if (!c.nome) erros.nome = 'Indique o nome do cliente.';
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) erros.email = 'Email inválido.';
  const nifDig = c.nif.replace(/\D/g, '');
  if (c.nif && /^\d+$/.test(c.nif.replace(/\s/g, '')) && nifDig.length !== 9) erros.nif = 'O NIF português tem 9 dígitos.';
  if (c.whatsapp && !phoneDigits(c.whatsapp)) erros.whatsapp = 'Número inválido.';
  return erros;
}

function guardar(c, id) {
  if (id) {
    const sets = CAMPOS.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE clientes SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...c, id });
    return id;
  }
  return db.prepare(`INSERT INTO clientes (${CAMPOS.join(',')}) VALUES (${CAMPOS.map((k) => `@${k}`).join(',')})`).run(c).lastInsertRowid;
}

// Pesquisa rápida (editor de orçamentos e lista).
function procurar(q, { arquivados = false, limit = 500 } = {}) {
  const like = `%${q}%`;
  return db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM orcamentos o WHERE o.cliente_id = c.id) AS n_orc,
      (SELECT MAX(o.data) FROM orcamentos o WHERE o.cliente_id = c.id) AS ultimo
    FROM clientes c
    WHERE (@q = '' OR c.nome LIKE @like OR c.nif LIKE @like OR c.email LIKE @like OR c.telemovel LIKE @like OR c.telefone LIKE @like OR c.localidade LIKE @like)
      AND c.arquivado = @arq
    ORDER BY c.nome COLLATE NOCASE LIMIT @limit`).all({ q, like, arq: arquivados ? 1 : 0, limit });
}

router.get('/', (req, res) => {
  const q = str(req.query.q, 100);
  const arquivados = req.query.arquivados === '1';
  const lista = procurar(q, { arquivados });
  if (wantsJson(req)) return res.json(lista.slice(0, 15).map((c) => ({ id: c.id, nome: c.nome, nif: c.nif, telemovel: c.telemovel || c.telefone, localidade: c.localidade })));
  res.render('clientes/lista', { title: 'Clientes', q, arquivados, clientes: lista });
});

router.get('/exportar.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM clientes ORDER BY nome COLLATE NOCASE').all();
  const cols = ['id', ...CAMPOS, 'origem', 'created_at'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\r\n');
  res.set('Content-Disposition', 'attachment; filename="clientes-nuno-aluminios.csv"');
  res.type('text/csv; charset=utf-8').send(`﻿${csv}`);
});

router.get('/novo', (req, res) => {
  res.render('clientes/form', { title: 'Novo cliente', cliente: { tipo: 'particular', nome: str(req.query.nome, 200) }, erros: {}, voltar: str(req.query.voltar, 200) });
});

router.post('/novo', auth.requireCsrf, (req, res) => {
  const c = ler(req.body);
  const erros = validar(c);
  if (Object.keys(erros).length) return res.status(400).render('clientes/form', { title: 'Novo cliente', cliente: c, erros, voltar: str(req.body.voltar, 200) });
  const id = guardar(c);
  flash(res, 'Cliente criado.');
  if (req.body.depois === 'orcamento') {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    const oid = orcamentos.criar({ cliente });
    return res.redirect(`/orcamentos/${oid}`);
  }
  res.redirect(`/clientes/${id}`);
});

router.get('/:id(\\d+)', (req, res, next) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return next();
  res.render('clientes/ficha', { title: cliente.nome, cliente, orcs: orcamentos.lista({ cliente_id: cliente.id }) });
});

router.get('/:id(\\d+)/editar', (req, res, next) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return next();
  res.render('clientes/form', { title: `Editar ${cliente.nome}`, cliente, erros: {}, voltar: '' });
});

router.post('/:id(\\d+)/editar', auth.requireCsrf, (req, res, next) => {
  const atual = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!atual) return next();
  const c = ler(req.body);
  const erros = validar(c);
  if (Object.keys(erros).length) return res.status(400).render('clientes/form', { title: `Editar ${atual.nome}`, cliente: { ...c, id: atual.id }, erros, voltar: '' });
  guardar(c, atual.id);
  // Os rascunhos deste cliente passam a usar os dados novos; documentos já enviados não mudam.
  const novo = db.prepare('SELECT * FROM clientes WHERE id = ?').get(atual.id);
  for (const o of db.prepare("SELECT id FROM orcamentos WHERE cliente_id = ? AND estado = 'rascunho'").all(atual.id)) orcamentos.mudarCliente(o.id, novo);
  flash(res, 'Cliente atualizado.');
  res.redirect(`/clientes/${atual.id}`);
});

router.post('/:id(\\d+)/arquivar', auth.requireCsrf, (req, res) => {
  const arq = req.body.arquivar === '0' ? 0 : 1;
  db.prepare("UPDATE clientes SET arquivado = ?, updated_at = datetime('now') WHERE id = ?").run(arq, req.params.id);
  flash(res, arq ? 'Cliente arquivado.' : 'Cliente reposto.');
  res.redirect(`/clientes/${req.params.id}`);
});

router.post('/:id(\\d+)/apagar', auth.requireCsrf, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM orcamentos WHERE cliente_id = ?').get(req.params.id).n;
  if (n) {
    flash(res, 'Este cliente tem orçamentos: arquive-o em vez de apagar.', 'error');
    return res.redirect(`/clientes/${req.params.id}`);
  }
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  flash(res, 'Cliente apagado.');
  res.redirect('/clientes');
});

module.exports = router;
