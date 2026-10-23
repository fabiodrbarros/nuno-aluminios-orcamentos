'use strict';

const express = require('express');
const db = require('../db');
const auth = require('../auth');
const desenho = require('../desenho');
const orcamentos = require('../orcamentos');
const { str, parseNum, round2, saveSettings } = require('../util');
const { withUpload, removeUpload, flash } = require('../web');

const router = express.Router();

const CATEGORIAS = { janela: 'Janelas', porta: 'Portas', envidracado: 'Envidraçados', acessorio: 'Estores e acessórios', servico: 'Serviços' };
const UNIDADES = { un: 'Unidade', m2: 'm² (área do vão)', ml: 'Metro linear', vg: 'Verba global' };

function ler(body, atual = {}) {
  const tipo = body.tipo === 'artigo' ? 'artigo' : 'vao';
  return {
    categoria: CATEGORIAS[body.categoria] ? body.categoria : 'janela',
    tipo,
    nome: str(body.nome, 200),
    descricao: str(body.descricao, 2000),
    unidade: UNIDADES[body.unidade] ? body.unidade : 'un',
    preco: round2(Math.max(0, parseNum(body.preco, 0))),
    area_minima: Math.max(0, parseNum(body.area_minima, 0)),
    desenho: tipo === 'vao' ? desenho.stringify(body.desenho) : '',
    largura: Math.max(0, Math.round(parseNum(body.largura, 0))),
    altura: Math.max(0, Math.round(parseNum(body.altura, 0))),
    serie: str(body.serie, 120),
    imagem: atual.imagem || '',
    ativo: body.ativo ? 1 : 0,
  };
}

router.get('/', (req, res) => {
  const artigos = db.prepare('SELECT * FROM artigos ORDER BY posicao, nome').all();
  res.render('artigos/lista', { title: 'Artigos e preços', artigos, CATEGORIAS, UNIDADES, desenho });
});

router.get('/novo', (req, res) => {
  res.render('artigos/form', {
    title: 'Novo artigo', artigo: { tipo: 'vao', categoria: 'janela', unidade: 'm2', ativo: 1, desenho: '{"folhas":[{"t":"batente-e"}]}', largura: 1000, altura: 1200 }, erros: {}, CATEGORIAS, UNIDADES, desenho,
  });
});

function gravar(req, res, atual) {
  const a = ler(req.body, atual || {});
  if (!a.nome) {
    return res.status(400).render('artigos/form', { title: atual ? 'Editar artigo' : 'Novo artigo', artigo: { ...atual, ...a }, erros: { nome: 'Indique o nome.' }, CATEGORIAS, UNIDADES, desenho });
  }
  if (req.images && req.images.length) {
    if (atual && atual.imagem) {
      const antiga = atual.imagem;
      a.imagem = req.images[0];
      setImmediate(() => { if (!orcamentos.ficheiroEmUso(antiga)) removeUpload(antiga); });
    } else a.imagem = req.images[0];
  }
  if (req.body.remover_imagem && atual && atual.imagem) {
    const antiga = atual.imagem;
    a.imagem = '';
    setImmediate(() => { if (!orcamentos.ficheiroEmUso(antiga)) removeUpload(antiga); });
  }
  const cols = Object.keys(a);
  let id;
  if (atual) {
    db.prepare(`UPDATE artigos SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`).run({ ...a, id: atual.id });
    id = atual.id;
  } else {
    const pos = db.prepare('SELECT COALESCE(MAX(posicao), -1) + 1 AS p FROM artigos').get().p;
    id = db.prepare(`INSERT INTO artigos (${cols.join(',')}, posicao) VALUES (${cols.map((c) => `@${c}`).join(',')}, @posicao)`).run({ ...a, posicao: pos }).lastInsertRowid;
  }
  saveSettings({ precos_revistos: '1' }); // quem edita artigos já está a rever os preços
  flash(res, atual ? 'Artigo atualizado.' : 'Artigo criado.');
  res.redirect('/artigos');
}

router.post('/novo', ...withUpload('imagem', 1, (req, res) => gravar(req, res, null)));

router.get('/:id(\\d+)', (req, res, next) => {
  const artigo = db.prepare('SELECT * FROM artigos WHERE id = ?').get(req.params.id);
  if (!artigo) return next();
  res.render('artigos/form', { title: 'Editar artigo', artigo, erros: {}, CATEGORIAS, UNIDADES, desenho });
});

router.post('/:id(\\d+)', ...withUpload('imagem', 1, (req, res, next) => {
  const artigo = db.prepare('SELECT * FROM artigos WHERE id = ?').get(req.params.id);
  if (!artigo) return next();
  gravar(req, res, artigo);
}));

router.post('/:id(\\d+)/mover', auth.requireCsrf, (req, res) => {
  const lista = db.prepare('SELECT id FROM artigos ORDER BY posicao, nome').all().map((r) => r.id);
  const i = lista.indexOf(Number(req.params.id));
  const j = req.body.dir === 'up' ? i - 1 : i + 1;
  if (i >= 0 && j >= 0 && j < lista.length) {
    [lista[i], lista[j]] = [lista[j], lista[i]];
    const upd = db.prepare('UPDATE artigos SET posicao = ? WHERE id = ?');
    db.transaction(() => lista.forEach((id, p) => upd.run(p, id)))();
  }
  res.redirect('/artigos');
});

router.post('/:id(\\d+)/apagar', auth.requireCsrf, (req, res) => {
  const a = db.prepare('SELECT * FROM artigos WHERE id = ?').get(req.params.id);
  if (a) {
    db.prepare('DELETE FROM artigos WHERE id = ?').run(a.id); // as linhas já feitas guardam a sua cópia dos dados
    if (a.imagem && !orcamentos.ficheiroEmUso(a.imagem)) removeUpload(a.imagem);
    flash(res, 'Artigo apagado.');
  }
  res.redirect('/artigos');
});

module.exports = router;
