/* NUNO Alumínios — editor de orçamentos.
 * As linhas vivem num array (state.linhas); o DOM de cada linha é gerado a partir dele.
 * Grava por JSON (POST /orcamentos/:id) com gravação automática 2 s depois da última alteração. */
(function () {
  'use strict';
  var doc = document;
  var form = doc.getElementById('orc-form');
  var dataEl = doc.getElementById('orc-data');
  if (!form || !dataEl) return;
  var N = window.Nuno, D = window.NunoDesenho;
  var esc = N.esc;
  var DATA = JSON.parse(dataEl.textContent);
  var ARTIGOS = {};
  DATA.artigos.forEach(function (a) { ARTIGOS[a.id] = a; });
  var UNIDADES = { un: 'un.', m2: 'm²', ml: 'm', vg: 'vg' };
  var linesEl = form.querySelector('[data-lines]');
  var stateEl = form.querySelector('[data-save-state]');

  /* ---------- números ---------- */
  function parseNum(v, d) {
    if (typeof v === 'number') return isFinite(v) ? v : (d || 0);
    var s = String(v == null ? '' : v).trim().replace(/[\s€%]/g, '');
    if (!s) return d || 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : (d || 0);
  }
  function round2(v) { return Math.round((Number(v) || 0) * 100 + Number.EPSILON) / 100; }
  var eurFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  var numFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2, useGrouping: 'always' });
  function eur(v) { return eurFmt.format(Number(v) || 0); }
  function num(v) { return numFmt.format(Number(v) || 0); }
  function numIn(v) { return v === '' || v == null ? '' : String(round2(v)).replace('.', ','); }

  /* ---------- estado ---------- */
  var state = { linhas: DATA.linhas.map(function (l) { return prep(l); }), dirty: false, saving: false, timer: null };

  function prep(l) {
    var o = {
      tipo: l.tipo || 'artigo', artigo_id: l.artigo_id || null, referencia: l.referencia || '', descricao: l.descricao || '', detalhe: l.detalhe || '',
      quantidade: l.quantidade == null ? 1 : l.quantidade, unidade: l.unidade || 'un', largura: l.largura || 0, altura: l.altura || 0,
      desenho: D.parse(l.desenho || ''), serie: l.serie || '', cor: l.cor || '', vidro: l.vidro || '',
      preco_unitario: l.preco_unitario || 0, desconto_pct: l.desconto_pct || 0, imagem: l.imagem || '',
    };
    o._auto = o.tipo === 'vao' && o.artigo_id && Math.abs(sugerido(o) - o.preco_unitario) < 0.005;
    o._key = Math.random().toString(36).slice(2);
    return o;
  }

  function sugerido(l) {
    var a = ARTIGOS[l.artigo_id];
    if (!a) return null;
    if (a.unidade !== 'm2') return round2(a.preco);
    var area = D.area(l.largura, l.altura);
    return round2(a.preco * Math.max(area || 1, a.area_minima || 0));
  }

  function totalLinha(l) {
    if (l.tipo === 'secao' || l.tipo === 'texto') return 0;
    return round2(parseNum(l.quantidade) * parseNum(l.preco_unitario) * (1 - Math.min(100, Math.max(0, parseNum(l.desconto_pct))) / 100));
  }

  function proximaRef(prefixo) {
    var n = 0;
    state.linhas.forEach(function (l) {
      var m = new RegExp('^' + prefixo + '(\\d+)$').exec(l.referencia || '');
      if (m) n = Math.max(n, Number(m[1]));
    });
    return prefixo + (n + 1);
  }
  var PREFIXO = { janela: 'J', porta: 'P', envidracado: 'E' };

  function novaLinha(tipo, artigo) {
    var l = prep({ tipo: tipo, quantidade: tipo === 'secao' || tipo === 'texto' ? 0 : 1 });
    if (tipo === 'vao') {
      l.desenho = D.parse('{"folhas":[{"t":"batente-e"}]}');
      l.largura = 1000; l.altura = 1200;
      l.referencia = proximaRef('V');
    }
    if (artigo) aplicarArtigo(l, artigo, true);
    return l;
  }

  function aplicarArtigo(l, a, novo) {
    l.artigo_id = a.id;
    if (a.tipo === 'vao') {
      l.tipo = 'vao';
      l.descricao = a.nome;
      if (a.desenho) l.desenho = D.parse(a.desenho);
      if (novo || !l.largura) { l.largura = a.largura || l.largura; l.altura = a.altura || l.altura; }
      if (a.serie) l.serie = a.serie;
      if (novo) l.referencia = proximaRef(PREFIXO[a.categoria] || 'V');
      l.unidade = 'un';
      l.preco_unitario = sugerido(l);
      l._auto = true;
    } else {
      l.tipo = 'artigo';
      l.descricao = a.nome;
      l.detalhe = a.descricao || '';
      l.unidade = a.unidade === 'm2' ? 'm2' : a.unidade;
      l.preco_unitario = round2(a.preco);
      if (a.imagem) l.imagem = a.imagem;
    }
  }

  /* ---------- render ---------- */
  function optArtigos(sel, tipo) {
    return '<option value="">— sem artigo —</option>' + DATA.artigos.filter(function (a) { return a.tipo === tipo; }).map(function (a) {
      return '<option value="' + a.id + '"' + (Number(sel) === a.id ? ' selected' : '') + '>' + esc(a.nome) + (a.unidade === 'm2' ? ' · ' + num(a.preco) + ' €/m²' : ' · ' + num(a.preco) + ' €') + '</option>';
    }).join('');
  }
  function optTipos(sel) {
    return DATA.tipos.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === sel ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('');
  }
  function tools(i) {
    var n = state.linhas.length;
    return '<div class="ln__tools">' +
      '<button type="button" class="icon-btn" data-act="up" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
      '<button type="button" class="icon-btn" data-act="down" aria-label="Descer"' + (i === n - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
      '<button type="button" class="icon-btn" data-act="dup" aria-label="Duplicar linha">' + icon('copy') + '</button>' +
      '<button type="button" class="icon-btn icon-btn--danger" data-act="del" aria-label="Apagar linha">' + icon('trash') + '</button></div>';
  }
  var ICONS = {
    up: 'M12 19V5 M6 11L12 5L18 11', down: 'M12 5V19 M6 13L12 19L18 13', copy: 'M8 8H20V20H8Z M16 8V4H4V16H8',
    trash: 'M4 7H20 M9 7V4H15V7 M6 7L7 21H17L18 7 M10 11V17 M14 11V17', image: 'M3 5H21V19H3Z M3 16L8.5 11L13 15.5L16 12.5L21 17 M15.5 9.5A1.5 1.5 0 1 0 15.5 6.5A1.5 1.5 0 1 0 15.5 9.5Z',
    calc: 'M4 12.5L9.5 18L20 6', plus: 'M12 4V20 M4 12H20', minus: 'M4 12H20', close: 'M5 5L19 19 M19 5L5 19',
  };
  function icon(n) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[n] + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }

  function imgBlock(l) {
    return '<div class="ln__img">' + (l.imagem
      ? '<a href="/media/' + esc(l.imagem) + '" target="_blank" rel="noopener"><img src="/media/' + esc(l.imagem) + '" alt=""></a><button type="button" class="link-btn" data-act="img-del">Remover foto</button>'
      : '<label class="link-btn">' + icon('image') + ' Fotografia<input type="file" accept="image/*" data-img hidden></label>') + '</div>';
  }

  function priceBlock(l, i) {
    var sug = l.tipo === 'vao' ? sugerido(l) : null;
    var a = ARTIGOS[l.artigo_id];
    var hint = '';
    if (sug != null && a) {
      hint = a.unidade === 'm2'
        ? num(Math.max(D.area(l.largura, l.altura) || 1, a.area_minima || 0)) + ' m² × ' + num(a.preco) + ' € = ' + eur(sug)
        : 'Preço do artigo: ' + eur(sug);
    }
    return '<div class="ln__price">' +
      '<label class="f f--compact"><span>Qtd.</span><input data-k="quantidade" value="' + numIn(l.quantidade) + '" inputmode="decimal"></label>' +
      (l.tipo === 'artigo' ? '<label class="f f--compact"><span>Unid.</span><select data-k="unidade">' + Object.keys(UNIDADES).map(function (u) { return '<option value="' + u + '"' + (u === l.unidade ? ' selected' : '') + '>' + UNIDADES[u] + '</option>'; }).join('') + '</select></label>' : '') +
      '<label class="f f--compact"><span>Preço unit. (€)</span><input data-k="preco_unitario" value="' + numIn(l.preco_unitario) + '" inputmode="decimal"></label>' +
      '<label class="f f--compact"><span>Desc. %</span><input data-k="desconto_pct" value="' + (l.desconto_pct ? numIn(l.desconto_pct) : '') + '" inputmode="decimal" placeholder="0"></label>' +
      '<div class="ln__total"><span>Total</span><strong data-total>' + eur(totalLinha(l)) + '</strong></div>' +
      (hint ? '<p class="ln__hint" data-hint>' + (l._auto ? '' : '<button type="button" class="link-btn" data-act="calc">Usar preço calculado</button> · ') + esc(hint) + '</p>' : '') +
      '</div>';
  }

  function layoutBlock(l) {
    var d = l.desenho;
    var folhas = d.folhas.map(function (f, j) {
      return '<label class="folha"><span>' + (j + 1) + '</span><select data-folha="' + j + '">' + optTipos(f.t) + '</select></label>';
    }).join('');
    return '<div class="ln__layout">' +
      '<div class="ln__folhas">' + folhas +
        '<div class="ln__fbtn"><button type="button" class="icon-btn" data-act="f-add" aria-label="Mais uma folha"' + (d.folhas.length >= 8 ? ' disabled' : '') + '>' + icon('plus') + '</button>' +
        '<button type="button" class="icon-btn" data-act="f-del" aria-label="Menos uma folha"' + (d.folhas.length <= 1 ? ' disabled' : '') + '>' + icon('minus') + '</button></div></div>' +
      '<div class="ln__extras">' +
        '<label class="f f--compact"><span>Bandeira</span><select data-k="bandeira"><option value="">Sem bandeira</option><option value="fixo"' + (d.bandeira && d.bandeira.t === 'fixo' ? ' selected' : '') + '>Fixa</option><option value="basculante"' + (d.bandeira && d.bandeira.t === 'basculante' ? ' selected' : '') + '>Basculante</option></select></label>' +
        (d.bandeira ? '<label class="f f--compact"><span>Altura bandeira (mm)</span><input data-k="bandeira_h" value="' + d.bandeira.h + '" inputmode="numeric"></label>' : '') +
        '<label class="check"><input type="checkbox" data-k="estore"' + (d.estore ? ' checked' : '') + '> Caixa de estore</label>' +
      '</div></div>';
  }

  function renderLinha(l, i) {
    var head = '<header class="ln__head"><span class="ln__kind">' + { vao: 'Vão', artigo: 'Linha', secao: 'Secção', texto: 'Nota' }[l.tipo] + '</span>';
    if (l.tipo === 'vao' || l.tipo === 'artigo') head += '<input class="ln__ref" data-k="referencia" value="' + esc(l.referencia) + '" placeholder="Ref." maxlength="20" aria-label="Referência">';
    head += '<input class="ln__desc" data-k="descricao" value="' + esc(l.descricao) + '" placeholder="' + { vao: 'Descrição do vão', artigo: 'Descrição', secao: 'Título da secção (ex.: Piso 1 — Quartos)', texto: 'Texto da nota' }[l.tipo] + '" maxlength="300" aria-label="Descrição">';
    head += tools(i) + '</header>';
    var body = '';
    if (l.tipo === 'vao') {
      body = '<div class="ln__body">' +
        '<div class="ln__draw"><div class="ln__svg" data-svg>' + D.svg(l.desenho, l.largura, l.altura) + '</div><p class="ln__area" data-area>' + areaTxt(l) + '</p>' + imgBlock(l) + '</div>' +
        '<div class="ln__fields">' +
          '<div class="grid-3">' +
            '<label class="f f--compact"><span>Largura (mm)</span><input data-k="largura" value="' + (l.largura || '') + '" inputmode="numeric"></label>' +
            '<label class="f f--compact"><span>Altura (mm)</span><input data-k="altura" value="' + (l.altura || '') + '" inputmode="numeric"></label>' +
            '<label class="f f--compact"><span>Artigo / preço base</span><select data-k="artigo_id">' + optArtigos(l.artigo_id, 'vao') + '</select></label>' +
          '</div>' + layoutBlock(l) +
          '<div class="grid-3">' +
            '<label class="f f--compact"><span>Sistema</span><input data-k="serie" value="' + esc(l.serie) + '" list="lista-series" maxlength="120"></label>' +
            '<label class="f f--compact"><span>Cor</span><input data-k="cor" value="' + esc(l.cor) + '" list="lista-cores" maxlength="120"></label>' +
            '<label class="f f--compact"><span>Vidro</span><input data-k="vidro" value="' + esc(l.vidro) + '" list="lista-vidros" maxlength="120"></label>' +
          '</div>' +
          '<label class="f f--compact"><span>Detalhes <small>(ferragens, puxador, acessórios…)</small></span><textarea data-k="detalhe" rows="2">' + esc(l.detalhe) + '</textarea></label>' +
          priceBlock(l, i) +
        '</div></div>';
    } else if (l.tipo === 'artigo') {
      body = '<div class="ln__body ln__body--simple">' +
        '<div class="ln__fields"><label class="f f--compact"><span>Detalhes</span><textarea data-k="detalhe" rows="2">' + esc(l.detalhe) + '</textarea></label>' + priceBlock(l, i) + '</div>' +
        '<div class="ln__side">' + imgBlock(l) + '</div></div>';
    } else if (l.tipo === 'texto') {
      body = '<div class="ln__body ln__body--simple"><div class="ln__fields"><label class="f f--compact"><span class="sr-only">Texto adicional</span><textarea data-k="detalhe" rows="2" placeholder="Texto adicional (opcional)">' + esc(l.detalhe) + '</textarea></label></div></div>';
    }
    return '<article class="ln ln--' + l.tipo + '" data-i="' + i + '">' + head + body + '</article>';
  }

  function areaTxt(l) {
    var a = D.area(l.largura, l.altura);
    return a ? num(a) + ' m² · ' + esc(D.descrever(l.desenho)) : esc(D.descrever(l.desenho));
  }

  function renderAll() {
    linesEl.innerHTML = state.linhas.length
      ? state.linhas.map(renderLinha).join('')
      : '<p class="empty empty--lines">Sem trabalhos. Adicione um vão do catálogo ou uma linha livre.</p>';
    var n = state.linhas.filter(function (l) { return l.tipo === 'vao'; }).length;
    form.querySelector('[data-count]').textContent = n ? n + (n === 1 ? ' vão' : ' vãos') : '';
    totais();
  }

  function rerender(i, focusSel) {
    var el = linesEl.querySelector('[data-i="' + i + '"]');
    if (!el) return renderAll();
    var tmp = doc.createElement('div');
    tmp.innerHTML = renderLinha(state.linhas[i], i);
    el.replaceWith(tmp.firstChild);
    if (focusSel) { var f = linesEl.querySelector('[data-i="' + i + '"] ' + focusSel); if (f) f.focus(); }
  }

  function refreshVao(i, el) {
    var l = state.linhas[i];
    el.querySelector('[data-svg]').innerHTML = D.svg(l.desenho, l.largura, l.altura);
    el.querySelector('[data-area]').innerHTML = areaTxt(l);
  }

  function refreshPrice(i, el, skipPrice) {
    var l = state.linhas[i];
    if (l.tipo === 'vao' && l._auto) {
      var s = sugerido(l);
      if (s != null) { l.preco_unitario = s; if (!skipPrice) { var p = el.querySelector('[data-k="preco_unitario"]'); if (p && p !== doc.activeElement) p.value = numIn(s); } }
    }
    var t = el.querySelector('[data-total]');
    if (t) t.textContent = eur(totalLinha(l));
    var h = el.querySelector('.ln__price');
    if (h && l.tipo === 'vao') {
      var tmp = doc.createElement('div');
      tmp.innerHTML = priceBlock(l, i);
      var newHint = tmp.querySelector('[data-hint]'), oldHint = h.querySelector('[data-hint]');
      if (oldHint && newHint) oldHint.innerHTML = newHint.innerHTML;
      else if (newHint) h.appendChild(newHint);
      else if (oldHint) oldHint.remove();
    }
    totais();
  }

  function totais() {
    var sub = round2(state.linhas.reduce(function (a, l) { return a + totalLinha(l); }, 0));
    var desc = Math.min(100, Math.max(0, parseNum(form.desconto_pct.value)));
    var dv = round2(sub * desc / 100), base = round2(sub - dv);
    var iva = round2(base * parseNum(form.iva_taxa.value) / 100);
    setT('subtotal', eur(sub));
    setT('desconto_valor', dv ? '− ' + eur(dv) : '');
    setT('iva_valor', eur(iva));
    setT('total', eur(base + iva));
  }
  function setT(k, v) { var el = form.querySelector('[data-t="' + k + '"]'); if (el) el.textContent = v; }

  /* ---------- eventos das linhas ---------- */
  linesEl.addEventListener('input', function (e) {
    var el = e.target.closest('.ln');
    if (!el) return;
    var i = Number(el.getAttribute('data-i'));
    var l = state.linhas[i];
    var k = e.target.getAttribute('data-k');
    if (!k || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
    if (k === 'bandeira_h') {
      l.desenho.bandeira.h = Math.max(50, Math.round(parseNum(e.target.value, 400)));
      refreshVao(i, el);
    } else if (k === 'largura' || k === 'altura') {
      l[k] = Math.max(0, Math.round(parseNum(e.target.value)));
      refreshVao(i, el);
      refreshPrice(i, el);
    } else if (k === 'quantidade' || k === 'desconto_pct') {
      l[k] = parseNum(e.target.value);
      refreshPrice(i, el, true);
    } else if (k === 'preco_unitario') {
      l.preco_unitario = parseNum(e.target.value);
      l._auto = false;
      refreshPrice(i, el, true);
    } else {
      l[k] = e.target.value;
    }
    markDirty();
  });

  linesEl.addEventListener('change', function (e) {
    var el = e.target.closest('.ln');
    if (!el) return;
    var i = Number(el.getAttribute('data-i'));
    var l = state.linhas[i];
    var t = e.target;
    if (t.hasAttribute('data-folha')) {
      l.desenho.folhas[Number(t.getAttribute('data-folha'))].t = t.value;
      refreshVao(i, el);
    } else if (t.getAttribute('data-k') === 'bandeira') {
      l.desenho.bandeira = t.value ? { t: t.value, h: (l.desenho.bandeira && l.desenho.bandeira.h) || 400 } : null;
      rerender(i);
    } else if (t.getAttribute('data-k') === 'estore') {
      l.desenho.estore = t.checked;
      refreshVao(i, el);
    } else if (t.getAttribute('data-k') === 'artigo_id') {
      var a = ARTIGOS[t.value];
      if (a) aplicarArtigo(l, a, false);
      else { l.artigo_id = null; l._auto = false; }
      rerender(i);
      totais();
    } else if (t.getAttribute('data-k') === 'unidade') {
      l.unidade = t.value;
    } else if (t.hasAttribute('data-img')) {
      if (!t.files.length) return;
      N.toast('A enviar fotografia…');
      N.upload('/orcamentos/' + DATA.id + '/imagem', 'imagem', t.files).then(function (d) {
        l.imagem = d.filename;
        rerender(i);
        markDirty();
      }).catch(function (err) { N.toast(err.message, 'error'); });
      return;
    } else if (t.getAttribute('data-k') === 'preco_unitario' || t.getAttribute('data-k') === 'quantidade' || t.getAttribute('data-k') === 'desconto_pct') {
      t.value = t.getAttribute('data-k') === 'desconto_pct' && !parseNum(t.value) ? '' : numIn(parseNum(t.value));
      return;
    } else return;
    markDirty();
  });

  linesEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var el = b.closest('.ln');
    var i = Number(el.getAttribute('data-i'));
    var l = state.linhas[i];
    var act = b.getAttribute('data-act');
    if (act === 'up' && i > 0) { swap(i, i - 1); renderAll(); }
    else if (act === 'down' && i < state.linhas.length - 1) { swap(i, i + 1); renderAll(); }
    else if (act === 'del') {
      if ((l.descricao || l.preco_unitario) && !window.confirm('Apagar esta linha?')) return;
      state.linhas.splice(i, 1); renderAll();
    } else if (act === 'dup') {
      var c = prep(JSON.parse(JSON.stringify(l)));
      c._auto = l._auto;
      if (c.referencia && /^[A-Z]+\d+$/.test(c.referencia)) c.referencia = proximaRef(c.referencia.replace(/\d+$/, ''));
      state.linhas.splice(i + 1, 0, c); renderAll();
    } else if (act === 'f-add') { l.desenho.folhas.push({ t: l.desenho.folhas[l.desenho.folhas.length - 1].t, w: 1 }); rerender(i); }
    else if (act === 'f-del') { l.desenho.folhas.pop(); rerender(i); }
    else if (act === 'calc') { l._auto = true; l.preco_unitario = sugerido(l); rerender(i); totais(); }
    else if (act === 'img-del') { l.imagem = ''; rerender(i); }
    else return;
    markDirty();
  });

  function swap(a, b) { var t = state.linhas[a]; state.linhas[a] = state.linhas[b]; state.linhas[b] = t; }

  // Adicionar linhas
  form.querySelector('[data-add-artigo]').addEventListener('change', function (e) {
    var a = ARTIGOS[e.target.value];
    if (!a) return;
    state.linhas.push(novaLinha(a.tipo === 'vao' ? 'vao' : 'artigo', a));
    e.target.value = '';
    renderAll();
    markDirty();
    focusLast();
  });
  Array.prototype.forEach.call(form.querySelectorAll('[data-add]'), function (b) {
    b.addEventListener('click', function () {
      state.linhas.push(novaLinha(b.getAttribute('data-add')));
      renderAll();
      markDirty();
      focusLast('.ln__desc');
    });
  });
  function focusLast(sel) {
    var last = linesEl.querySelector('.ln:last-child');
    if (!last) return;
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var f = last.querySelector(sel || '[data-k="largura"], .ln__desc');
    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 250);
  }

  /* ---------- cabeçalho, totais e gravação ---------- */
  form.addEventListener('input', function (e) {
    if (e.target.closest('[data-lines]')) return;
    if (e.target.name === 'desconto_pct') totais();
    markDirty();
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'iva_taxa') {
      totais();
      form.querySelector('[data-iva-motivo]').hidden = Number(e.target.value) !== 0 && !form.iva_motivo.value;
    }
    if (!e.target.closest('[data-lines]') && !e.target.closest('[data-fotos]') && !e.target.hasAttribute('data-fotos-input') && !e.target.closest('[data-cliente-picker]')) markDirty();
  });

  function markDirty() {
    state.dirty = true;
    stateEl.textContent = 'Alterações por gravar…';
    stateEl.className = 'save-state is-dirty';
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { save(); }, 2000);
  }

  function payload() {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.closest('[data-lines]') || el.name === 'cliente_id') return;
      if (el.type === 'checkbox') o[el.name] = el.checked ? 1 : 0;
      else o[el.name] = el.value;
    });
    o.linhas = state.linhas.map(function (l) {
      var c = {};
      Object.keys(l).forEach(function (k) { if (k[0] !== '_') c[k] = l[k]; });
      c.desenho = JSON.stringify(l.desenho);
      return c;
    });
    return o;
  }

  var pending = null;
  function save() {
    clearTimeout(state.timer);
    if (pending) return pending.then(function () { return state.dirty ? save() : null; });
    if (!state.dirty) return Promise.resolve();
    state.dirty = false;
    stateEl.textContent = 'A gravar…';
    stateEl.className = 'save-state';
    pending = N.postJson(form.action, payload()).then(function (d) {
      pending = null;
      if (!state.dirty) {
        var now = new Date();
        stateEl.textContent = 'Gravado às ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        stateEl.className = 'save-state is-ok';
        if (d.totais) { setT('subtotal', eur(d.totais.subtotal)); setT('desconto_valor', d.totais.desconto_valor ? '− ' + eur(d.totais.desconto_valor) : ''); setT('iva_valor', eur(d.totais.iva_valor)); setT('total', eur(d.totais.total)); }
      }
    }).catch(function (err) {
      pending = null;
      state.dirty = true;
      stateEl.textContent = 'Não gravado: ' + err.message;
      stateEl.className = 'save-state is-error';
      throw err;
    });
    return pending;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    state.dirty = true;
    save().then(function () { N.toast('Orçamento gravado.'); }).catch(function (err) { N.toast(err.message, 'error'); });
  });
  doc.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      state.dirty = true;
      save().then(function () { N.toast('Orçamento gravado.'); }).catch(function () {});
    }
  });
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty || pending) { e.preventDefault(); e.returnValue = ''; }
  });

  // Links e formulários que precisam do orçamento gravado antes (PDF, enviar, estado, duplicar).
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-save-first]');
    if (!a || (!state.dirty && !pending)) return;
    e.preventDefault();
    var win = a.target === '_blank' ? window.open('about:blank') : null;
    save().then(function () {
      if (win) win.location = a.href; else window.location.href = a.href;
    }).catch(function (err) { if (win) win.close(); N.toast(err.message, 'error'); });
  });
  Array.prototype.forEach.call(doc.querySelectorAll('form[data-save-before]'), function (f) {
    f.addEventListener('submit', function (e) {
      if (!state.dirty && !pending) return;
      e.preventDefault();
      var btn = e.submitter;
      save().then(function () {
        if (btn && btn.name) { var h = doc.createElement('input'); h.type = 'hidden'; h.name = btn.name; h.value = btn.value; f.appendChild(h); }
        state.dirty = false;
        f.submit();
      }).catch(function (err) { N.toast(err.message, 'error'); });
    });
  });

  /* ---------- fotografias da obra ---------- */
  var fotosEl = form.querySelector('[data-fotos]');
  var fotosInput = form.querySelector('[data-fotos-input]');
  function renderFotos(list) {
    fotosEl.innerHTML = list.map(function (f) {
      return '<li data-foto="' + f.id + '"><a href="/media/' + esc(f.filename) + '" target="_blank" rel="noopener"><img src="/media/' + esc(f.filename) + '" alt="" loading="lazy"></a>' +
        '<input class="photo-grid__cap" value="' + esc(f.legenda) + '" placeholder="Legenda" maxlength="200" data-foto-legenda>' +
        '<label class="photo-grid__pdf"><input type="checkbox"' + (f.no_pdf ? ' checked' : '') + ' data-foto-pdf> No PDF</label>' +
        '<button type="button" class="icon-btn icon-btn--danger" data-foto-apagar aria-label="Apagar fotografia">' + icon('trash') + '</button></li>';
    }).join('');
  }
  function enviarFotos(files) {
    if (!files.length) return;
    N.toast('A enviar ' + files.length + (files.length === 1 ? ' fotografia…' : ' fotografias…'));
    N.upload('/orcamentos/' + DATA.id + '/fotos', 'fotos', files).then(function (d) {
      renderFotos(d.fotos);
      N.toast('Fotografias adicionadas.');
    }).catch(function (err) { N.toast(err.message, 'error'); });
  }
  fotosInput.addEventListener('change', function () { enviarFotos(fotosInput.files); fotosInput.value = ''; });
  var drop = form.querySelector('[data-fotos-drop]');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); });
  drop.addEventListener('drop', function (e) { e.preventDefault(); enviarFotos(e.dataTransfer.files); });
  function fotoUpdate(li, body) {
    return N.postJson('/orcamentos/' + DATA.id + '/fotos/' + li.getAttribute('data-foto'), body).catch(function (err) { N.toast(err.message, 'error'); });
  }
  fotosEl.addEventListener('change', function (e) {
    var li = e.target.closest('[data-foto]');
    if (!li) return;
    fotoUpdate(li, { legenda: li.querySelector('[data-foto-legenda]').value, no_pdf: li.querySelector('[data-foto-pdf]').checked ? '1' : '0' });
  });
  fotosEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-foto-apagar]');
    if (!b || !window.confirm('Apagar esta fotografia?')) return;
    var li = b.closest('[data-foto]');
    fotoUpdate(li, { apagar: 1 }).then(function () { li.remove(); });
  });

  renderAll();
}());
