# NUNO Alumínios — Orçamentos

Aplicação de orçamentos da **Nuno Alumínios, Unipessoal Lda.** Aplicação independente: código, base de
dados, contentor e domínio próprios. Node.js + Express + EJS + SQLite, com a identidade visual NUNO
(Montserrat, carvão / verde-lima).

## O que faz

- **Clientes** — ficha (particular/empresa, NIF, contactos, WhatsApp, morada, notas), pesquisa,
  histórico de orçamentos por cliente, arquivo e exportação CSV.
- **Orçamentos** — numeração `ORC 2026/0001`, estados (rascunho, enviado, aceite, recusado, expirado),
  duplicar para nova versão, gravação automática.
  - **Vãos com desenho técnico** gerado à escala: folhas (fixo, batente, oscilobatente, basculante, correr,
    porta), bandeira, caixa de estore, cotas parciais e totais em mm, vista interior.
  - Medidas, área, sistema/série, cor, vidro, detalhes, fotografia por linha.
  - Preço calculado pela área (€/m² com área mínima) ou por unidade — sempre editável.
  - Linhas livres (estores, acessórios, montagem…), secções (ex.: “Piso 1 — Quartos”) e notas.
  - Fotografias da obra (reduzidas e convertidas para JPEG no navegador antes de enviar).
  - Desconto por linha e global, IVA 23/13/6/0 % com menção (autoliquidação, isenção).
  - Condições: prazo, pagamento, garantia, incluído/excluído, validade, observações.
- **PDF com a marca** — cabeçalho do papel timbrado, tabela com o desenho de cada vão, totais,
  condições, fotografias, aceitação, rodapé com contactos e paginação. Gerado em JavaScript (PDFKit):
  não precisa de browser nem de bibliotecas de sistema.
- **Link do cliente** (`/o/<token>`) — o cliente vê o orçamento, descarrega o PDF e **aceita online**.
  Fica registado quando abriu. Rascunhos nunca são públicos.
- **WhatsApp**
  - *Sem configuração:* “Enviar pelo meu WhatsApp” abre o WhatsApp do telemóvel/computador com a mensagem
    e o link prontos (wa.me).
  - *Com a ponte WAHA configurada* (o mesmo modelo do Granivez hub): envio automático pelo número da
    empresa, com o PDF anexado; se a ponte não aceitar ficheiros, segue a mensagem com o link.
- **Artigos e preços** — catálogo interno de tipologias (desenho, medidas habituais, preço, área mínima,
  fotografia). Os preços iniciais são **exemplos** — rever antes de usar.

## Estrutura

```
src/server.js          arranque HTTP, cabeçalhos de segurança
src/db.js              SQLite (orcamentos.db) + migrações numeradas
src/seed.js            definições e artigos iniciais
src/desenho.js         desenho técnico dos vãos (o mesmo ficheiro no servidor e no navegador)
src/calculo.js         totais, preços sugeridos, estados (lógica pura, testada)
src/orcamentos.js      dados dos orçamentos (numeração, gravar, duplicar, mensagem)
src/pdf.js             PDF do orçamento
src/whatsapp.js        ponte WAHA
src/routes/            painel, clientes, orçamentos, artigos, definições, página pública
src/views/             modelos EJS
public/                CSS, JS e identidade visual
assets/                fontes TTF e logótipos para o PDF
scripts/exemplos.js    clientes e orçamentos de exemplo
test/                  testes (node --test)
```

## Variáveis de ambiente

| Nome | Obrigatória | Descrição |
|---|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | sim | Conta de acesso (criada/atualizada a cada arranque) |
| `SESSION_SECRET` | recomendada | Texto aleatório longo; se faltar é gerado e guardado em `DATA_DIR` |
| `PUBLIC_URL` | recomendada | Endereço público da app (ex.: `https://orcamentos.dominio.pt`) — usado nos links enviados aos clientes |
| `WHATSAPP_API_URL` / `WHATSAPP_API_KEY` | não | Ponte WAHA para envio automático; vazio = envio manual |
| `WHATSAPP_SESSION` | não | Sessão WAHA (predefinição `default`) |
| `PORT` | não | Porta HTTP interna (predefinição `3100`) |
| `DATA_DIR` | não | Pasta persistente (predefinição `/data`) |

## Dados

Tudo o que é persistente fica em `DATA_DIR` (`/data`):

- `/data/orcamentos.db` — base de dados SQLite (WAL)
- `/data/uploads/` — fotografias das obras, das linhas e dos artigos
- `/data/.session-secret` — só se `SESSION_SECRET` não estiver definido

Cópia de segurança: copiar a pasta `/data` (ou `sqlite3 orcamentos.db ".backup copia.db"`).

## Instalação (servidor)

Um serviço com o `Dockerfile` deste diretório, volume persistente em `/data`, porta `3100`, e as
variáveis acima. Domínio próprio, por exemplo `orcamentos.dominio.pt`, com HTTPS.

Com Docker Compose (inclui a ponte WhatsApp):

```
cp .env.example .env      # preencher
docker compose up -d --build
```

### WhatsApp automático (opcional)

1. Arrancar o serviço `whatsapp` do `docker-compose.yml` (imagem `devlikeapro/waha:noweb`), com
   `WAHA_API_KEY` no `.env`.
2. Na app: **Definições → WhatsApp → Ligar número** e ler o código QR com o telemóvel da empresa
   (WhatsApp → Dispositivos ligados).
3. Em cada orçamento: **Enviar → Enviar por WhatsApp**. O número é verificado antes do envio e o envio
   fica no histórico.

O texto da mensagem edita-se em **Definições → Envio** (campos `{{saudacao}}`, `{{numero}}`, `{{link}}`…).

## Desenvolvimento

```
npm install
cp .env.example .env.dev   # definir DATA_DIR=./data-dev, ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL=http://localhost:3100
npm run exemplos:local    # opcional: clientes e orçamentos de exemplo (fictícios)
npm run dev:local
npm test
```

## Notas

- Um orçamento não é um documento fiscal (não é fatura): não precisa de software certificado pela AT.
- As medidas e os desenhos são indicativos; o texto por omissão das observações diz que as medidas são
  confirmadas em obra antes da produção.
