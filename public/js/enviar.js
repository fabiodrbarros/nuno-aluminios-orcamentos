/* Envio manual: WhatsApp (wa.me) e email abrem a aplicação do utilizador; o envio fica registado. */
(function () {
  'use strict';
  var N = window.Nuno;
  var numero = document.getElementById('wa-numero');
  var msg = document.getElementById('wa-msg');
  function digits(v) {
    var raw = String(v || '').replace(/\(0\)/g, '').trim();
    var d = raw.replace(/\D/g, '');
    if (raw.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 9 && raw.charAt(0) !== '+') d = '351' + d;
    return d.length >= 10 && d.length <= 15 ? d : null;
  }
  var wa = document.querySelector('[data-wa-manual]');
  if (wa) wa.addEventListener('click', function (e) {
    e.preventDefault();
    var d = digits(numero.value);
    if (!d) { N.toast('Indique um número de telemóvel válido.', 'error'); numero.focus(); return; }
    window.open('https://wa.me/' + d + '?text=' + encodeURIComponent(msg.value), '_blank', 'noopener');
    N.postJson(wa.getAttribute('data-log'), { canal: 'whatsapp-manual', destino: numero.value }).then(function () { N.toast('Envio registado: estado “Enviado”.'); });
  });
  var mail = document.querySelector('[data-mail]');
  if (mail) mail.addEventListener('click', function () {
    mail.href = mail.href.replace(/&body=[^&]*/, '&body=' + encodeURIComponent(msg.value.replace(/\*/g, '')));
    N.postJson(mail.getAttribute('data-log'), { canal: 'email', destino: '' }).catch(function () {});
  });
}());
