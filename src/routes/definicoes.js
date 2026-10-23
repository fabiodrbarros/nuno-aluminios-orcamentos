'use strict';

const express = require('express');
const auth = require('../auth');
const config = require('../config');
const whatsapp = require('../whatsapp');
const { saveSettings, str } = require('../util');
const { flash } = require('../web');

const router = express.Router();

const EMPRESA = ['company_name', 'nif', 'address_line1', 'address_line2', 'postal_code', 'phone', 'mobile', 'email', 'iban', 'responsavel'];
const DOCUMENTO = ['numero_prefixo', 'validade_dias', 'iva_taxa', 'introducao', 'cond_prazo', 'cond_pagamento', 'cond_garantia', 'cond_incluido', 'cond_excluido', 'observacoes'];
const LISTAS = ['lista_series', 'lista_cores', 'lista_vidros', 'lista_iva_motivos'];
const ENVIO = ['whatsapp_mensagem'];

router.get('/', (req, res) => {
  res.render('definicoes/index', { title: 'Definições', publicUrl: config.publicUrl });
});

router.post('/', auth.requireCsrf, (req, res) => {
  const v = {};
  for (const k of [...EMPRESA, ...DOCUMENTO, ...LISTAS, ...ENVIO]) if (k in req.body) v[k] = str(req.body[k], 4000);
  if ('validade_dias' in v) v.validade_dias = String(Math.min(365, Math.max(1, parseInt(v.validade_dias, 10) || 30)));
  if ('iva_taxa' in v) v.iva_taxa = String(Math.min(100, Math.max(0, Number(String(v.iva_taxa).replace(',', '.')) || 0)));
  if (req.body.secao === 'envio') v.whatsapp_anexar_pdf = req.body.whatsapp_anexar_pdf ? '1' : '0';
  saveSettings(v);
  flash(res, 'Definições guardadas.');
  res.redirect(`/definicoes${req.body.secao ? `#${req.body.secao}` : ''}`);
});

/* ---------- WhatsApp (ponte WAHA) ---------- */
router.get('/whatsapp', async (req, res) => {
  res.render('definicoes/whatsapp', { title: 'WhatsApp', estado: await whatsapp.estado() });
});

router.get('/whatsapp/estado.json', async (req, res) => {
  res.json(await whatsapp.estado());
});

router.get('/whatsapp/qr.png', async (req, res) => {
  try {
    const png = await whatsapp.qrPng();
    if (!png) return res.status(404).end();
    res.set('Cache-Control', 'no-store').type('image/png').send(png);
  } catch {
    res.status(503).end();
  }
});

router.post('/whatsapp/ligar', auth.requireCsrf, async (req, res) => {
  try {
    await whatsapp.ligar();
    flash(res, 'A preparar a ligação: leia o código QR com o WhatsApp do telemóvel.');
  } catch (err) {
    flash(res, err.message, 'error');
  }
  res.redirect('/definicoes/whatsapp');
});

router.post('/whatsapp/desligar', auth.requireCsrf, async (req, res) => {
  try {
    await whatsapp.desligar();
    flash(res, 'Número desligado.');
  } catch (err) {
    flash(res, err.message, 'error');
  }
  res.redirect('/definicoes/whatsapp');
});

module.exports = router;
