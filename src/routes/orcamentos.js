'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const orcamentos = require('../orcamentos');
const calculo = require('../calculo');
const pdf = require('../pdf');
const whatsapp = require('../whatsapp');
const desenho = require('../desenho');
const { getSettings, lines, str, phoneDigits, phonePretty } = require('../util');
const { withUpload, removeUpload, flash, wantsJson, baseUrl } = require('../web');

const router = express.Router();

function carregar(req, res, next) {
  const orc = orcamentos.get(req.params.id);
  if (!orc) return res.status(404).render('erro', { title: 'Orçamento não encontrado', mensagem: 'Este orçamento não existe ou foi apagado.' });
  req.orc = orc;
  next();
}

function artigosAtivos() {
  return db.prepare('SELECT * FROM artigos WHERE ativo = 1 ORDER BY posicao, nome').all();
}

// Número de WhatsApp do cliente: o da ficha (campo WhatsApp, senão telemóvel); sem ficha, o contacto do orçamento.
function numeroCliente(orc) {
  const c = orc.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(orc.cliente_id) : null;
  const candidatos = c ? [c.whatsapp, c.telemovel, c.telefone] : [orc.cliente_telefone];
  for (const x of candidatos) {
    const d = phoneDigits(x);
    if (d) return d;
  }
  return null;
}

router.get('/', (req, res) => {
  const q = str(req.query.q, 100);
  const estado = Object.keys(calculo.ESTADOS).includes(req.query.estado) ? req.query.estado : '';
  res.render('orcamentos/lista', { title: 'Orçamentos', q, estado, orcs: orcamentos.lista({ q, estado }) });
});

router.get('/novo', (req, res) => {
  res.render('orcamentos/novo', { title: 'Novo orçamento', recentes: db.prepare('SELECT * FROM clientes WHERE arquivado = 0 ORDER BY updated_at DESC LIMIT 6').all() });
});

router.post('/novo', auth.requireCsrf, (req, res) => {
  const cliente = req.body.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.body.cliente_id) : null;
  const id = orcamentos.criar({ cliente, titulo: req.body.titulo, obra_local: req.body.obra_local });
  res.redirect(`/orcamentos/${id}`);
});

router.get('/:id(\\d+)', carregar, (req, res) => {
  const s = getSettings();
  const linhas = orcamentos.linhas(req.orc.id);
  res.render('orcamentos/editor', {
    title: req.orc.numero,
    orc: req.orc,
    linhas,
    fotos: orcamentos.fotos(req.orc.id),
    envios: orcamentos.envios(req.orc.id),
    artigos: artigosAtivos(),
    listas: { series: lines(s.lista_series), cores: lines(s.lista_cores), vidros: lines(s.lista_vidros), ivaMotivos: lines(s.lista_iva_motivos) },
    link: orcamentos.linkPublico(req.orc, baseUrl(req)),
    tipos: desenho.TIPOS,
  });
});

// Gravação do editor (JSON). Devolve os totais recalculados.
router.post('/:id(\\d+)', auth.requireCsrf, carregar, (req, res) => {
  let linhasRaw = req.body.linhas;
  if (linhasRaw === undefined) linhasRaw = orcamentos.linhas(req.orc.id); // sem editor (JS): não apagar as linhas
  if (typeof linhasRaw === 'string') {
    try { linhasRaw = JSON.parse(linhasRaw); } catch { linhasRaw = []; }
  }
  const orc = orcamentos.gravar(req.orc.id, req.body, linhasRaw);
  if (wantsJson(req)) {
    return res.json({ ok: true, totais: { subtotal: orc.subtotal, desconto_valor: orc.desconto_valor, base: orc.base, iva_valor: orc.iva_valor, total: orc.total }, updated_at: orc.updated_at });
  }
  flash(res, 'Orçamento gravado.');
  res.redirect(`/orcamentos/${orc.id}`);
});

router.post('/:id(\\d+)/cliente', auth.requireCsrf, carregar, (req, res) => {
  const cliente = req.body.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.body.cliente_id) : null;
  orcamentos.mudarCliente(req.orc.id, cliente);
  if (wantsJson(req)) return res.json({ ok: true, orc: orcamentos.get(req.orc.id) });
  flash(res, cliente ? 'Cliente associado.' : 'Cliente removido do orçamento.');
  res.redirect(`/orcamentos/${req.orc.id}`);
});

router.get('/:id(\\d+)/pdf', carregar, async (req, res, next) => {
  try {
    const buf = await pdf.gerar(orcamentos.completo(req.orc.id));
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${orcamentos.nomePdf(req.orc)}"`);
    res.type('application/pdf').send(buf);
  } catch (err) { next(err); }
});

router.post('/:id(\\d+)/estado', auth.requireCsrf, carregar, (req, res) => {
  const estado = ['rascunho', 'enviado', 'aceite', 'recusado'].includes(req.body.estado) ? req.body.estado : null;
  if (estado) orcamentos.mudarEstado(req.orc.id, estado, { aceite_nome: req.body.aceite_nome || req.orc.cliente_nome });
  flash(res, estado ? `Estado: ${calculo.ESTADOS[estado]}.` : 'Estado inválido.', estado ? 'ok' : 'error');
  res.redirect(`/orcamentos/${req.orc.id}`);
});

router.post('/:id(\\d+)/duplicar', auth.requireCsrf, carregar, (req, res) => {
  const id = orcamentos.duplicar(req.orc.id);
  flash(res, `Cópia criada a partir de ${req.orc.numero}.`);
  res.redirect(`/orcamentos/${id}`);
});

router.post('/:id(\\d+)/apagar', auth.requireCsrf, carregar, (req, res) => {
  const ficheiros = [
    ...orcamentos.fotos(req.orc.id).map((f) => f.filename),
    ...orcamentos.linhas(req.orc.id).map((l) => l.imagem).filter(Boolean),
  ];
  db.prepare('DELETE FROM orcamentos WHERE id = ?').run(req.orc.id);
  for (const f of new Set(ficheiros)) if (!orcamentos.ficheiroEmUso(f)) removeUpload(f);
  flash(res, `Orçamento ${req.orc.numero} apagado.`);
  res.redirect('/orcamentos');
});

/* ---------- Imagens ---------- */
// Imagem de uma linha (o editor guarda o nome do ficheiro na linha).
router.post('/:id(\\d+)/imagem', carregar, ...withUpload('imagem', 1, (req, res) => {
  if (!req.images.length) return res.status(400).json({ error: 'Envie uma fotografia JPEG ou PNG.' });
  res.json({ ok: true, filename: req.images[0], url: `/media/${req.images[0]}` });
}));

router.post('/:id(\\d+)/fotos', carregar, ...withUpload('fotos', 20, (req, res) => {
  let pos = db.prepare('SELECT COALESCE(MAX(posicao), -1) AS m FROM orcamento_fotos WHERE orcamento_id = ?').get(req.orc.id).m;
  const ins = db.prepare('INSERT INTO orcamento_fotos (orcamento_id, filename, posicao) VALUES (?, ?, ?)');
  for (const f of req.images) ins.run(req.orc.id, f, ++pos);
  if (wantsJson(req)) return res.json({ ok: true, fotos: orcamentos.fotos(req.orc.id) });
  flash(res, req.images.length ? 'Fotografias adicionadas.' : 'Nenhuma fotografia válida (JPEG ou PNG).', req.images.length ? 'ok' : 'error');
  res.redirect(`/orcamentos/${req.orc.id}#fotos`);
}));

router.post('/:id(\\d+)/fotos/:fid(\\d+)', auth.requireCsrf, carregar, (req, res) => {
  const f = db.prepare('SELECT * FROM orcamento_fotos WHERE id = ? AND orcamento_id = ?').get(req.params.fid, req.orc.id);
  if (!f) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  if (req.body.apagar) {
    db.prepare('DELETE FROM orcamento_fotos WHERE id = ?').run(f.id);
    if (!orcamentos.ficheiroEmUso(f.filename)) removeUpload(f.filename);
  } else {
    db.prepare('UPDATE orcamento_fotos SET legenda = ?, no_pdf = ? WHERE id = ?').run(str(req.body.legenda, 200), req.body.no_pdf === '0' || req.body.no_pdf === false ? 0 : 1, f.id);
  }
  if (wantsJson(req)) return res.json({ ok: true });
  res.redirect(`/orcamentos/${req.orc.id}#fotos`);
});

/* ---------- Envio ---------- */
router.get('/:id(\\d+)/enviar', carregar, async (req, res) => {
  const link = orcamentos.linkPublico(req.orc, baseUrl(req));
  const digitos = numeroCliente(req.orc);
  const mensagem = orcamentos.mensagemEnvio(req.orc, link);
  const wa = res.locals.waOn ? await whatsapp.estado() : null;
  res.render('orcamentos/enviar', {
    title: `Enviar ${req.orc.numero}`,
    orc: req.orc,
    link,
    digitos,
    numero: phonePretty(digitos),
    mensagem,
    wa,
    envios: orcamentos.envios(req.orc.id),
    nLinhas: orcamentos.linhas(req.orc.id).length,
    publicUrlOk: Boolean(require('../config').publicUrl),
  });
});

router.post('/:id(\\d+)/enviar/whatsapp', auth.requireCsrf, carregar, async (req, res) => {
  const digitos = phoneDigits(req.body.numero) || numeroCliente(req.orc);
  const mensagem = str(req.body.mensagem, 4000) || orcamentos.mensagemEnvio(req.orc, orcamentos.linkPublico(req.orc, baseUrl(req)));
  if (!digitos) {
    flash(res, 'Indique um número de telemóvel válido.', 'error');
    return res.redirect(`/orcamentos/${req.orc.id}/enviar`);
  }
  try {
    const anexar = getSettings().whatsapp_anexar_pdf === '1';
    const buf = anexar ? await pdf.gerar(orcamentos.completo(req.orc.id)) : null;
    const r = await whatsapp.enviarOrcamento(digitos, mensagem, buf, orcamentos.nomePdf(req.orc));
    orcamentos.registarEnvio(req.orc.id, 'whatsapp', phonePretty(digitos), true, r.comPdf ? 'PDF + mensagem' : 'mensagem com link');
    orcamentos.marcarEnviado(req.orc.id);
    flash(res, `Enviado por WhatsApp para ${phonePretty(digitos)}${r.comPdf ? ' (com PDF)' : ' (mensagem com link)'}.`);
    res.redirect(`/orcamentos/${req.orc.id}`);
  } catch (err) {
    orcamentos.registarEnvio(req.orc.id, 'whatsapp', phonePretty(digitos), false, err.message);
    flash(res, `Não foi possível enviar: ${err.message}`, 'error');
    res.redirect(`/orcamentos/${req.orc.id}/enviar`);
  }
});

// Envio manual (wa.me ou email): regista e marca como enviado; o navegador abre o WhatsApp/email.
router.post('/:id(\\d+)/enviar/manual', auth.requireCsrf, carregar, (req, res) => {
  const canal = ['whatsapp-manual', 'email', 'link'].includes(req.body.canal) ? req.body.canal : 'link';
  orcamentos.registarEnvio(req.orc.id, canal, str(req.body.destino, 200), true, '');
  orcamentos.marcarEnviado(req.orc.id);
  if (wantsJson(req)) return res.json({ ok: true });
  flash(res, 'Envio registado.');
  res.redirect(`/orcamentos/${req.orc.id}`);
});

module.exports = router;
