'use strict';

const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const calculo = require('./calculo');
const { getSettings, today, parseNum, round2, str, dataPt } = require('./util');

const COND = ['cond_prazo', 'cond_pagamento', 'cond_garantia', 'cond_incluido', 'cond_excluido'];

function proximoNumero(ano) {
  const s = getSettings();
  const seq = (db.prepare('SELECT MAX(seq) AS m FROM orcamentos WHERE ano = ?').get(ano).m || 0) + 1;
  const prefixo = (s.numero_prefixo || '').trim();
  return { seq, numero: `${prefixo ? `${prefixo} ` : ''}${ano}/${String(seq).padStart(4, '0')}` };
}

function clienteSnapshot(cliente) {
  if (!cliente) return { cliente_id: null, cliente_nome: '', cliente_nif: '', cliente_email: '', cliente_telefone: '', cliente_morada: '' };
  const morada = [cliente.morada, [cliente.codigo_postal, cliente.localidade].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    cliente_id: cliente.id,
    cliente_nome: cliente.nome,
    cliente_nif: cliente.nif,
    cliente_email: cliente.email,
    cliente_telefone: cliente.telemovel || cliente.telefone,
    cliente_morada: morada,
  };
}

function criar({ cliente = null, titulo = '', obra_local = '' } = {}) {
  const s = getSettings();
  const data = today();
  const ano = Number(data.slice(0, 4));
  return db.transaction(() => {
    const { seq, numero } = proximoNumero(ano);
    const row = {
      numero, ano, seq,
      token: crypto.randomBytes(18).toString('base64url'),
      ...clienteSnapshot(cliente),
      titulo: str(titulo, 200),
      obra_local: str(obra_local, 300),
      data,
      validade_dias: Math.max(1, Math.round(parseNum(s.validade_dias, 30))),
      introducao: s.introducao || '',
      observacoes: s.observacoes || '',
      iva_taxa: parseNum(s.iva_taxa, 23),
    };
    for (const k of COND) row[k] = s[k] || '';
    const cols = Object.keys(row);
    const info = db.prepare(`INSERT INTO orcamentos (${cols.join(',')}) VALUES (${cols.map((c) => `@${c}`).join(',')})`).run(row);
    return info.lastInsertRowid;
  })();
}

function get(id) {
  return db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
}

function porToken(token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  return db.prepare('SELECT * FROM orcamentos WHERE token = ?').get(token);
}

function linhas(id) {
  return db.prepare('SELECT * FROM orcamento_linhas WHERE orcamento_id = ? ORDER BY posicao, id').all(id);
}

function fotos(id, soPdf = false) {
  return db.prepare(`SELECT * FROM orcamento_fotos WHERE orcamento_id = ?${soPdf ? ' AND no_pdf = 1' : ''} ORDER BY posicao, id`).all(id);
}

function envios(id) {
  return db.prepare('SELECT * FROM envios WHERE orcamento_id = ? ORDER BY id DESC').all(id);
}

function completo(id) {
  const orc = get(id);
  if (!orc) return null;
  return { orc, linhas: linhas(id), fotos: fotos(id) };
}

// Grava cabeçalho + linhas (substitui todas as linhas) e recalcula os totais.
function gravar(id, dados, linhasRaw) {
  const orc = get(id);
  if (!orc) return null;
  const novas = (Array.isArray(linhasRaw) ? linhasRaw : []).slice(0, 300).map(calculo.normalizarLinha);
  const cab = {
    titulo: str(dados.titulo, 200),
    obra_local: str(dados.obra_local, 300),
    data: /^\d{4}-\d{2}-\d{2}$/.test(dados.data || '') ? dados.data : orc.data,
    validade_dias: Math.min(365, Math.max(1, Math.round(parseNum(dados.validade_dias, orc.validade_dias)))),
    introducao: str(dados.introducao, 4000),
    observacoes: str(dados.observacoes, 4000),
    notas_internas: str(dados.notas_internas, 4000),
    desconto_pct: Math.min(100, Math.max(0, parseNum(dados.desconto_pct, 0))),
    iva_taxa: Math.min(100, Math.max(0, parseNum(dados.iva_taxa, 23))),
    iva_motivo: str(dados.iva_motivo, 300),
    mostrar_precos_linha: dados.mostrar_precos_linha ? 1 : 0,
    cliente_nome: str(dados.cliente_nome, 200),
    cliente_nif: str(dados.cliente_nif, 40),
    cliente_email: str(dados.cliente_email, 200),
    cliente_telefone: str(dados.cliente_telefone, 60),
    cliente_morada: str(dados.cliente_morada, 400),
  };
  for (const k of COND) cab[k] = str(dados[k], 2000);
  Object.assign(cab, calculo.totais(novas, cab));

  db.transaction(() => {
    const sets = Object.keys(cab).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE orcamentos SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...cab, id });
    db.prepare('DELETE FROM orcamento_linhas WHERE orcamento_id = ?').run(id);
    const ins = db.prepare(`INSERT INTO orcamento_linhas
      (orcamento_id, posicao, tipo, artigo_id, referencia, descricao, detalhe, quantidade, unidade, largura, altura, desenho,
       serie, cor, vidro, preco_unitario, desconto_pct, total, imagem)
      VALUES (@orcamento_id, @posicao, @tipo, @artigo_id, @referencia, @descricao, @detalhe, @quantidade, @unidade, @largura, @altura, @desenho,
       @serie, @cor, @vidro, @preco_unitario, @desconto_pct, @total, @imagem)`);
    for (const l of novas) ins.run({ ...l, orcamento_id: id });
  })();
  return get(id);
}

function mudarCliente(id, cliente) {
  const snap = clienteSnapshot(cliente);
  const sets = Object.keys(snap).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE orcamentos SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...snap, id });
}

function mudarEstado(id, estado, extra = {}) {
  const campos = { estado };
  if (estado === 'enviado') campos.enviado_em = extra.enviado_em || new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (estado === 'aceite') { campos.aceite_em = new Date().toISOString().slice(0, 19).replace('T', ' '); campos.aceite_nome = str(extra.aceite_nome, 200); }
  if (estado === 'recusado') campos.recusado_em = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (estado === 'rascunho') Object.assign(campos, { aceite_em: null, aceite_nome: '', recusado_em: null });
  const sets = Object.keys(campos).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE orcamentos SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...campos, id });
}

// Marca como enviado (só se ainda for rascunho: não desfaz um "aceite").
function marcarEnviado(id) {
  const orc = get(id);
  if (orc && orc.estado === 'rascunho') mudarEstado(id, 'enviado');
  else if (orc && !orc.enviado_em) db.prepare("UPDATE orcamentos SET enviado_em = datetime('now') WHERE id = ?").run(id);
}

function registarEnvio(id, canal, destino, ok = true, detalhe = '') {
  db.prepare('INSERT INTO envios (orcamento_id, canal, destino, ok, detalhe) VALUES (?, ?, ?, ?, ?)').run(id, canal, destino, ok ? 1 : 0, str(detalhe, 500));
}

function duplicar(id) {
  const src = completo(id);
  if (!src) return null;
  const cliente = src.orc.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(src.orc.cliente_id) : null;
  const novoId = criar({ cliente, titulo: src.orc.titulo, obra_local: src.orc.obra_local });
  const { orc } = src;
  // Com ficha de cliente, usa os dados atuais da ficha; sem ficha, mantém os do orçamento original.
  const dados = { ...orc, data: today(), ...(cliente ? clienteSnapshot(cliente) : {}) };
  gravar(novoId, dados, src.linhas);
  // As fotografias são partilhadas (mesmo ficheiro); apagar num orçamento só apaga o ficheiro se mais nenhum o usar.
  const insF = db.prepare('INSERT INTO orcamento_fotos (orcamento_id, filename, legenda, no_pdf, posicao) VALUES (?, ?, ?, ?, ?)');
  for (const f of src.fotos) insF.run(novoId, f.filename, f.legenda, f.no_pdf, f.posicao);
  return novoId;
}

function ficheiroEmUso(filename) {
  return Boolean(
    db.prepare('SELECT 1 FROM orcamento_fotos WHERE filename = ? LIMIT 1').get(filename) ||
    db.prepare('SELECT 1 FROM orcamento_linhas WHERE imagem = ? LIMIT 1').get(filename) ||
    db.prepare('SELECT 1 FROM artigos WHERE imagem = ? LIMIT 1').get(filename),
  );
}

function linkPublico(orc, baseUrl) {
  return `${config.publicUrl || baseUrl}/o/${orc.token}`;
}

function nomePdf(orc) {
  return `Orcamento-${orc.numero.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
}

// Mensagem do WhatsApp a partir do modelo em Definições.
function mensagemEnvio(orc, link) {
  const s = getSettings();
  const modelo = s.whatsapp_mensagem || 'Segue o orçamento {{numero}}: {{link}}';
  const primeiro = (orc.cliente_nome || '').split(/\s+/)[0] || '';
  const empresa = /\b(lda|sa|unipessoal|limitada)\b/i.test(orc.cliente_nome || '');
  const vars = {
    saudacao: primeiro && !empresa ? ` ${primeiro}` : '',
    cliente: orc.cliente_nome || '',
    numero: orc.numero,
    obra: orc.obra_local ? ` para ${orc.obra_local}` : (orc.titulo ? ` (${orc.titulo})` : ''),
    titulo: orc.titulo || '',
    total: require('./util').eur(orc.total),
    validade: dataPt(calculo.validade(orc)),
    link,
  };
  return modelo.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function lista({ q = '', estado = '', cliente_id = null, limit = 500 } = {}) {
  const where = [];
  const params = {};
  if (q) { where.push('(o.numero LIKE @q OR o.cliente_nome LIKE @q OR o.titulo LIKE @q OR o.obra_local LIKE @q)'); params.q = `%${q}%`; }
  if (cliente_id) { where.push('o.cliente_id = @cid'); params.cid = cliente_id; }
  if (estado === 'expirado') {
    where.push("o.estado = 'enviado' AND date(o.data, '+' || o.validade_dias || ' days') < date('now')");
  } else if (estado === 'enviado') {
    where.push("o.estado = 'enviado' AND date(o.data, '+' || o.validade_dias || ' days') >= date('now')");
  } else if (estado) {
    where.push('o.estado = @estado'); params.estado = estado;
  }
  params.limit = limit;
  return db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM orcamento_linhas l WHERE l.orcamento_id = o.id AND l.tipo = 'vao') AS n_vaos
    FROM orcamentos o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY o.ano DESC, o.seq DESC LIMIT @limit`).all(params);
}

module.exports = {
  criar, get, porToken, linhas, fotos, envios, completo, gravar, mudarCliente, mudarEstado, marcarEnviado,
  registarEnvio, duplicar, ficheiroEmUso, linkPublico, nomePdf, mensagemEnvio, lista, clienteSnapshot, round2,
};
