/* Página WhatsApp: atualiza o QR e recarrega quando o estado muda. */
(function () {
  'use strict';
  var box = document.querySelector('[data-wa-status]');
  if (!box) return;
  var inicial = box.getAttribute('data-wa-status');
  if (['SCAN_QR_CODE', 'STARTING'].indexOf(inicial) < 0) return;
  var qr = document.querySelector('[data-qr]');
  setInterval(function () {
    fetch('/definicoes/whatsapp/estado.json', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.status !== inicial) window.location.reload();
      else if (qr) qr.src = '/definicoes/whatsapp/qr.png?t=' + Date.now();
    }).catch(function () {});
  }, 4000);
}());
