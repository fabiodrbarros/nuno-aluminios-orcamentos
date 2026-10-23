'use strict';
require('./_setup');
const http = require('http');
const test = require('node:test');
const assert = require('node:assert');

// Ponte WAHA simulada: regista os pedidos e pode recusar o envio de ficheiros (como a versão gratuita).
function mock({ aceitaFicheiros }) {
  const pedidos = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      pedidos.push({ method: req.method, url: req.url, key: req.headers['x-api-key'], body: body ? JSON.parse(body) : null });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/contacts/check-exists')) return res.end(JSON.stringify({ numberExists: !req.url.includes('351900000000'), chatId: '351912345678@c.us' }));
      if (req.url === '/api/sendFile' && !aceitaFicheiros) { res.statusCode = 422; return res.end('{"message":"Plus only"}'); }
      if (req.url === '/api/sendFile' || req.url === '/api/sendText') return res.end('{"id":"x"}');
      res.statusCode = 404; res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, pedidos, url: `http://127.0.0.1:${server.address().port}` })));
}

function carregar(url) {
  for (const k of Object.keys(require.cache)) if (k.includes('/src/')) delete require.cache[k];
  process.env.WHATSAPP_API_URL = url;
  process.env.WHATSAPP_API_KEY = 'chave-teste';
  return require('../src/whatsapp');
}

test('envia o PDF com a mensagem como legenda', async () => {
  const m = await mock({ aceitaFicheiros: true });
  const wa = carregar(m.url);
  const r = await wa.enviarOrcamento('351912345678', 'Olá', Buffer.from('%PDF-1.4'), 'Orcamento.pdf');
  m.server.close();
  assert.deepStrictEqual(r, { comPdf: true });
  const f = m.pedidos.find((p) => p.url === '/api/sendFile');
  assert.strictEqual(f.key, 'chave-teste');
  assert.strictEqual(f.body.chatId, '351912345678@c.us');
  assert.strictEqual(f.body.caption, 'Olá');
  assert.strictEqual(f.body.file.mimetype, 'application/pdf');
  assert.strictEqual(Buffer.from(f.body.file.data, 'base64').toString(), '%PDF-1.4');
});

test('se a ponte recusar ficheiros, envia só a mensagem (com o link)', async () => {
  const m = await mock({ aceitaFicheiros: false });
  const wa = carregar(m.url);
  const r = await wa.enviarOrcamento('351912345678', 'Olá, veja: http://x/o/abc', Buffer.from('%PDF'), 'O.pdf');
  m.server.close();
  assert.deepStrictEqual(r, { comPdf: false });
  assert.ok(m.pedidos.some((p) => p.url === '/api/sendText' && p.body.text.includes('/o/abc')));
});

test('número sem WhatsApp dá erro claro', async () => {
  const m = await mock({ aceitaFicheiros: true });
  const wa = carregar(m.url);
  await assert.rejects(wa.enviarOrcamento('351900000000', 'Olá', null, ''), /não tem WhatsApp/);
  m.server.close();
});

test('o número do orçamento não vira link de telefone', () => {
  const wa = carregar('');
  assert.strictEqual(wa.semLink('ORC 2026/0001'), 'ORC 2026⁠/⁠0001');
  assert.strictEqual(wa.configurado(), false);
});
