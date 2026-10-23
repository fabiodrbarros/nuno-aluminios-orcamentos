'use strict';

// Utilitários partilhados pelas rotas: avisos (flash), envio de imagens e validação.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

// Só JPEG e PNG: são os formatos que o PDF aceita. O navegador converte as fotografias
// (incluindo HEIC/WebP) para JPEG e reduz o tamanho antes de enviar (public/js/app.js).
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, config.uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${MIME_EXT[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(MIME_EXT[file.mimetype])),
});

function isImage(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    const hex = buf.toString('hex');
    return hex.startsWith('ffd8ff') || hex.startsWith('89504e47');
  } catch {
    return false;
  }
}

function removeUpload(filename) {
  if (!filename || !/^[a-z0-9-]+\.(jpg|png)$/.test(filename)) return;
  fs.unlink(path.join(config.uploadsDir, filename), () => {});
}

function discardFiles(req) {
  for (const f of req.files || []) fs.unlink(f.path, () => {});
  if (req.file) fs.unlink(req.file.path, () => {});
}

// Multer primeiro (o token CSRF vem no corpo multipart), depois CSRF e validação do conteúdo.
function withUpload(field, max, handler) {
  return [
    (req, res, next) => upload.array(field, max)(req, res, (err) => {
      if (err) {
        discardFiles(req);
        return res.status(400).json({ error: `Erro no envio: ${err.message}` });
      }
      next();
    }),
    (req, res, next) => {
      const token = (req.body && req.body._csrf) || req.get('x-csrf-token');
      if (!req.user || token !== req.user.csrf) {
        discardFiles(req);
        return res.status(403).json({ error: 'Pedido inválido (CSRF). Recarregue a página.' });
      }
      req.images = [];
      for (const f of req.files || []) {
        if (isImage(f.path)) req.images.push(f.filename);
        else fs.unlink(f.path, () => {});
      }
      next();
    },
    handler,
  ];
}

function flash(res, msg, type = 'ok') {
  res.cookie('nuno_orc_flash', JSON.stringify({ msg, type }), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 20000 });
}

function wantsJson(req) {
  return req.xhr || (req.get('accept') || '').includes('application/json');
}

function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}

module.exports = { upload, withUpload, isImage, removeUpload, flash, wantsJson, baseUrl };
