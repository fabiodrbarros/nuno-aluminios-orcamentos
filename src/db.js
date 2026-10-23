'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const seed = require('./seed');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

// Base de dados da aplicação (orcamentos.db).
const db = new Database(path.join(config.dataDir, 'orcamentos.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Migrações numeradas. Cada uma corre uma única vez, dentro de uma transação.
// Nunca alterar uma migração já publicada: acrescentar uma nova.
const migrations = [
  {
    version: 1,
    name: 'schema-inicial',
    up() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL DEFAULT 'particular',          -- particular | empresa
          nome TEXT NOT NULL,
          contacto_nome TEXT NOT NULL DEFAULT '',           -- pessoa de contacto (empresas)
          nif TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          telefone TEXT NOT NULL DEFAULT '',
          telemovel TEXT NOT NULL DEFAULT '',
          whatsapp TEXT NOT NULL DEFAULT '',                -- vazio = usa o telemóvel
          morada TEXT NOT NULL DEFAULT '',
          codigo_postal TEXT NOT NULL DEFAULT '',
          localidade TEXT NOT NULL DEFAULT '',
          notas TEXT NOT NULL DEFAULT '',
          arquivado INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS artigos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          categoria TEXT NOT NULL DEFAULT 'janela',        -- janela | porta | envidracado | acessorio | servico
          tipo TEXT NOT NULL DEFAULT 'vao',                -- vao (com desenho e medidas) | artigo
          nome TEXT NOT NULL,
          descricao TEXT NOT NULL DEFAULT '',
          unidade TEXT NOT NULL DEFAULT 'un',              -- un | m2 | ml | vg
          preco REAL NOT NULL DEFAULT 0,                   -- sem IVA, por unidade
          area_minima REAL NOT NULL DEFAULT 0,             -- m² mínimos cobrados (só unidade m2)
          desenho TEXT NOT NULL DEFAULT '',
          largura INTEGER NOT NULL DEFAULT 0,              -- medidas sugeridas (mm)
          altura INTEGER NOT NULL DEFAULT 0,
          serie TEXT NOT NULL DEFAULT '',
          imagem TEXT NOT NULL DEFAULT '',
          ativo INTEGER NOT NULL DEFAULT 1,
          posicao INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orcamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero TEXT NOT NULL UNIQUE,
          ano INTEGER NOT NULL,
          seq INTEGER NOT NULL,
          token TEXT NOT NULL UNIQUE,                       -- link público para o cliente
          cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
          -- cópia dos dados do cliente no momento (o documento não muda se a ficha mudar)
          cliente_nome TEXT NOT NULL DEFAULT '',
          cliente_nif TEXT NOT NULL DEFAULT '',
          cliente_email TEXT NOT NULL DEFAULT '',
          cliente_telefone TEXT NOT NULL DEFAULT '',
          cliente_morada TEXT NOT NULL DEFAULT '',
          titulo TEXT NOT NULL DEFAULT '',
          obra_local TEXT NOT NULL DEFAULT '',
          data TEXT NOT NULL,                               -- AAAA-MM-DD
          validade_dias INTEGER NOT NULL DEFAULT 30,
          estado TEXT NOT NULL DEFAULT 'rascunho',          -- rascunho | enviado | aceite | recusado
          introducao TEXT NOT NULL DEFAULT '',
          cond_prazo TEXT NOT NULL DEFAULT '',
          cond_pagamento TEXT NOT NULL DEFAULT '',
          cond_garantia TEXT NOT NULL DEFAULT '',
          cond_incluido TEXT NOT NULL DEFAULT '',
          cond_excluido TEXT NOT NULL DEFAULT '',
          observacoes TEXT NOT NULL DEFAULT '',
          notas_internas TEXT NOT NULL DEFAULT '',
          desconto_pct REAL NOT NULL DEFAULT 0,
          iva_taxa REAL NOT NULL DEFAULT 23,
          iva_motivo TEXT NOT NULL DEFAULT '',
          mostrar_precos_linha INTEGER NOT NULL DEFAULT 1,
          subtotal REAL NOT NULL DEFAULT 0,
          desconto_valor REAL NOT NULL DEFAULT 0,
          base REAL NOT NULL DEFAULT 0,
          iva_valor REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          enviado_em TEXT,
          aceite_em TEXT,
          aceite_nome TEXT NOT NULL DEFAULT '',
          recusado_em TEXT,
          visto_em TEXT,                                    -- primeira abertura do link pelo cliente
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_orc_cliente ON orcamentos(cliente_id);
        CREATE INDEX IF NOT EXISTS idx_orc_estado ON orcamentos(estado);

        CREATE TABLE IF NOT EXISTS orcamento_linhas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
          posicao INTEGER NOT NULL DEFAULT 0,
          tipo TEXT NOT NULL DEFAULT 'vao',                 -- vao | artigo | secao | texto
          artigo_id INTEGER REFERENCES artigos(id) ON DELETE SET NULL,
          referencia TEXT NOT NULL DEFAULT '',              -- ex.: J1, P2
          descricao TEXT NOT NULL DEFAULT '',
          detalhe TEXT NOT NULL DEFAULT '',                 -- texto livre por baixo da descrição
          quantidade REAL NOT NULL DEFAULT 1,
          unidade TEXT NOT NULL DEFAULT 'un',
          largura INTEGER NOT NULL DEFAULT 0,
          altura INTEGER NOT NULL DEFAULT 0,
          desenho TEXT NOT NULL DEFAULT '',
          serie TEXT NOT NULL DEFAULT '',
          cor TEXT NOT NULL DEFAULT '',
          vidro TEXT NOT NULL DEFAULT '',
          preco_unitario REAL NOT NULL DEFAULT 0,
          desconto_pct REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL DEFAULT 0,
          imagem TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_linhas_orc ON orcamento_linhas(orcamento_id);

        CREATE TABLE IF NOT EXISTS orcamento_fotos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          legenda TEXT NOT NULL DEFAULT '',
          no_pdf INTEGER NOT NULL DEFAULT 1,
          posicao INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS envios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
          canal TEXT NOT NULL,                              -- whatsapp | whatsapp-manual | email | link
          destino TEXT NOT NULL DEFAULT '',
          ok INTEGER NOT NULL DEFAULT 1,
          detalhe TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

      `);
    },
  },
  {
    version: 2,
    name: 'dados-iniciais',
    up() {
      const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(seed.settings)) insertSetting.run(key, value);
      const insert = db.prepare(`INSERT INTO artigos
        (categoria, tipo, nome, descricao, unidade, preco, area_minima, desenho, largura, altura, serie, posicao)
        VALUES (@categoria, @tipo, @nome, @descricao, @unidade, @preco, @area_minima, @desenho, @largura, @altura, @serie, @posicao)`);
      seed.artigos.forEach((a, i) => insert.run({
        descricao: '', area_minima: 0, desenho: '', largura: 0, altura: 0, serie: '', ...a, posicao: i,
      }));
    },
  },
];

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      m.up();
      db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
    })();
    console.log(`[db] migração ${m.version} (${m.name}) aplicada`);
  }
}

migrate();

module.exports = db;
