'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const orcamentos = require('../orcamentos');
const { saveSettings, today } = require('../util');
const { flash } = require('../web');

const router = express.Router();

router.get('/', (req, res) => {
  const ano = Number(today().slice(0, 4));
  const r = (sql, ...p) => db.prepare(sql).get(...p);
  const abertos = "estado = 'enviado' AND date(data, '+' || validade_dias || ' days') >= date('now')";
  const stats = {
    rascunhos: r("SELECT COUNT(*) AS n FROM orcamentos WHERE estado = 'rascunho'").n,
    abertos: r(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS v FROM orcamentos WHERE ${abertos}`),
    aceites: r("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS v FROM orcamentos WHERE estado = 'aceite' AND ano = ?", ano),
    decididos: r("SELECT COUNT(*) AS n FROM orcamentos WHERE estado IN ('aceite', 'recusado') AND ano = ?", ano).n,
    clientes: r('SELECT COUNT(*) AS n FROM clientes WHERE arquivado = 0').n,
    aExpirar: db.prepare(`SELECT * FROM orcamentos WHERE ${abertos} AND date(data, '+' || validade_dias || ' days') <= date('now', '+7 days') ORDER BY date(data, '+' || validade_dias || ' days')`).all(),
  };
  stats.taxa = stats.decididos ? Math.round((stats.aceites.n / stats.decididos) * 100) : null;
  res.render('painel', {
    title: 'Painel',
    ano,
    stats,
    recentes: orcamentos.lista({ limit: 8 }),
    precosRevistos: res.locals.settings.precos_revistos === '1',
  });
});

router.post('/precos-revistos', auth.requireCsrf, (req, res) => {
  saveSettings({ precos_revistos: '1' });
  flash(res, 'Aviso dos preços de exemplo removido.');
  res.redirect('/');
});

module.exports = router;
