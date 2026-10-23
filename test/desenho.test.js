'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../src/desenho');

test('parse tolera JSON inválido e tipos desconhecidos', () => {
  assert.deepStrictEqual(D.parse('lixo'), { folhas: [{ t: 'fixo', w: 1 }], bandeira: null, estore: false });
  const l = D.parse({ folhas: [{ t: 'correr' }, { t: 'nada' }], bandeira: { t: 'basculante', h: '450' }, estore: 1 });
  assert.deepStrictEqual(l, { folhas: [{ t: 'correr', w: 1 }, { t: 'fixo', w: 1 }], bandeira: { t: 'basculante', h: 450 }, estore: true });
});

test('svg com cotas parciais e totais', () => {
  const svg = D.svg({ folhas: [{ t: 'batente-e' }, { t: 'oscilo-d' }] }, 1201, 1300);
  assert.match(svg, /^<svg /);
  assert.match(svg, />601</); // 1201 dividido: 601 + 600
  assert.match(svg, />600</);
  assert.match(svg, />1201</);
  assert.match(svg, />1300</);
  assert.doesNotMatch(D.svg({ folhas: [{ t: 'fixo' }] }, 0, 0), /<text/); // sem medidas: sem cotas
});

test('área e descrição', () => {
  assert.strictEqual(D.area(1500, 1200), 1.8);
  assert.strictEqual(D.descrever({ folhas: [{ t: 'correr' }, { t: 'correr' }], estore: true }), '2 folhas (2× correr), com estore');
});
