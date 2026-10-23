'use strict';

// Envio por WhatsApp através da ponte WAHA (https://waha.devlike.pro), o mesmo modelo usado no
// Granivez hub. Só fica ativo se WHATSAPP_API_URL estiver definido; sem ponte, a aplicação
// oferece o envio manual (wa.me), que abre o WhatsApp do próprio utilizador com a mensagem pronta.

const config = require('./config');

class WhatsAppErro extends Error {}

const configurado = () => Boolean(config.whatsappUrl);

async function pedido(metodo, caminho, corpo, { bruto = false, timeout = 15000 } = {}) {
  if (!configurado()) throw new WhatsAppErro('A ponte WhatsApp não está configurada.');
  const headers = { Accept: bruto ? 'image/png' : 'application/json' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (config.whatsappKey) headers['X-Api-Key'] = config.whatsappKey;
  let res;
  try {
    res = await fetch(config.whatsappUrl + caminho, {
      method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new WhatsAppErro('A ponte WhatsApp não responde.');
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.text()).slice(0, 200); } catch { /* sem corpo */ }
    const err = new WhatsAppErro(`A ponte WhatsApp respondeu ${res.status}.`);
    err.status = res.status;
    err.detalhe = msg;
    throw err;
  }
  if (bruto) return Buffer.from(await res.arrayBuffer());
  const txt = await res.text();
  return txt ? JSON.parse(txt) : {};
}

const sessao = () => encodeURIComponent(config.whatsappSession);

// { status: STOPPED|STARTING|SCAN_QR_CODE|WORKING|FAILED|SEM_SESSAO|INDISPONIVEL, numero, nome, erro }
async function estado() {
  if (!configurado()) return { status: 'INDISPONIVEL', erro: 'Ponte não configurada.' };
  try {
    const s = await pedido('GET', `/api/sessions/${sessao()}`);
    if (!s) return { status: 'SEM_SESSAO' };
    const me = s.me || {};
    return { status: s.status || 'STOPPED', numero: String(me.id || '').split('@')[0], nome: me.pushName || '' };
  } catch (err) {
    return { status: 'INDISPONIVEL', erro: err.message };
  }
}

async function ligar() {
  const atual = await pedido('GET', `/api/sessions/${sessao()}`);
  if (!atual) {
    await pedido('POST', '/api/sessions', { name: config.whatsappSession, start: true });
  } else if (atual.status === 'STOPPED' || atual.status === 'FAILED') {
    if (atual.status === 'FAILED') await pedido('POST', `/api/sessions/${sessao()}/stop`, {});
    await pedido('POST', `/api/sessions/${sessao()}/start`, {});
  }
}

const qrPng = () => pedido('GET', `/api/${sessao()}/auth/qr?format=image`, undefined, { bruto: true });
const desligar = () => pedido('POST', `/api/sessions/${sessao()}/logout`, {});

// chatId do número se tiver WhatsApp; null se não tiver.
async function verificarNumero(digitos) {
  const r = await pedido('GET', `/api/contacts/check-exists?phone=${digitos}&session=${sessao()}`);
  if (!r || !r.numberExists) return null;
  return r.chatId || `${digitos}@c.us`;
}

function enviarTexto(chatId, texto) {
  return pedido('POST', '/api/sendText', { session: config.whatsappSession, chatId, text: texto }, { timeout: 30000 });
}

function enviarFicheiro(chatId, dados, nome, legenda) {
  return pedido('POST', '/api/sendFile', {
    session: config.whatsappSession, chatId, caption: legenda,
    file: { mimetype: 'application/pdf', filename: nome, data: dados.toString('base64') },
  }, { timeout: 90000 });
}

/**
 * Envia o orçamento: PDF com a mensagem como legenda; se a ponte não aceitar ficheiros
 * (a versão gratuita do WAHA pode não ter envio de ficheiros), envia só a mensagem (com o link).
 * Devolve { comPdf: boolean }.
 */
async function enviarOrcamento(digitos, mensagem, pdf, nomePdf) {
  const chatId = await verificarNumero(digitos);
  if (!chatId) throw new WhatsAppErro('Este número não tem WhatsApp.');
  if (pdf) {
    try {
      await enviarFicheiro(chatId, pdf, nomePdf, mensagem);
      return { comPdf: true };
    } catch (err) {
      if (!err.status) throw err; // ponte em baixo: não tentar outra vez
      console.warn('[whatsapp] envio do PDF recusado, a enviar só a mensagem:', err.message, err.detalhe || '');
    }
  }
  await enviarTexto(chatId, mensagem);
  return { comPdf: false };
}

// O WhatsApp transforma "2026/0001" num telefone; um carácter invisível de cada lado da barra evita-o.
function semLink(numero) {
  return String(numero || '').replace(/(?<=\d)\/(?=\d)/g, '⁠/⁠');
}

function waMeLink(digitos, texto) {
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

module.exports = { WhatsAppErro, configurado, estado, ligar, qrPng, desligar, enviarOrcamento, semLink, waMeLink };
