/* Formulário de artigo: editor do desenho (folhas, bandeira, estore) com pré-visualização. */
(function () {
  'use strict';
  var form = document.querySelector('[data-artigo-form]');
  if (!form) return;
  var D = window.NunoDesenho;
  var TIPOS = JSON.parse(document.getElementById('tipos-data').textContent);
  var json = form.querySelector('[data-desenho-json]');
  var preview = form.querySelector('[data-desenho-preview]');
  var box = form.querySelector('[data-folhas]');
  var lay = D.parse(json.value);

  function opts(sel) { return TIPOS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === sel ? ' selected' : '') + '>' + t[1] + '</option>'; }).join(''); }
  function render() {
    box.innerHTML = '<p class="f-label">Folhas (da esquerda para a direita)</p><div class="ln__folhas">' + lay.folhas.map(function (f, j) {
      return '<label class="folha"><span>' + (j + 1) + '</span><select data-f="' + j + '">' + opts(f.t) + '</select></label>';
    }).join('') + '<div class="ln__fbtn"><button type="button" class="a-btn a-btn--sm" data-f-add>+</button><button type="button" class="a-btn a-btn--sm" data-f-del>−</button></div></div>' +
      '<div class="ln__extras"><label class="f f--compact"><span>Bandeira</span><select data-band><option value="">Sem bandeira</option><option value="fixo"' + (lay.bandeira && lay.bandeira.t === 'fixo' ? ' selected' : '') + '>Fixa</option><option value="basculante"' + (lay.bandeira && lay.bandeira.t === 'basculante' ? ' selected' : '') + '>Basculante</option></select></label>' +
      (lay.bandeira ? '<label class="f f--compact"><span>Altura bandeira (mm)</span><input data-band-h value="' + lay.bandeira.h + '" inputmode="numeric"></label>' : '') +
      '<label class="check"><input type="checkbox" data-estore' + (lay.estore ? ' checked' : '') + '> Caixa de estore</label></div>';
    draw();
  }
  function draw() {
    json.value = D.stringify(lay);
    preview.innerHTML = D.svg(lay, form.largura.value, form.altura.value);
  }
  box.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-f')) lay.folhas[Number(t.getAttribute('data-f'))].t = t.value;
    else if (t.hasAttribute('data-band')) { lay.bandeira = t.value ? { t: t.value, h: (lay.bandeira && lay.bandeira.h) || 400 } : null; return render(); }
    else if (t.hasAttribute('data-estore')) lay.estore = t.checked;
    draw();
  });
  box.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-band-h')) { lay.bandeira.h = Math.max(50, parseInt(e.target.value, 10) || 400); draw(); }
  });
  box.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-f-add') && lay.folhas.length < 8) { lay.folhas.push({ t: lay.folhas[lay.folhas.length - 1].t, w: 1 }); render(); }
    if (e.target.hasAttribute('data-f-del') && lay.folhas.length > 1) { lay.folhas.pop(); render(); }
  });
  Array.prototype.forEach.call(form.querySelectorAll('[data-dim]'), function (i) { i.addEventListener('input', draw); });

  function sync() {
    var vao = form.querySelector('input[name="tipo"]:checked').value === 'vao';
    Array.prototype.forEach.call(form.querySelectorAll('[data-only-vao]'), function (el) { el.hidden = !vao; });
    form.querySelector('[data-only-m2]').hidden = form.querySelector('[data-unidade]').value !== 'm2';
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'tipo' || e.target.name === 'unidade') sync(); });
  render();
  sync();
}());
