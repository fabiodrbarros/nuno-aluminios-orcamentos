'use strict';
require('./_setup');
const test = require('node:test');
const assert = require('node:assert');
const calculo = require('../src/calculo');
const { eur, parseNum, phoneDigits } = require('../src/util');

test('totais com desconto de linha, desconto global e IVA', () => {
  const linhas = [
    { tipo: 'vao', quantidade: 2, preco_unitario: 483.6 },
    { tipo: 'artigo', quantidade: 7, preco_unitario: 35, desconto_pct: 10 },
    { tipo: 'secao', quantidade: 0, preco_unitario: 999 },
    { tipo: 'texto', quantidade: 1, preco_unitario: 999 },
  ];
  const t = calculo.totais(linhas, { desconto_pct: 5, iva_taxa: 23 });
  assert.deepStrictEqual(t, { subtotal: 1187.7, desconto_valor: 59.39, base: 1128.31, iva_valor: 259.51, total: 1387.82 });
});

test('preço sugerido por m² respeita a área mínima', () => {
  const art = { unidade: 'm2', preco: 230, area_minima: 1.2 };
  assert.strictEqual(calculo.precoSugerido(art, 1500, 1200), 414);
  assert.strictEqual(calculo.precoSugerido(art, 600, 600), 276); // 0,36 m² → cobra 1,2 m²
  assert.strictEqual(calculo.precoSugerido({ unidade: 'un', preco: 1650 }, 1000, 2200), 1650);
});

test('normalizarLinha limpa valores e desenho', () => {
  const l = calculo.normalizarLinha({ tipo: 'vao', quantidade: '2', preco_unitario: '1.234,5', largura: '1200.4', desenho: '{"folhas":[{"t":"xpto"}]}', imagem: '../../etc/passwd' }, 0);
  assert.strictEqual(l.quantidade, 2);
  assert.strictEqual(l.preco_unitario, 1234.5);
  assert.strictEqual(l.largura, 1200);
  assert.strictEqual(JSON.parse(l.desenho).folhas[0].t, 'fixo');
  assert.strictEqual(l.imagem, '');
  assert.strictEqual(l.total, 2469);
});

test('estado expirado e validade', () => {
  const orc = { estado: 'enviado', data: '2026-01-10', validade_dias: 30 };
  assert.strictEqual(calculo.validade(orc), '2026-02-09');
  assert.strictEqual(calculo.estadoVisivel(orc, '2026-02-09'), 'enviado');
  assert.strictEqual(calculo.estadoVisivel(orc, '2026-02-10'), 'expirado');
});

test('formatos portugueses', () => {
  assert.strictEqual(eur(1238.4), '1 238,40 €');
  assert.strictEqual(parseNum('1.234,56'), 1234.56);
  assert.strictEqual(parseNum('12.5'), 12.5);
  assert.strictEqual(phoneDigits('912 345 678'), '351912345678');
  assert.strictEqual(phoneDigits('+33 (0)6 12 34 56 78'), '33612345678');
  assert.strictEqual(phoneDigits('0034 600 123 456'), '34600123456');
  assert.strictEqual(phoneDigits('123'), null);
});
