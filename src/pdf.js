'use strict';

// PDF do orçamento (PDFKit, só JavaScript: não precisa de browser nem de bibliotecas de sistema).
// Composição baseada no papel timbrado e no modelo de orçamento da identidade visual NUNO.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const config = require('./config');
const desenho = require('./desenho');
const calculo = require('./calculo');
const { eur, num, dataPt, getSettings } = require('./util');

const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = fs.readFileSync(path.join(ASSETS, 'nuno-horizontal-claro.svg'), 'utf8');
const SIMBOLO = fs.readFileSync(path.join(ASSETS, 'nuno-simbolo-claro.svg'), 'utf8');

const C = { ink: '#171A17', lime: '#A6CE39', muted: '#6B7168', border: '#D7DCD1', paper: '#F3F4EF', silver: '#9CA3AF' };
const PAGE = { w: 595.28, h: 841.89 };
const M = { l: 48, r: 48, top: 40, bottom: 72 };
const W = PAGE.w - M.l - M.r;
const LIMITE = PAGE.h - M.bottom - 8;

function imagemValida(file) {
  if (!file) return null;
  const p = path.join(config.uploadsDir, path.basename(file));
  try {
    const fd = fs.openSync(p, 'r');
    const b = Buffer.alloc(8);
    fs.readSync(fd, b, 0, 8, 0);
    fs.closeSync(fd);
    const hex = b.toString('hex');
    return hex.startsWith('ffd8ff') || hex.startsWith('89504e47') ? p : null; // PDFKit: só JPEG e PNG
  } catch {
    return null;
  }
}

function svgDims(svg) {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 100, h: 100 };
}

function gerar({ orc, linhas, fotos }) {
  const s = getSettings();
  const doc = new PDFDocument({
    size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true,
    info: { Title: `Orçamento ${orc.numero}`, Author: s.company_name || 'Nuno Alumínios', Subject: orc.titulo || 'Orçamento' },
  });
  doc.registerFont('R', path.join(ASSETS, 'fonts', 'Montserrat-Regular.ttf'));
  doc.registerFont('M', path.join(ASSETS, 'fonts', 'Montserrat-Medium.ttf'));
  doc.registerFont('SB', path.join(ASSETS, 'fonts', 'Montserrat-SemiBold.ttf'));
  doc.registerFont('B', path.join(ASSETS, 'fonts', 'Montserrat-Bold.ttf'));

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const comPrecos = Boolean(orc.mostrar_precos_linha);
  let y = 0;

  const label = (txt, x, yy, opts = {}) => {
    doc.font('SB').fontSize(opts.size || 7).fillColor(opts.color || C.muted)
      .text(String(txt).toUpperCase(), x, yy, { characterSpacing: 1.2, width: opts.width, align: opts.align || 'left', lineBreak: false });
  };
  const hline = (yy, color = C.border, wdt = 0.6, x0 = M.l, x1 = M.l + W) => {
    doc.save().moveTo(x0, yy).lineTo(x1, yy).lineWidth(wdt).strokeColor(color).stroke().restore();
  };
  const svg = (code, x, yy, w, h) => SVGtoPDF(doc, code, x, yy, {
    width: w, height: h, preserveAspectRatio: 'xMidYMid meet', fontCallback: () => 'M', assumePt: true,
  });

  /* ---------- Cabeçalho ---------- */
  function cabecalhoPrincipal() {
    svg(LOGO, M.l - 6, M.top, 190, 60);
    doc.font('SB').fontSize(20).fillColor(C.ink).text('Orçamento', M.l, M.top + 8, { width: W, align: 'right', lineBreak: false });
    doc.font('M').fontSize(10).fillColor(C.muted).text(orc.numero, M.l, M.top + 36, { width: W, align: 'right', lineBreak: false });
    y = M.top + 76;
    doc.save().rect(M.l, y, W, 2.2).fill(C.lime).restore();
    y += 18;
  }
  function cabecalhoContinuacao() {
    svg(SIMBOLO, M.l - 4, M.top - 6, 30, 30);
    doc.font('SB').fontSize(9).fillColor(C.ink).text(`Orçamento ${orc.numero}`, M.l, M.top + 4, { width: W, align: 'right', lineBreak: false });
    if (orc.cliente_nome) doc.font('R').fontSize(8).fillColor(C.muted).text(orc.cliente_nome, M.l, M.top + 16, { width: W, align: 'right', lineBreak: false });
    y = M.top + 32;
    doc.save().rect(M.l, y, W, 1.2).fill(C.lime).restore();
    y += 16;
  }
  function novaPagina(repetirTabela) {
    doc.addPage();
    cabecalhoContinuacao();
    if (repetirTabela) cabecalhoTabela();
  }
  function garantir(h, repetirTabela = false) {
    if (y + h > LIMITE) novaPagina(repetirTabela);
  }

  cabecalhoPrincipal();

  /* ---------- Referência, data, validade ---------- */
  const validade = calculo.validade(orc);
  const meta = [['Referência', orc.numero], ['Data', dataPt(orc.data)], ['Validade', `${orc.validade_dias} dias · ${dataPt(validade)}`]];
  if (s.responsavel) meta.push(['Responsável', s.responsavel]);
  const mw = W / meta.length;
  meta.forEach(([k, v], i) => {
    label(k, M.l + i * mw, y);
    doc.font('M').fontSize(9.5).fillColor(C.ink).text(v, M.l + i * mw, y + 11, { width: mw - 8, lineBreak: false, ellipsis: true });
  });
  y += 34;
  hline(y);
  y += 14;

  /* ---------- Cliente e obra ---------- */
  const colW = (W - 24) / 2;
  const blocoCliente = [orc.cliente_nome, orc.cliente_morada, orc.cliente_nif ? `NIF ${orc.cliente_nif}` : '', [orc.cliente_telefone, orc.cliente_email].filter(Boolean).join(' · ')].filter(Boolean);
  const blocoObra = [orc.titulo, orc.obra_local].filter(Boolean);
  const y0 = y;
  label('Cliente', M.l, y);
  let yc = y + 12;
  blocoCliente.forEach((t, i) => {
    doc.font(i === 0 ? 'SB' : 'R').fontSize(i === 0 ? 11 : 9).fillColor(i === 0 ? C.ink : '#3A3F3A');
    doc.text(t, M.l, yc, { width: colW });
    yc = doc.y + 2;
  });
  let yo = y + 12;
  if (blocoObra.length) {
    label('Obra', M.l + colW + 24, y);
    blocoObra.forEach((t, i) => {
      doc.font(i === 0 && orc.titulo ? 'SB' : 'R').fontSize(i === 0 && orc.titulo ? 11 : 9).fillColor(C.ink);
      doc.text(t, M.l + colW + 24, yo, { width: colW });
      yo = doc.y + 2;
    });
  }
  y = Math.max(yc, yo, y0 + 30) + 14;

  if (orc.introducao) {
    doc.font('R').fontSize(9.5).fillColor(C.ink).text(orc.introducao, M.l, y, { width: W, lineGap: 2 });
    y = doc.y + 16;
  }

  /* ---------- Tabela de trabalhos ---------- */
  const COL = comPrecos
    ? { draw: 150, desc: W - 150 - 52 - 58 - 62, qtd: 52, pu: 58, tot: 62 }
    : { draw: 150, desc: W - 150 - 48, qtd: 48, pu: 0, tot: 0 };
  const X = {
    draw: M.l, desc: M.l + COL.draw + 10, qtd: M.l + COL.draw + COL.desc, pu: M.l + COL.draw + COL.desc + COL.qtd, tot: M.l + COL.draw + COL.desc + COL.qtd + COL.pu,
  };
  const descW = COL.desc - 10;

  function cabecalhoTabela() {
    doc.save().rect(M.l, y, W, 20).fill(C.ink).restore();
    const ty = y + 7;
    const head = (t, x, w, align) => doc.font('SB').fontSize(6.8).fillColor('#FFFFFF').text(t.toUpperCase(), x, ty, { width: w, align, characterSpacing: 1, lineBreak: false });
    head('Descrição', M.l + 8, COL.draw + COL.desc - 8, 'left');
    head('Qtd.', X.qtd, COL.qtd - 4, 'right');
    if (comPrecos) { head('P. unit.', X.pu, COL.pu - 4, 'right'); head('Total', X.tot, COL.tot - 6, 'right'); }
    y += 26;
  }

  function colunasValores(l, yy) {
    const un = calculo.UNIDADES[l.unidade] || '';
    doc.font('M').fontSize(9).fillColor(C.ink).text(`${num(l.quantidade)}${l.unidade === 'un' ? '' : ` ${un}`}`, X.qtd, yy, { width: COL.qtd - 4, align: 'right', lineBreak: false });
    if (comPrecos) {
      doc.font('R').fontSize(8.5).text(eur(l.preco_unitario), X.pu, yy, { width: COL.pu - 4, align: 'right', lineBreak: false });
      doc.font('SB').fontSize(9).text(eur(l.total), X.tot, yy, { width: COL.tot - 6, align: 'right', lineBreak: false });
      if (l.desconto_pct > 0) doc.font('R').fontSize(7).fillColor(C.muted).text(`desc. ${num(l.desconto_pct)}%`, X.tot, yy + 12, { width: COL.tot - 6, align: 'right', lineBreak: false });
    }
  }

  function specsVao(l) {
    const out = [];
    if (l.largura && l.altura) out.push(['Medidas', `${l.largura} × ${l.altura} mm (${num(desenho.area(l.largura, l.altura))} m²)`]);
    out.push(['Abertura', desenho.descrever(l.desenho)]);
    if (l.serie) out.push(['Sistema', l.serie]);
    if (l.cor) out.push(['Cor', l.cor]);
    if (l.vidro) out.push(['Vidro', l.vidro]);
    return out;
  }

  function alturaTexto(font, size, txt, width, lineGap = 1) {
    doc.font(font).fontSize(size);
    return doc.heightOfString(txt || ' ', { width, lineGap });
  }

  function linhaVao(l) {
    const titulo = [l.referencia, l.descricao].filter(Boolean).join(' · ');
    const specs = specsVao(l);
    const code = desenho.svg(l.desenho, l.largura, l.altura);
    const dim = svgDims(code);
    const dw = COL.draw - 6;
    const dh = Math.min(150, dw * dim.h / dim.w);
    const img = imagemValida(l.imagem);
    let hTxt = alturaTexto('SB', 10, titulo, descW) + 6;
    specs.forEach(([k, v]) => { hTxt += alturaTexto('R', 8.5, `${k}: ${v}`, descW) + 2; });
    if (l.detalhe) hTxt += alturaTexto('R', 8.5, l.detalhe, descW) + 6;
    const hImg = img ? 70 : 0;
    const h = Math.max(dh + 14 + hImg, hTxt + 8);
    garantir(h + 12, true);

    const top = y;
    svg(code, X.draw + 3, top, dw, dh);
    doc.font('R').fontSize(6.5).fillColor(C.muted).text('Vista interior · cotas em mm', X.draw, top + dh + 3, { width: COL.draw, align: 'center', lineBreak: false });
    if (img) {
      try { doc.image(img, X.draw + 3, top + dh + 16, { fit: [dw, 64], align: 'center', valign: 'center' }); } catch { /* imagem ilegível */ }
    }
    let ty = top + 2;
    doc.font('SB').fontSize(10).fillColor(C.ink).text(titulo || 'Vão', X.desc, ty, { width: descW });
    ty = doc.y + 5;
    specs.forEach(([k, v]) => {
      doc.font('SB').fontSize(8.5).fillColor(C.muted).text(`${k}: `, X.desc, ty, { width: descW, continued: true })
        .font('R').fillColor(C.ink).text(v);
      ty = doc.y + 2;
    });
    if (l.detalhe) {
      doc.font('R').fontSize(8.5).fillColor('#3A3F3A').text(l.detalhe, X.desc, ty + 4, { width: descW, lineGap: 1 });
    }
    colunasValores(l, top + 2);
    y = top + h + 6;
    hline(y);
    y += 10;
  }

  function linhaArtigo(l) {
    const titulo = [l.referencia, l.descricao].filter(Boolean).join(' · ');
    const img = imagemValida(l.imagem);
    const x = img ? X.desc : M.l + 8;
    const w = img ? descW : COL.draw + COL.desc - 18;
    let h = alturaTexto('SB', 9.5, titulo, w) + 2;
    if (l.detalhe) h += alturaTexto('R', 8.5, l.detalhe, w) + 3;
    if (img) h = Math.max(h, 70);
    garantir(h + 14, true);
    const top = y;
    if (img) {
      try { doc.image(img, X.draw + 3, top, { fit: [COL.draw - 6, 66], align: 'center', valign: 'center' }); } catch { /* imagem ilegível */ }
    }
    doc.font('SB').fontSize(9.5).fillColor(C.ink).text(titulo || '—', x, top, { width: w });
    if (l.detalhe) doc.font('R').fontSize(8.5).fillColor('#3A3F3A').text(l.detalhe, x, doc.y + 2, { width: w, lineGap: 1 });
    colunasValores(l, top);
    y = top + h + 6;
    hline(y);
    y += 10;
  }

  function linhaSecao(l) {
    garantir(120, true); // não deixar um título sozinho no fim da página (título + início da linha seguinte)
    doc.save().rect(M.l, y, W, 20).fill(C.paper).restore();
    doc.save().rect(M.l, y, 3, 20).fill(C.lime).restore();
    doc.font('SB').fontSize(8).fillColor(C.ink).text((l.descricao || '').toUpperCase(), M.l + 12, y + 6.5, { width: W - 20, characterSpacing: 1.2, lineBreak: false, ellipsis: true });
    y += 30;
  }

  function linhaTexto(l) {
    const txt = [l.descricao, l.detalhe].filter(Boolean).join('\n');
    const h = alturaTexto('R', 8.5, txt, W - 16) + 4;
    garantir(h + 8, true);
    doc.font('R').fontSize(8.5).fillColor('#3A3F3A').text(txt, M.l + 8, y, { width: W - 16, lineGap: 1 });
    y += h + 8;
  }

  label('Trabalhos propostos', M.l, y, { size: 7.5, color: C.ink });
  y += 14;
  garantir(80);
  cabecalhoTabela();
  if (!linhas.length) {
    doc.font('R').fontSize(9).fillColor(C.muted).text('Sem artigos.', M.l + 8, y);
    y += 24;
  }
  for (const l of linhas) {
    if (l.tipo === 'vao') linhaVao(l);
    else if (l.tipo === 'secao') linhaSecao(l);
    else if (l.tipo === 'texto') linhaTexto(l);
    else linhaArtigo(l);
  }

  /* ---------- Totais ---------- */
  const rows = [['Subtotal', eur(orc.subtotal)]];
  if (orc.desconto_valor > 0) rows.push([`Desconto (${num(orc.desconto_pct)}%)`, `− ${eur(orc.desconto_valor)}`], ['Total sem IVA', eur(orc.base)]);
  rows.push([`IVA (${num(orc.iva_taxa)}%)`, eur(orc.iva_valor)]);
  const tw = 230;
  const tx = M.l + W - tw;
  garantir(rows.length * 18 + 44 + (orc.iva_motivo ? 16 : 0));
  y += 4;
  rows.forEach(([k, v]) => {
    doc.font('R').fontSize(9).fillColor(C.muted).text(k, tx, y, { width: tw - 110, lineBreak: false });
    doc.font('M').fontSize(9.5).fillColor(C.ink).text(v, tx + tw - 110, y, { width: 104, align: 'right', lineBreak: false });
    y += 17;
  });
  doc.save().rect(tx, y, tw, 30).fill(C.ink).restore();
  doc.save().rect(tx, y, 4, 30).fill(C.lime).restore();
  doc.font('SB').fontSize(8).fillColor('#FFFFFF').text('TOTAL', tx + 14, y + 11, { characterSpacing: 1.4, lineBreak: false });
  doc.font('SB').fontSize(13).fillColor('#FFFFFF').text(eur(orc.total), tx, y + 8, { width: tw - 10, align: 'right', lineBreak: false });
  y += 38;
  if (orc.iva_motivo) {
    doc.font('R').fontSize(7.5).fillColor(C.muted).text(orc.iva_motivo, tx - 60, y, { width: tw + 60, align: 'right' });
    y = doc.y + 4;
  }
  y += 14;

  /* ---------- Condições e observações ---------- */
  const cond = [
    ['Prazo de execução', orc.cond_prazo],
    ['Pagamento', orc.cond_pagamento],
    ['Garantia', orc.cond_garantia],
    ['Incluído', orc.cond_incluido],
    ['Não incluído', orc.cond_excluido],
    ['Validade da proposta', `${orc.validade_dias} dias, até ${dataPt(validade)}.`],
  ].filter(([, v]) => v);
  if (s.iban) cond.push(['IBAN', s.iban]);
  const kw = 120;
  if (cond.length) {
    garantir(60);
    label('Condições', M.l, y, { size: 7.5, color: C.ink });
    y += 14;
    hline(y, C.lime, 1.2);
    y += 8;
    cond.forEach(([k, v]) => {
      const h = alturaTexto('R', 9, v, W - kw) + 6;
      garantir(h);
      doc.font('SB').fontSize(8.5).fillColor(C.muted).text(k, M.l, y + 0.5, { width: kw - 10 });
      doc.font('R').fontSize(9).fillColor(C.ink).text(v, M.l + kw, y, { width: W - kw, lineGap: 1 });
      y += h;
    });
    y += 10;
  }
  if (orc.observacoes) {
    const h = alturaTexto('R', 9, orc.observacoes, W) + 30;
    garantir(Math.min(h, 120));
    label('Observações', M.l, y, { size: 7.5, color: C.ink });
    y += 14;
    hline(y, C.lime, 1.2);
    y += 8;
    doc.font('R').fontSize(9).fillColor(C.ink).text(orc.observacoes, M.l, y, { width: W, lineGap: 1.5 });
    y = doc.y + 18;
  }

  /* ---------- Fotografias ---------- */
  const fotosOk = (fotos || []).filter((f) => f.no_pdf).map((f) => ({ ...f, p: imagemValida(f.filename) })).filter((f) => f.p);
  if (fotosOk.length) {
    const cols = 3, gap = 10, fw = (W - gap * (cols - 1)) / cols, fh = fw * 0.72;
    garantir(fh + 50);
    label('Fotografias', M.l, y, { size: 7.5, color: C.ink });
    y += 14;
    hline(y, C.lime, 1.2);
    y += 10;
    fotosOk.forEach((f, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) y += fh + (fotosOk.slice(i - cols, i).some((x) => x.legenda) ? 18 : 8);
      if (col === 0) garantir(fh + 20);
      const x = M.l + col * (fw + gap);
      doc.save().rect(x, y, fw, fh).fill(C.paper).restore();
      try { doc.image(f.p, x, y, { fit: [fw, fh], align: 'center', valign: 'center' }); } catch { /* imagem ilegível */ }
      if (f.legenda) doc.font('R').fontSize(7.5).fillColor(C.muted).text(f.legenda, x, y + fh + 4, { width: fw, lineBreak: false, ellipsis: true });
    });
    y += fh + 26;
  }

  /* ---------- Aceitação ---------- */
  garantir(70);
  label('Aceitação do cliente', M.l, y, { size: 7.5, color: C.ink });
  y += 14;
  hline(y, C.lime, 1.2);
  y += 12;
  if (orc.estado === 'aceite' && orc.aceite_em) {
    doc.font('M').fontSize(9.5).fillColor(C.ink)
      .text(`Proposta aceite${orc.aceite_nome ? ` por ${orc.aceite_nome}` : ''} em ${dataPt(orc.aceite_em.slice(0, 10))}.`, M.l, y, { width: W });
    y = doc.y + 10;
  } else {
    doc.font('R').fontSize(8.5).fillColor(C.muted).text('Declaro que aceito a presente proposta nas condições indicadas.', M.l, y, { width: W });
    y += 34;
    hline(y, C.ink, 0.6, M.l, M.l + 260);
    hline(y, C.ink, 0.6, M.l + 300, M.l + W);
    doc.font('R').fontSize(7.5).fillColor(C.muted).text('Assinatura', M.l, y + 4, { lineBreak: false });
    doc.text('Data', M.l + 300, y + 4, { lineBreak: false });
    y += 20;
  }

  /* ---------- Rodapé em todas as páginas ---------- */
  const range = doc.bufferedPageRange();
  const morada = [s.address_line1, s.address_line2, s.postal_code].filter(Boolean).join(', ');
  const contactos = [s.phone ? `Tel. ${s.phone}` : '', s.mobile ? `Tlm. ${s.mobile}` : '', s.email, s.nif ? `NIF ${s.nif}` : ''].filter(Boolean).join('  |  ');
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = PAGE.h - M.bottom + 14;
    hline(fy, C.border, 0.6);
    doc.font('SB').fontSize(7.5).fillColor(C.ink).text((s.company_name || 'Nuno Alumínios').toUpperCase().replace(', ', ' · ').replace(/\.$/, ''), M.l, fy + 10, { characterSpacing: 1.2, lineBreak: false });
    doc.font('R').fontSize(7).fillColor(C.muted).text(morada, M.l, fy + 23, { width: W - 60, height: 9, lineBreak: false, ellipsis: true });
    doc.text(contactos, M.l, fy + 33, { width: W - 60, height: 9, lineBreak: false, ellipsis: true });
    doc.font('M').fontSize(7.5).fillColor(C.muted).text(`${i - range.start + 1}/${range.count}`, M.l + W - 50, fy + 10, { width: 50, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}

module.exports = { gerar };
