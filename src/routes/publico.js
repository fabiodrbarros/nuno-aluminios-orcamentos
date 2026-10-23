'use strict';

// Página pública do orçamento (link enviado ao cliente): ver, descarregar PDF e aceitar.

const express = require('express');
const db = require('../db');
const orcamentos = require('../orcamentos');
const calculo = require('../calculo');
const pdf = require('../pdf');
const desenho = require('../desenho');
const { rateLimiter, str, today } = require('../util');

const router = express.Router();
const limiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 60 });

function carregar(req, res, next) {
  if (!limiter.hit(req.ip)) return res.status(429).send('Demasiados pedidos. Tente novamente dentro de alguns minutos.');
  const orc = orcamentos.porToken(req.params.token);
  // Rascunhos não são públicos: o link só funciona depois de enviado (ou para quem tem sessão).
  if (!orc || (orc.estado === 'rascunho' && !req.user)) {
    return res.status(404).render('publico/indisponivel', { title: 'Orçamento indisponível' });
  }
  req.orc = orc;
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

router.get('/o/:token', carregar, (req, res) => {
  const { orc } = req;
  if (!req.user && !orc.visto_em) db.prepare("UPDATE orcamentos SET visto_em = datetime('now') WHERE id = ?").run(orc.id);
  const estado = calculo.estadoVisivel(orc, today());
  res.render('publico/orcamento', {
    title: `Orçamento ${orc.numero}`,
    orc,
    estado,
    linhas: orcamentos.linhas(orc.id),
    fotos: orcamentos.fotos(orc.id, true),
    validade: calculo.validade(orc),
    podeAceitar: estado === 'enviado',
    preview: Boolean(req.user),
    ok: req.query.ok === '1',
    desenho,
  });
});

router.get('/o/:token/pdf', carregar, async (req, res, next) => {
  try {
    const buf = await pdf.gerar(orcamentos.completo(req.orc.id));
    res.set('Content-Disposition', `inline; filename="${orcamentos.nomePdf(req.orc)}"`);
    res.type('application/pdf').send(buf);
  } catch (err) { next(err); }
});

router.post('/o/:token/aceitar', carregar, (req, res) => {
  const { orc } = req;
  const nome = str(req.body.nome, 200);
  if (calculo.estadoVisivel(orc, today()) !== 'enviado' || !nome || !req.body.confirmo) {
    return res.redirect(`/o/${orc.token}`);
  }
  orcamentos.mudarEstado(orc.id, 'aceite', { aceite_nome: nome });
  orcamentos.registarEnvio(orc.id, 'aceite-online', nome, true, `IP ${req.ip}`);
  res.redirect(`/o/${orc.token}?ok=1`);
});

module.exports = router;
