/* NUNO Alumínios — orçamentos: comportamento comum a todas as páginas */
(function () {
  'use strict';
  var doc = document;
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  var csrf = doc.body.getAttribute('data-csrf') || '';

  // Confirmação antes de ações destrutivas.
  doc.addEventListener('submit', function (e) {
    var form = e.target;
    var msg = (e.submitter && e.submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Aviso temporário.
  function toast(msg, type) {
    var old = doc.querySelector('[data-toast]');
    if (old) old.remove();
    var el = doc.createElement('div');
    el.className = 'toast toast--' + (type || 'ok');
    el.setAttribute('role', 'status');
    el.setAttribute('data-toast', '');
    el.textContent = msg;
    (doc.querySelector('.admin-main') || doc.body).appendChild(el);
    hideLater(el);
  }
  function hideLater(el) {
    setTimeout(function () { el.classList.add('is-gone'); setTimeout(function () { el.remove(); }, 450); }, el.classList.contains('toast--error') ? 7000 : 3500);
  }
  $$('[data-toast]').forEach(hideLater);

  // Mostrar/ocultar palavra-passe.
  $$('[data-pw-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('[data-pw]');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe');
    });
  });

  // Linhas de tabela clicáveis (o link principal continua a ser o acessível).
  doc.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-href]');
    if (!tr || e.target.closest('a, button, input, select, label')) return;
    if (e.metaKey || e.ctrlKey) window.open(tr.getAttribute('data-href'), '_blank');
    else window.location.href = tr.getAttribute('data-href');
  });

  // Campos só para empresas.
  $$('input[name="tipo"]').forEach(function (r) {
    function sync() {
      var emp = doc.querySelector('input[name="tipo"]:checked');
      $$('[data-show-empresa]').forEach(function (el) { el.hidden = !(emp && emp.value === 'empresa'); });
    }
    r.addEventListener('change', sync);
    sync();
  });

  /* ---------- Fotografias: reduzir e converter para JPEG antes de enviar ---------- */
  // O PDF só aceita JPEG/PNG e fotografias de telemóvel pesam vários MB: o navegador
  // redimensiona para 1800 px e converte (HEIC/WebP passam a JPEG quando o navegador os lê).
  function resize(file, max) {
    max = max || 1800;
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return resolve(null);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
        var c = doc.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b ? new File([b], (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.84);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        // Formato que o navegador não lê: só seguem JPEG/PNG originais.
        resolve(/^image\/(jpeg|png)$/.test(file.type) ? file : null);
      };
      img.src = url;
    });
  }

  function upload(url, field, files) {
    return Promise.all(Array.prototype.map.call(files, function (f) { return resize(f); })).then(function (list) {
      list = list.filter(Boolean);
      if (!list.length) throw new Error('Formato de imagem não suportado. Use JPEG ou PNG.');
      var fd = new FormData();
      fd.append('_csrf', csrf);
      list.forEach(function (f) { fd.append(field, f, f.name); });
      return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Erro no envio.'); return d; }); });
    });
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || ('Erro ' + r.status)); return d; });
    });
  }

  // Formulários com ficheiros sem JavaScript dedicado (artigos): reduzir as imagens antes de enviar.
  $$('form[data-resize]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var inputs = $$('input[type="file"]', form).filter(function (i) { return i.files && i.files.length; });
      if (!inputs.length || form.dataset.sending) return;
      e.preventDefault();
      form.dataset.sending = '1';
      var fd = new FormData(form);
      Promise.all(inputs.map(function (input) {
        fd.delete(input.name);
        return Promise.all(Array.prototype.map.call(input.files, function (f) { return resize(f); })).then(function (list) {
          list.filter(Boolean).forEach(function (f) { fd.append(input.name, f, f.name); });
        });
      })).then(function () {
        return fetch(form.action, { method: 'POST', body: fd, credentials: 'same-origin' });
      }).then(function (r) {
        if (r.redirected) window.location.href = r.url;
        else return r.text().then(function (html) { doc.open(); doc.write(html); doc.close(); });
      }).catch(function () { delete form.dataset.sending; form.submit(); });
    });
  });

  // Pré-visualização do ficheiro escolhido nas zonas de envio.
  $$('.dropzone input[type="file"]').forEach(function (input) {
    var zone = input.closest('.dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function () { zone.classList.remove('is-over'); }); });
    if (input.hasAttribute('data-fotos-input')) return;
    input.addEventListener('change', function () {
      var span = zone.querySelector('span');
      if (span && input.files.length) { span.textContent = Array.prototype.map.call(input.files, function (f) { return f.name; }).join(', '); span.className = 'dropzone__list'; }
    });
  });

  /* ---------- Pesquisa de clientes ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  $$('[data-cliente-picker]').forEach(function (box) {
    var input = box.querySelector('[data-picker-input]');
    var list = box.querySelector('[data-picker-list]');
    var hidden = box.querySelector('input[name="cliente_id"]');
    var orcId = box.getAttribute('data-orc');
    var toggle = box.querySelector('[data-picker-toggle]');
    var pbox = box.querySelector('[data-picker-box]');
    var chosen = box.querySelector('[data-picker-chosen]');
    var timer = null, results = [];

    if (toggle) toggle.addEventListener('click', function () { pbox.hidden = !pbox.hidden; if (!pbox.hidden) input.focus(); });

    function choose(c) {
      hidden.value = c ? c.id : '';
      list.hidden = true;
      if (orcId) {
        postJson('/orcamentos/' + orcId + '/cliente', { cliente_id: c ? c.id : '' }).then(function (d) {
          var o = d.orc;
          ['cliente_nome', 'cliente_nif', 'cliente_telefone', 'cliente_email', 'cliente_morada'].forEach(function (k) {
            var el = doc.querySelector('[name="' + k + '"]');
            if (el) el.value = o[k] || '';
          });
          var cur = box.querySelector('[data-picker-current]');
          cur.querySelector('a, span.muted').outerHTML = c ? '<a class="strong" href="/clientes/' + c.id + '">' + esc(c.nome) + '</a>' : '<span class="muted">Sem ficha de cliente</span>';
          toggle.textContent = c ? 'Trocar' : 'Associar cliente';
          pbox.hidden = true;
          input.value = '';
          toast(c ? 'Cliente associado.' : 'Cliente removido.');
        }).catch(function (err) { toast(err.message, 'error'); });
      } else if (chosen) {
        chosen.hidden = !c;
        chosen.innerHTML = c ? 'Cliente: <strong>' + esc(c.nome) + '</strong> <button type="button" class="link-btn" data-unpick>remover</button>' : '';
        input.value = c ? c.nome : '';
      }
    }

    function render(q) {
      var html = results.map(function (c, i) {
        return '<li><button type="button" data-i="' + i + '"><strong>' + esc(c.nome) + '</strong><span>' + esc([c.nif, c.telemovel, c.localidade].filter(Boolean).join(' · ')) + '</span></button></li>';
      }).join('');
      if (orcId && hidden.value) html += '<li><button type="button" data-none><span>Remover o cliente deste orçamento</span></button></li>';
      html += '<li><a href="/clientes/novo?nome=' + encodeURIComponent(q || '') + '"><span>+ Criar cliente' + (q ? ' “' + esc(q) + '”' : '') + '</span></a></li>';
      list.innerHTML = html;
      list.hidden = false;
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      timer = setTimeout(function () {
        fetch('/clientes?q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
          .then(function (r) { return r.json(); }).then(function (d) { results = d; render(q); });
      }, 180);
    });
    input.addEventListener('focus', function () { if (!input.value) input.dispatchEvent(new Event('input')); });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-none')) return choose(null);
      choose(results[Number(b.getAttribute('data-i'))]);
    });
    doc.addEventListener('click', function (e) {
      if (!box.contains(e.target)) list.hidden = true;
      if (e.target.matches('[data-unpick]')) choose(null);
      var chip = e.target.closest('[data-pick-id]');
      if (chip && !orcId) choose({ id: chip.getAttribute('data-pick-id'), nome: chip.getAttribute('data-pick-nome') });
    });
    var novo = doc.querySelector('[data-novo-cliente]');
    if (novo) novo.addEventListener('click', function () { if (input.value.trim() && !hidden.value) novo.href = '/clientes/novo?nome=' + encodeURIComponent(input.value.trim()); });
  });

  // Copiar para a área de transferência.
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = doc.querySelector(btn.getAttribute('data-copy'));
      var txt = target ? (target.value || target.textContent) : '';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
        toast('Copiado.');
        var log = btn.getAttribute('data-log');
        if (log) postJson(log, { canal: 'link' }).catch(function () {});
      }).catch(function () { if (target && target.select) { target.select(); doc.execCommand('copy'); toast('Copiado.'); } });
    });
  });

  window.Nuno = { toast: toast, resize: resize, upload: upload, postJson: postJson, esc: esc, csrf: csrf };
}());
