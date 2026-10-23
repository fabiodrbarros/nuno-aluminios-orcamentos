'use strict';

const express = require('express');
const config = require('../config');
const auth = require('../auth');
const { rateLimiter } = require('../util');

const router = express.Router();
const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
const enabled = () => Boolean(config.adminEmail && config.adminPassword);

router.get('/entrar', (req, res) => {
  if (req.user) return res.redirect('/');
  res.set('Cache-Control', 'no-store');
  res.render('entrar', { title: 'Entrar', error: null, email: '', enabled: enabled() });
});

router.post('/entrar', (req, res) => {
  const email = String(req.body.email || '').trim();
  const render = (status, error) => res.status(status).render('entrar', { title: 'Entrar', error, email, enabled: enabled() });
  if (!loginLimiter.hit(req.ip)) return render(429, 'Demasiadas tentativas. Aguarde 15 minutos.');
  const user = auth.verify(email, req.body.password);
  if (!user) return render(401, 'Email ou palavra-passe incorretos.');
  loginLimiter.reset(req.ip);
  auth.login(req, res, user);
  res.redirect('/');
});

router.post('/sair', (req, res) => {
  auth.logout(req, res);
  res.redirect('/entrar');
});

module.exports = router;
