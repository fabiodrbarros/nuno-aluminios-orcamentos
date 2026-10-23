'use strict';

// Cálculo dos valores de um orçamento. Lógica pura (sem base de dados) para poder ser testada.

const { round2, parseNum } = require('./util');
const desenho = require('./desenho');

const TIPOS_LINHA = ['vao', 'artigo', 'secao', 'texto'];
const UNIDADES = { un: 'un.', m2: 'm²', ml: 'm', vg: 'vg' };

// Preço sugerido de um vão a partir do artigo: €/m² × área (com mínimo) ou preço por unidade.
function precoSugerido(artigo, largura, altura) {
  if (!artigo) return 0;
  if (artigo.unidade !== 'm2') return round2(artigo.preco);
  const area = desenho.area(largura, altura);
  if (!area) return round2(artigo.preco * Math.max(artigo.area_minima || 0, 1));
  return round2(artigo.preco * Math.max(area, artigo.area_minima || 0));
}

function totalLinha(l) {
  if (l.tipo === 'secao' || l.tipo === 'texto') return 0;
  const bruto = parseNum(l.quantidade, 0) * parseNum(l.preco_unitario, 0);
  return round2(bruto * (1 - Math.min(100, Math.max(0, parseNum(l.desconto_pct, 0))) / 100));
}

function totais(linhas, { desconto_pct = 0, iva_taxa = 23 } = {}) {
  const subtotal = round2(linhas.reduce((a, l) => a + totalLinha(l), 0));
  const desc = Math.min(100, Math.max(0, parseNum(desconto_pct, 0)));
  const desconto_valor = round2(subtotal * desc / 100);
  const base = round2(subtotal - desconto_valor);
  const iva_valor = round2(base * Math.max(0, parseNum(iva_taxa, 0)) / 100);
  return { subtotal, desconto_valor, base, iva_valor, total: round2(base + iva_valor) };
}

// Normaliza uma linha vinda do editor (JSON) antes de gravar.
function normalizarLinha(raw, i) {
  const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
  const tipo = TIPOS_LINHA.includes(raw.tipo) ? raw.tipo : 'artigo';
  const l = {
    posicao: i,
    tipo,
    artigo_id: Number(raw.artigo_id) > 0 ? Number(raw.artigo_id) : null,
    referencia: s(raw.referencia, 20),
    descricao: s(raw.descricao, 300),
    detalhe: s(raw.detalhe, 2000),
    quantidade: tipo === 'secao' || tipo === 'texto' ? 0 : Math.max(0, parseNum(raw.quantidade, 1)),
    unidade: UNIDADES[raw.unidade] ? raw.unidade : 'un',
    largura: tipo === 'vao' ? Math.max(0, Math.round(parseNum(raw.largura, 0))) : 0,
    altura: tipo === 'vao' ? Math.max(0, Math.round(parseNum(raw.altura, 0))) : 0,
    desenho: tipo === 'vao' ? desenho.stringify(raw.desenho) : '',
    serie: s(raw.serie, 120),
    cor: s(raw.cor, 120),
    vidro: s(raw.vidro, 120),
    preco_unitario: round2(Math.max(0, parseNum(raw.preco_unitario, 0))),
    desconto_pct: Math.min(100, Math.max(0, parseNum(raw.desconto_pct, 0))),
    imagem: /^[a-z0-9-]+\.(jpg|png)$/.test(String(raw.imagem || '')) ? raw.imagem : '',
  };
  l.total = totalLinha(l);
  return l;
}

function validade(orc) {
  const d = new Date(`${orc.data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(orc.validade_dias || 0));
  return d.toISOString().slice(0, 10);
}

// Estado mostrado: um orçamento enviado cuja validade passou aparece como "expirado".
function estadoVisivel(orc, hoje) {
  if (orc.estado === 'enviado' && validade(orc) < hoje) return 'expirado';
  return orc.estado;
}

const ESTADOS = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aceite: 'Aceite',
  recusado: 'Recusado',
  expirado: 'Expirado',
};

module.exports = { TIPOS_LINHA, UNIDADES, ESTADOS, precoSugerido, totalLinha, totais, normalizarLinha, validade, estadoVisivel };
