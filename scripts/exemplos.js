'use strict';
// Cria clientes e orçamentos de exemplo (fictícios) para experimentar a aplicação.
//   npm run exemplos            → só corre se ainda não houver orçamentos
//   npm run exemplos -- --forcar → acrescenta mesmo que já existam
// Os preços vêm dos artigos (Artigos e preços); os nomes, moradas e NIF são inventados.

const db = require('../src/db');
const orcamentos = require('../src/orcamentos');
const calculo = require('../src/calculo');
const { addDays, today } = require('../src/util');

if (db.prepare('SELECT COUNT(*) AS n FROM orcamentos').get().n && !process.argv.includes('--forcar')) {
  console.log('Já existem orçamentos. Para acrescentar os exemplos mesmo assim: npm run exemplos -- --forcar');
  process.exit(0);
}

const art = (nome) => {
  const a = db.prepare('SELECT * FROM artigos WHERE nome = ?').get(nome);
  if (!a) throw new Error(`Artigo em falta: ${nome}`);
  return a;
};
const L = (folhas, extra = {}) => JSON.stringify({ folhas: folhas.map((f) => (typeof f === 'string' ? { t: f } : f)), ...extra });

// Vão a partir de um artigo do catálogo; o preço é o sugerido pela área (pode ser substituído em o.preco).
function vao(ref, nomeArtigo, largura, altura, o = {}) {
  const a = art(nomeArtigo);
  return {
    tipo: 'vao', artigo_id: a.id, referencia: ref, descricao: o.descricao || a.nome,
    largura, altura, desenho: o.desenho || a.desenho, serie: o.serie || a.serie,
    cor: o.cor || '', vidro: o.vidro || '', detalhe: o.detalhe || '',
    quantidade: o.qtd || 1, unidade: 'un',
    preco_unitario: o.preco != null ? o.preco : calculo.precoSugerido(a, largura, altura),
    desconto_pct: o.desc || 0,
  };
}
function artigo(nomeArtigo, quantidade, o = {}) {
  const a = art(nomeArtigo);
  return {
    tipo: 'artigo', artigo_id: a.id, referencia: o.ref || '', descricao: o.descricao || a.nome, detalhe: o.detalhe != null ? o.detalhe : a.descricao,
    quantidade, unidade: a.unidade, preco_unitario: o.preco != null ? o.preco : a.preco, desconto_pct: o.desc || 0,
  };
}
const secao = (descricao) => ({ tipo: 'secao', descricao });
const nota = (descricao, detalhe = '') => ({ tipo: 'texto', descricao, detalhe });

function cliente(c) {
  const campos = { tipo: 'particular', contacto_nome: '', nif: '', email: '', telefone: '', telemovel: '', whatsapp: '', morada: '', codigo_postal: '', localidade: '', notas: '', ...c };
  const cols = Object.keys(campos);
  const id = db.prepare(`INSERT INTO clientes (${cols.join(',')}) VALUES (${cols.map((k) => `@${k}`).join(',')})`).run(campos).lastInsertRowid;
  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
}

const sqlDate = (iso, hora = '10:30:00') => `${iso} ${hora}`;

function orcamento({ cliente: c, titulo, obra_local, diasAtras, linhas, extra = {}, estado = 'rascunho', aceite_nome = '', visto = false }) {
  const id = orcamentos.criar({ cliente: c, titulo, obra_local });
  const data = addDays(today(), -diasAtras);
  orcamentos.gravar(id, { ...orcamentos.get(id), data, mostrar_precos_linha: 1, ...extra }, linhas);
  if (estado !== 'rascunho') {
    orcamentos.mudarEstado(id, estado, { aceite_nome });
    const enviado = sqlDate(addDays(data, 1), '09:15:00');
    db.prepare('UPDATE orcamentos SET enviado_em = ? WHERE id = ?').run(enviado, id);
    orcamentos.registarEnvio(id, 'whatsapp-manual', c.telemovel || c.telefone, true, '');
    db.prepare('UPDATE envios SET created_at = ? WHERE orcamento_id = ?').run(enviado, id);
    if (visto || estado === 'aceite' || estado === 'recusado') db.prepare('UPDATE orcamentos SET visto_em = ? WHERE id = ?').run(sqlDate(addDays(data, 1), '20:42:00'), id);
    if (estado === 'aceite') {
      const quando = sqlDate(addDays(data, 4), '18:05:00');
      db.prepare('UPDATE orcamentos SET aceite_em = ? WHERE id = ?').run(quando, id);
      orcamentos.registarEnvio(id, 'aceite-online', aceite_nome, true, '');
      db.prepare("UPDATE envios SET created_at = ? WHERE orcamento_id = ? AND canal = 'aceite-online'").run(quando, id);
    }
    if (estado === 'recusado') db.prepare('UPDATE orcamentos SET recusado_em = ? WHERE id = ?').run(sqlDate(addDays(data, 9)), id);
  }
  const o = orcamentos.get(id);
  console.log(`${o.numero}  ${o.cliente_nome.padEnd(38)} ${calculo.estadoVisivel(o, today()).padEnd(9)} ${o.total.toFixed(2).padStart(10)} €`);
  return id;
}

const ANTRACITE = 'Lacado cinza antracite RAL 7016';
const BRANCO = 'Lacado branco RAL 9016';
const LOWE = 'Vidro duplo 4+16+4 baixo emissivo';
const FOSCO = 'Vidro fosco (duplo)';

db.transaction(() => {
  /* ---------- Clientes ---------- */
  const maria = cliente({ nome: 'Maria Fernandes', nif: '234 567 890', telemovel: '912 345 678', email: 'maria.fernandes@exemplo.pt', morada: 'Rua do Souto, 12', codigo_postal: '4990-062', localidade: 'Arcozelo, Ponte de Lima', notas: 'Moradia de 1985. Prefere contacto ao fim da tarde. Visita para medições feita com o marido.' });
  const ricardo = cliente({ nome: 'Ricardo Lima', telemovel: '936 112 450', email: 'ricardo.lima@exemplo.pt', morada: 'Av. Campo do Castelo, 145, 3.º Esq.', codigo_postal: '4900-000', localidade: 'Viana do Castelo', notas: 'Condomínio exige cor branca nos fechos de varanda.' });
  const construtora = cliente({ tipo: 'empresa', nome: 'Construções Lima & Filhos, Lda.', contacto_nome: 'Eng.º Paulo Lima', nif: '509 876 543', telefone: '258 900 111', telemovel: '965 300 200', email: 'obras@lima-filhos.exemplo.pt', morada: 'Zona Industrial da Gemieira, Lote 7', codigo_postal: '4990-645', localidade: 'Ponte de Lima', notas: 'Faturação a 60 dias. Enviar orçamentos também para o email da obra.' });
  const pastelaria = cliente({ tipo: 'empresa', nome: 'Pastelaria Doce Lima, Unipessoal Lda.', contacto_nome: 'Sra. Teresa Costa', nif: '515 222 333', telefone: '258 941 020', telemovel: '917 808 090', morada: 'Largo de Camões, 8', codigo_postal: '4990-063', localidade: 'Ponte de Lima' });
  const ana = cliente({ nome: 'Ana Sousa', telemovel: '926 470 118', morada: 'Rua de São João, 30', codigo_postal: '4980-614', localidade: 'Ponte da Barca' });
  cliente({ nome: 'Jorge Barbosa', telemovel: '914 222 777', localidade: 'Refóios do Lima', notas: 'Pediu visita para orçamento de marquise. Ligar em novembro.' });

  /* ---------- Loja: montra (enviado há 50 dias → expirado) ---------- */
  orcamento({
    cliente: pastelaria, titulo: 'Montra e janelas da loja', obra_local: 'Largo de Camões, 8 — Ponte de Lima', diasAtras: 50, estado: 'enviado', visto: true,
    linhas: [
      secao('Fachada'),
      vao('M1', 'Montra comercial com porta', 4200, 3000, {
        desenho: L(['fixo', 'porta-d', 'fixo'], { bandeira: { t: 'basculante', h: 600 } }), cor: 'Anodizado natural', vidro: 'Vidro duplo laminado 33.1+16+4',
        detalhe: 'Porta de abrir para o exterior com mola aérea e fechadura de segurança. Bandeira basculante motorizável para ventilação.',
      }),
      secao('Cozinha'),
      vao('J1', 'Janela basculante', 1000, 600, { qtd: 2, cor: 'Anodizado natural', vidro: FOSCO, detalhe: 'Com mosquiteira fixa (exigência de higiene alimentar).' }),
      artigo('Mosquiteira enrolável', 2, { descricao: 'Mosquiteira fixa para basculante', detalhe: 'Rede em fibra de vidro, aro em alumínio anodizado.', preco: 48 }),
      secao('Trabalhos'),
      artigo('Remoção de caixilharia existente', 1, { descricao: 'Desmontagem da montra existente', preco: 180 }),
      artigo('Montagem', 3),
      artigo('Transporte e deslocação', 1),
      nota('Montagem fora do horário de funcionamento da loja (a partir das 19h00), sem custo adicional.'),
    ],
    extra: { cond_prazo: '3 a 4 semanas após adjudicação. Montagem num só dia.' },
  });

  /* ---------- WC: pequeno (recusado) ---------- */
  orcamento({
    cliente: ana, titulo: 'Substituição de janela da casa de banho', obra_local: 'Ponte da Barca', diasAtras: 30, estado: 'recusado',
    linhas: [
      vao('J1', 'Janela oscilobatente 1 folha', 600, 800, { cor: BRANCO, vidro: FOSCO }),
      artigo('Remoção de caixilharia existente', 1),
      artigo('Montagem', 1),
      artigo('Transporte e deslocação', 1, { preco: 35 }),
    ],
  });

  /* ---------- Fecho de varanda (aceite) ---------- */
  orcamento({
    cliente: ricardo, titulo: 'Fecho de varanda', obra_local: 'Av. Campo do Castelo, 145, 3.º Esq. — Viana do Castelo', diasAtras: 20, estado: 'aceite', aceite_nome: 'Ricardo Lima',
    linhas: [
      vao('E1', 'Fecho de varanda (4 folhas de correr)', 3600, 2200, { cor: BRANCO, vidro: 'Vidro duplo 6+16+4 temperado', detalhe: 'Calha inferior com drenagem para o exterior. Fecho com chave nas folhas centrais.' }),
      vao('E2', 'Fecho de varanda (4 folhas de correr)', 1200, 2200, { descricao: 'Fecho lateral de varanda (2 folhas de correr)', desenho: L(['correr', 'correr']), cor: BRANCO, vidro: 'Vidro duplo 6+16+4 temperado' }),
      artigo('Remates e acabamentos', 1, { preco: 120, detalhe: 'Remates em chapa lacada branca junto à fachada e ao teto da varanda.' }),
      artigo('Montagem', 2),
      artigo('Transporte e deslocação', 1),
      nota('Instalação conforme o regulamento do condomínio (cor branca RAL 9016, sem alteração da guarda existente).'),
    ],
    extra: { cond_pagamento: '40% na adjudicação; restante na conclusão da montagem.' },
  });

  /* ---------- Moradia completa (enviado, visto pelo cliente) ---------- */
  orcamento({
    cliente: maria, titulo: 'Substituição integral da caixilharia', obra_local: 'Moradia — Rua do Souto, 12, Arcozelo', diasAtras: 6, estado: 'enviado', visto: true,
    linhas: [
      secao('Piso 0 — Sala, cozinha e entrada'),
      vao('P1', 'Porta de correr elevatória', 3000, 2300, {
        desenho: L(['correr', 'fixo'], { estore: true }), cor: ANTRACITE, vidro: 'Vidro duplo laminado 33.1+16+4',
        detalhe: 'Folha móvel com sistema elevatório e fecho multiponto. Soleira embutida de nível com o pavimento.',
      }),
      vao('J1', 'Janela oscilobatente 2 folhas', 1200, 1200, { desenho: L(['batente-e', 'oscilo-d'], { estore: true }), cor: ANTRACITE, vidro: LOWE, detalhe: 'Cozinha. Puxadores em alumínio à cor.' }),
      vao('J2', 'Janela basculante', 600, 500, { cor: ANTRACITE, vidro: FOSCO, detalhe: 'Casa de banho social.' }),
      vao('P2', 'Porta de entrada 1 folha', 1400, 2200, {
        descricao: 'Porta de entrada com lateral fixo', desenho: L([{ t: 'porta-e', w: 1 }, { t: 'fixo', w: 0.4 }]), cor: ANTRACITE, vidro: 'Lateral em vidro duplo laminado fosco',
        detalhe: 'Painel com almofada lisa e isolamento térmico. Fechadura de segurança de 3 pontos, puxador barra em inox de 800 mm.', preco: 2150,
      }),
      secao('Piso 1 — Quartos e suite'),
      vao('J3', 'Janela de batente 2 folhas', 1200, 1300, { qtd: 3, desenho: L(['batente-e', 'batente-d'], { estore: true }), cor: ANTRACITE, vidro: LOWE, detalhe: 'Quartos 1, 2 e 3.' }),
      vao('J4', 'Janela oscilobatente 1 folha', 700, 1100, { cor: ANTRACITE, vidro: FOSCO, detalhe: 'Casa de banho da suite.' }),
      vao('P3', 'Porta de varanda 2 folhas', 1400, 2150, { desenho: L(['porta-e', 'porta-d'], { estore: true }), cor: ANTRACITE, vidro: LOWE, detalhe: 'Suite, acesso à varanda. Soleira de baixa altura.' }),
      secao('Estores e acessórios'),
      artigo('Estore em alumínio térmico', 16.03, { detalhe: 'P1, J1, J3 (×3) e P3 — lâmina térmica à cor da caixilharia, caixa exterior compacta.' }),
      artigo('Motorização de estore', 6, { detalhe: 'Motor tubular com interruptor de parede em cada vão com estore.' }),
      artigo('Mosquiteira enrolável', 5, { detalhe: 'J1, J3 (×3) e J4.' }),
      artigo('Peitoril em alumínio', 6.1, { detalhe: 'Peitoris novos em J1, J2, J3 (×3) e J4, em chapa lacada antracite.' }),
      secao('Trabalhos'),
      artigo('Remoção de caixilharia existente', 9, { detalhe: 'Caixilharia em alumínio simples e madeira; transporte a operador de resíduos licenciado.' }),
      artigo('Montagem', 9),
      artigo('Remates e acabamentos', 1, { preco: 280, detalhe: 'Remates interiores e exteriores em alumínio à cor e vedação final.' }),
      artigo('Transporte e deslocação', 1),
      nota('Ponto de alimentação elétrica junto a cada caixa de estore a cargo do cliente.'),
    ],
    extra: {
      desconto_pct: 3,
      cond_prazo: '5 a 6 semanas após adjudicação e confirmação das medidas em obra. Montagem em 3 dias úteis.',
      notas_internas: 'Cliente comparou com outra proposta em PVC. Margem para mais 2% de desconto se fechar este mês.',
    },
  });

  /* ---------- Prédio para construtora (rascunho, autoliquidação) ---------- */
  orcamento({
    cliente: construtora, titulo: 'Edifício habitacional — 6 frações', obra_local: 'Lote 3, Rua Nova de Crasto — Ponte da Barca', diasAtras: 1,
    linhas: [
      secao('Frações A a F (6 apartamentos T2 iguais)'),
      vao('J1', 'Janela oscilobatente 2 folhas', 1400, 1250, { qtd: 12, cor: 'Lacado cinza RAL 7035', vidro: LOWE, detalhe: 'Quartos — 2 por fração.', desc: 5 }),
      vao('J2', 'Janela oscilobatente 1 folha', 800, 1250, { qtd: 6, cor: 'Lacado cinza RAL 7035', vidro: LOWE, detalhe: 'Cozinhas — 1 por fração.', desc: 5 }),
      vao('J3', 'Janela basculante', 600, 600, { qtd: 6, cor: 'Lacado cinza RAL 7035', vidro: FOSCO, detalhe: 'Casas de banho — 1 por fração.', desc: 5 }),
      vao('P1', 'Porta de correr 2 folhas', 2400, 2200, { qtd: 6, desenho: L(['correr', 'correr'], { estore: true }), cor: 'Lacado cinza RAL 7035', vidro: LOWE, detalhe: 'Salas, acesso às varandas.', desc: 5 }),
      artigo('Estore em alumínio térmico', 31.68, { detalhe: 'Estores das portas de correr P1 (6 × 5,28 m²), manuais com fita.' }),
      secao('Zonas comuns'),
      vao('M1', 'Montra comercial com porta', 3200, 2900, {
        descricao: 'Entrada do edifício', desenho: L(['fixo', 'porta-d', 'porta-e', 'fixo'], { bandeira: { t: 'fixo', h: 500 } }), cor: 'Lacado cinza RAL 7035', vidro: 'Vidro duplo laminado 33.1+16+4',
        detalhe: 'Porta de 2 folhas com mola aérea, fecho eletromagnético para videoporteiro e puxadores barra em inox.',
      }),
      vao('J4', 'Caixilho fixo', 900, 1800, { qtd: 3, cor: 'Lacado cinza RAL 7035', vidro: 'Vidro duplo laminado 33.1+16+4', detalhe: 'Caixa de escadas — um por piso.' }),
      secao('Trabalhos'),
      artigo('Montagem', 34, { preco: 40, detalhe: 'Montagem por vão, faseada conforme o andamento da obra.' }),
      artigo('Transporte e deslocação', 3, { detalhe: 'Três entregas faseadas.' }),
      nota('Os vãos de tosco devem estar executados e com contramarcos colocados pelo empreiteiro antes da medição final.'),
    ],
    extra: {
      iva_taxa: 0,
      iva_motivo: 'IVA – autoliquidação (art.º 2.º, n.º 1, alínea j) do CIVA)',
      desconto_pct: 0,
      cond_prazo: '8 a 10 semanas após adjudicação, com entregas faseadas por piso.',
      cond_pagamento: '30% na adjudicação; 40% na entrega dos materiais em obra; 30% na conclusão. Pagamento a 30 dias.',
      cond_excluido: 'Contramarcos, andaimes, meios de elevação, construção civil e eletricidade (videoporteiro).',
    },
  });
})();

console.log('\nExemplos criados. Os nomes, contactos e NIF são fictícios.');
