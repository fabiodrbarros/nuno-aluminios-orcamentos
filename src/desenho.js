/* Desenho técnico paramétrico de um vão de caixilharia (alçado, vista interior).
 * O mesmo ficheiro corre no servidor (PDF) e no navegador (pré-visualização no editor):
 * em Node exporta o módulo; no navegador fica em window.NunoDesenho.
 *
 * Esquema guardado em JSON:
 *   { folhas: [{ t: 'batente-e', w: 1 }, ...],   // da esquerda para a direita; w = peso da largura
 *     bandeira: { t: 'fixo' | 'basculante', h: 400 } | null,   // faixa superior (mm)
 *     estore: false }                                // caixa de estore por cima
 *
 * Convenção de desenho: as linhas tracejadas convergem para o lado das dobradiças.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NunoDesenho = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INK = '#171A17';
  var LIME = '#7FA324'; // verde-lima escurecido para traço fino legível em papel branco
  var LIME_FILL = '#A6CE39';
  var SILVER = '#9CA3AF';

  var TIPOS = [
    ['fixo', 'Fixo'],
    ['batente-e', 'Batente · dobradiças à esquerda'],
    ['batente-d', 'Batente · dobradiças à direita'],
    ['oscilo-e', 'Oscilobatente · dobradiças à esquerda'],
    ['oscilo-d', 'Oscilobatente · dobradiças à direita'],
    ['basculante', 'Basculante'],
    ['correr', 'Correr'],
    ['porta-e', 'Porta · dobradiças à esquerda'],
    ['porta-d', 'Porta · dobradiças à direita'],
  ];
  var VALIDOS = {};
  TIPOS.forEach(function (t) { VALIDOS[t[0]] = true; });

  function num(v, d) { var n = Number(v); return isFinite(n) && n > 0 ? n : d; }

  function parse(input) {
    var o = input;
    if (typeof input === 'string') {
      try { o = input ? JSON.parse(input) : {}; } catch (e) { o = {}; }
    }
    o = o || {};
    var folhas = Array.isArray(o.folhas) ? o.folhas : [];
    folhas = folhas.slice(0, 8).map(function (f) {
      return { t: VALIDOS[f && f.t] ? f.t : 'fixo', w: Math.min(10, num(f && f.w, 1)) };
    });
    if (!folhas.length) folhas = [{ t: 'fixo', w: 1 }];
    var b = o.bandeira && VALIDOS[o.bandeira.t] ? { t: o.bandeira.t === 'basculante' ? 'basculante' : 'fixo', h: Math.round(num(o.bandeira.h, 400)) } : null;
    return { folhas: folhas, bandeira: b, estore: Boolean(o.estore) };
  }

  function stringify(layout) { return JSON.stringify(parse(layout)); }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function f1(n) { return Math.round(n * 10) / 10; }

  function rect(x, y, w, h, stroke, sw, fill, fillOp) {
    return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(w, 0)) + '" height="' + f1(Math.max(h, 0)) +
      '" fill="' + (fill || 'none') + '"' + (fillOp != null ? ' fill-opacity="' + fillOp + '"' : '') +
      ' stroke="' + (stroke || 'none') + '" stroke-width="' + sw + '"/>';
  }
  function line(pts, stroke, sw, dash) {
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); }).join(' ');
    return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="miter"/>';
  }
  function text(x, y, s, size, opts) {
    opts = opts || {};
    var rot = opts.rotate ? ' transform="rotate(' + opts.rotate + ' ' + f1(x) + ' ' + f1(y) + ')"' : '';
    return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Montserrat, Arial, sans-serif" font-size="' + size +
      '" font-weight="' + (opts.weight || 500) + '" fill="' + (opts.fill || INK) + '" text-anchor="' + (opts.anchor || 'middle') + '"' + rot + '>' + esc(s) + '</text>';
  }

  // Folha com perfil, vidro e símbolo de abertura.
  function folha(t, x, y, w, h, idx, total) {
    var out = '';
    var isPorta = t === 'porta-e' || t === 'porta-d';
    var p = t === 'fixo' ? 0 : 3.5; // perfil da folha (folgas visuais)
    var sx = x + p, sy = y + p, sw = w - 2 * p, sh = h - 2 * p;
    if (t !== 'fixo') out += rect(sx, sy, sw, sh, INK, 1.1);
    var g = t === 'fixo' ? 0 : 4;
    out += rect(sx + g, sy + g, sw - 2 * g, sh - 2 * g, INK, 0.6, LIME_FILL, 0.08);

    var L = sx + g, R = sx + sw - g, T = sy + g, B = sy + sh - g, MX = (L + R) / 2, MY = (T + B) / 2;
    var dash = '5 4';
    var hingeLeft = /-e$/.test(t);
    if (t === 'batente-e' || t === 'oscilo-e' || t === 'porta-e') out += line([[R, T], [L, MY], [R, B]], LIME, 1.1, dash);
    if (t === 'batente-d' || t === 'oscilo-d' || t === 'porta-d') out += line([[L, T], [R, MY], [L, B]], LIME, 1.1, dash);
    if (t === 'oscilo-e' || t === 'oscilo-d' || t === 'basculante') out += line([[L, T], [MX, B], [R, T]], LIME, 1.1, dash);

    // Puxador
    var hw = Math.max(2.6, Math.min(4, sw * 0.04));
    if (/^(batente|oscilo|porta)-/.test(t)) {
      var hx = hingeLeft ? sx + sw - p - 2.5 : sx + p + 2.5;
      var hy = isPorta ? sy + sh * 0.52 : MY;
      var hl = Math.max(10, Math.min(22, sh * 0.12));
      out += '<rect x="' + f1(hx - hw / 2) + '" y="' + f1(hy - hl / 2) + '" width="' + f1(hw) + '" height="' + f1(hl) + '" rx="' + f1(hw / 2) + '" fill="' + INK + '"/>';
    } else if (t === 'basculante') {
      var bl = Math.max(10, Math.min(22, sw * 0.18));
      out += '<rect x="' + f1(MX - bl / 2) + '" y="' + f1(sy + p) + '" width="' + f1(bl) + '" height="' + f1(hw) + '" rx="' + f1(hw / 2) + '" fill="' + INK + '"/>';
    } else if (t === 'correr') {
      var dir = idx < (total - 1) / 2 ? 1 : (idx > (total - 1) / 2 ? -1 : 1);
      var aw = Math.min(sw * 0.5, 60), ay = MY;
      var a0 = MX - dir * aw / 2, a1 = MX + dir * aw / 2;
      out += line([[a0, ay], [a1, ay]], LIME, 1.4);
      out += line([[a1 - dir * 7, ay - 5], [a1, ay], [a1 - dir * 7, ay + 5]], LIME, 1.4);
      var pxl = dir > 0 ? sx + p + 2.5 : sx + sw - p - 2.5;
      out += '<rect x="' + f1(pxl - hw / 2) + '" y="' + f1(MY - 12) + '" width="' + f1(hw) + '" height="24" rx="' + f1(hw / 2) + '" fill="' + INK + '"/>';
    } else if (t === 'fixo') {
      // reflexo do vidro
      var cx = L + (R - L) * 0.22, cy = T + (B - T) * 0.2, k = Math.min(18, (R - L) * 0.18, (B - T) * 0.18);
      if (k > 4) out += line([[cx, cy + k], [cx + k, cy]], SILVER, 0.9) + line([[cx + k * 0.4, cy + k * 1.3], [cx + k * 1.3, cy + k * 0.4]], SILVER, 0.9);
    }
    return out;
  }

  function cotaH(x0, x1, y, label, size) {
    return line([[x0, y], [x1, y]], INK, 0.6) +
      line([[x0, y - 4], [x0, y + 4]], INK, 0.6) + line([[x1, y - 4], [x1, y + 4]], INK, 0.6) +
      text((x0 + x1) / 2, y - 3, label, size);
  }
  function cotaV(y0, y1, x, label, size) {
    return line([[x, y0], [x, y1]], INK, 0.6) +
      line([[x - 4, y0], [x + 4, y0]], INK, 0.6) + line([[x - 4, y1], [x + 4, y1]], INK, 0.6) +
      // Rodado -90º: as letras ficam à esquerda da linha de base, por isso a base vai à direita da cota.
      text(x + size + 1, (y0 + y1) / 2, label, size, { rotate: -90, anchor: 'middle' });
  }

  /**
   * SVG do vão. largura/altura em mm (0 = sem medidas: desenho 1:1 sem cotas).
   * opts.cotas (true), opts.size (largura máx. do desenho em unidades, 260).
   */
  function svg(layoutInput, largura, altura, opts) {
    opts = opts || {};
    var layout = parse(layoutInput);
    var Lmm = num(largura, 0), Amm = num(altura, 0);
    var temMedidas = Lmm > 0 && Amm > 0;
    var cotas = opts.cotas !== false && temMedidas;
    var Lw = Lmm || 1000, Ah = Amm || 1000;
    var maxW = opts.size || 260, maxH = opts.maxH || 220;
    var s = Math.min(maxW / Lw, maxH / Ah);
    var W = Lw * s, H = Ah * s;
    // Desenhos muito estreitos ou baixos: mínimo legível.
    if (W < 70) { s = 70 / Lw; W = 70; H = Ah * s; }
    if (H < 50) { H = 50; }

    var fs = 10;
    var nF = layout.folhas.length;
    var mL = 6, mT = layout.estore ? 22 : 6;
    var mR = cotas ? (layout.bandeira ? 44 : 26) : 6;
    var mB = cotas ? (nF > 1 ? 40 : 22) : 6;
    var VW = mL + W + mR, VH = mT + H + mB;
    var x0 = mL, y0 = mT;
    var out = '';

    // Caixa de estore
    if (layout.estore) {
      var eh = 14;
      out += rect(x0, y0 - eh - 2, W, eh, INK, 1, SILVER, 0.18);
      for (var i = 1; i < 4; i++) out += line([[x0 + 3, y0 - eh - 2 + i * eh / 4], [x0 + W - 3, y0 - eh - 2 + i * eh / 4]], SILVER, 0.6);
    }

    // Aro (perfil exterior + interior)
    var aro = Math.max(4, Math.min(8, W * 0.025));
    out += rect(x0, y0, W, H, INK, 1.8);
    out += rect(x0 + aro, y0 + aro, W - 2 * aro, H - 2 * aro, INK, 0.9);

    var ix = x0 + aro, iy = y0 + aro, iw = W - 2 * aro, ih = H - 2 * aro;
    var bandH = 0;
    if (layout.bandeira) {
      bandH = Math.min(ih * 0.6, layout.bandeira.h * s);
      out += folha(layout.bandeira.t, ix, iy, iw, bandH - 2, 0, 1);
      out += rect(ix, iy + bandH - 2, iw, 4, INK, 0.9, '#FFFFFF');
    }
    var fy = iy + bandH + (bandH ? 2 : 0), fh = ih - bandH - (bandH ? 2 : 0);
    var totalW = layout.folhas.reduce(function (a, f) { return a + f.w; }, 0);
    var isCorrer = layout.folhas.some(function (f) { return f.t === 'correr'; });
    var cx = ix;
    layout.folhas.forEach(function (f, idx) {
      var fw = iw * f.w / totalW;
      out += folha(f.t, cx, fy, fw, fh, idx, nF);
      if (idx < nF - 1) {
        // Montante entre folhas (no correr, sobreposição das folhas).
        out += isCorrer ? line([[cx + fw, fy + 2], [cx + fw, fy + fh - 2]], INK, 1.6) : rect(cx + fw - 1.5, fy, 3, fh, INK, 0.8, '#FFFFFF');
      }
      cx += fw;
    });
    // Soleira nas portas
    if (layout.folhas.some(function (f) { return /^porta/.test(f.t); })) {
      out += line([[x0 - 3, y0 + H + 1.5], [x0 + W + 3, y0 + H + 1.5]], INK, 1.2);
    }

    if (cotas) {
      var yb = y0 + H + 14;
      if (nF > 1) {
        var acc = 0, px = x0;
        layout.folhas.forEach(function (f, idx) {
          var mm = idx === nF - 1 ? Lmm - acc : Math.round(Lmm * f.w / totalW);
          acc += mm;
          var w = W * f.w / totalW;
          out += cotaH(px, px + w, yb, String(mm), fs - 1.5);
          px += w;
        });
        yb += 16;
      }
      out += cotaH(x0, x0 + W, yb, String(Math.round(Lmm)), fs);
      var xr = x0 + W + 12;
      if (layout.bandeira) {
        var bh = Math.round(layout.bandeira.h), restH = Math.round(Amm - bh);
        out += cotaV(y0, y0 + aro + bandH, xr, String(bh), fs - 1.5);
        out += cotaV(y0 + aro + bandH, y0 + H, xr, String(restH), fs - 1.5);
        xr += 16;
      }
      out += cotaV(y0, y0 + H, xr, String(Math.round(Amm)), fs);
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(VW) + ' ' + f1(VH) + '" width="' + f1(VW) + '" height="' + f1(VH) + '" role="img" aria-label="Desenho do vão">' + out + '</svg>';
  }

  function area(largura, altura) {
    return Math.round((num(largura, 0) * num(altura, 0)) / 10000) / 100; // m², 2 casas
  }

  function descrever(layoutInput) {
    var l = parse(layoutInput);
    var nomes = {};
    TIPOS.forEach(function (t) { nomes[t[0]] = t[1].split(' · ')[0].toLowerCase(); });
    var partes = l.folhas.map(function (f) { return nomes[f.t]; });
    var cont = {};
    partes.forEach(function (p) { cont[p] = (cont[p] || 0) + 1; });
    var txt = Object.keys(cont).map(function (k) { return cont[k] > 1 ? cont[k] + '× ' + k : k; }).join(' + ');
    var n = l.folhas.length;
    txt = n + (n === 1 ? ' folha' : ' folhas') + ' (' + txt + ')';
    if (l.bandeira) txt += ', bandeira ' + (l.bandeira.t === 'basculante' ? 'basculante' : 'fixa');
    if (l.estore) txt += ', com estore';
    return txt;
  }

  return { TIPOS: TIPOS, parse: parse, stringify: stringify, svg: svg, area: area, descrever: descrever };
}));
