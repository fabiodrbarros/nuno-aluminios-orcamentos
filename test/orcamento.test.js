'use strict';
require('./_setup');
const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/db');
const orcamentos = require('../src/orcamentos');
const pdf = require('../src/pdf');

function cliente() {
  const id = db.prepare("INSERT INTO clientes (nome, telemovel, morada, codigo_postal, localidade) VALUES ('Maria Fernandes', '912345678', 'Rua do Souto, 12', '4990-062', 'Ponte de Lima')").run().lastInsertRowid;
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

test('numeração sequencial por ano e dados iniciais', () => {
  const c = cliente();
  const a = orcamentos.get(orcamentos.criar({ cliente: c }));
  const b = orcamentos.get(orcamentos.criar({}));
  const ano = new Date().getFullYear();
  assert.strictEqual(a.numero, `ORC ${ano}/0001`);
  assert.strictEqual(b.numero, `ORC ${ano}/0002`);
  assert.strictEqual(a.cliente_morada, 'Rua do Souto, 12, 4990-062 Ponte de Lima');
  assert.ok(a.cond_pagamento.length > 0);
  assert.notStrictEqual(a.token, b.token);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM artigos').get().n >= 15);
});

test('gravar, duplicar, mensagem e PDF', async () => {
  const c = cliente();
  const id = orcamentos.criar({ cliente: c, obra_local: 'Arcozelo' });
  orcamentos.gravar(id, { ...orcamentos.get(id), iva_taxa: 23, mostrar_precos_linha: 1 }, [
    { tipo: 'secao', descricao: 'Piso 0' },
    { tipo: 'vao', referencia: 'J1', descricao: 'Janela', largura: 1200, altura: 1200, desenho: '{"folhas":[{"t":"batente-e"},{"t":"oscilo-d"}]}', quantidade: 2, preco_unitario: 400 },
    { tipo: 'artigo', descricao: 'Montagem', quantidade: 2, preco_unitario: 45 },
  ]);
  const o = orcamentos.get(id);
  assert.strictEqual(o.subtotal, 890);
  assert.strictEqual(o.total, 1094.7);
  assert.strictEqual(orcamentos.linhas(id).length, 3);

  const copia = orcamentos.completo(orcamentos.duplicar(id));
  assert.strictEqual(copia.linhas.length, 3);
  assert.strictEqual(copia.orc.total, 1094.7);
  assert.strictEqual(copia.orc.estado, 'rascunho');

  const msg = orcamentos.mensagemEnvio(o, 'https://orc.exemplo.pt/o/abc');
  assert.match(msg, /Olá Maria!/);
  assert.match(msg, /para Arcozelo/);
  assert.match(msg, /https:\/\/orc\.exemplo\.pt\/o\/abc/);

  const buf = await pdf.gerar(orcamentos.completo(id));
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 20000);
});

test('marcarEnviado não desfaz um orçamento aceite', () => {
  const id = orcamentos.criar({});
  orcamentos.mudarEstado(id, 'aceite', { aceite_nome: 'X' });
  orcamentos.marcarEnviado(id);
  assert.strictEqual(orcamentos.get(id).estado, 'aceite');
});
