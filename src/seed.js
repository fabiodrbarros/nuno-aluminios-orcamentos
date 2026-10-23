'use strict';

// Dados iniciais. Os preços dos artigos são indicativos (exemplo): rever em Artigos
// antes de enviar orçamentos. Tudo é editável na aplicação.

// Dados da empresa (provisórios): editar em Definições → Empresa.
const settings = {
  company_name: 'Nuno Alumínios, Unipessoal Lda.',
  nif: '513 792 287',
  address_line1: 'Rua da Anta, n.º 520',
  address_line2: 'Correlhã',
  postal_code: '4990-282 Ponte de Lima',
  phone: '258 000 000',
  mobile: '910 000 000',
  email: 'geral@exemplo.pt',
  iban: '',
  responsavel: 'Nuno',

  numero_prefixo: 'ORC',
  validade_dias: '30',
  iva_taxa: '23',
  introducao: 'Conforme solicitado, apresentamos a nossa proposta para o fornecimento e montagem da caixilharia em alumínio abaixo descrita.',
  cond_prazo: '4 a 6 semanas após adjudicação e confirmação das medidas em obra.',
  cond_pagamento: '50% na adjudicação; restante na conclusão da montagem.',
  cond_garantia: 'Garantia nos termos da lei em vigor.',
  cond_incluido: 'Fornecimento e montagem; vedação perimetral com silicone; limpeza dos nossos trabalhos.',
  cond_excluido: 'Construção civil, pintura, eletricidade, andaimes ou meios de elevação, salvo indicação em contrário.',
  observacoes: 'As medidas indicadas são aproximadas e serão confirmadas em obra antes da produção. Desenhos em vista interior, sem escala.',

  lista_series: 'Sistema de correr\nSistema de correr com rutura térmica\nSistema de batente\nSistema de batente com rutura térmica\nSistema elevatório',
  lista_cores: 'Lacado branco RAL 9016\nLacado cinza antracite RAL 7016\nLacado preto RAL 9005\nAnodizado natural\nAnodizado bronze\nImitação madeira',
  lista_vidros: 'Vidro duplo 4+16+4\nVidro duplo 4+16+4 baixo emissivo\nVidro duplo laminado 33.1+16+4\nVidro duplo 6+16+4 temperado\nVidro simples 6 mm\nVidro fosco (duplo)',
  lista_iva_motivos: 'IVA – autoliquidação (art.º 2.º, n.º 1, alínea j) do CIVA)\nIsento (art.º 14.º do CIVA)',

  whatsapp_anexar_pdf: '1',
  whatsapp_mensagem: 'Olá{{saudacao}}! Segue o orçamento {{numero}} da Nuno Alumínios{{obra}}.\n\nPode consultá-lo e aceitá-lo aqui: {{link}}\n\nQualquer dúvida, disponha.',
  precos_revistos: '0',
};

// Desenho paramétrico (ver src/desenho.js): folhas da esquerda para a direita.
const L = (folhas, extra = {}) => JSON.stringify({ folhas: folhas.map((t) => ({ t })), ...extra });

const artigos = [
  // Janelas
  { categoria: 'janela', nome: 'Janela de batente 1 folha', tipo: 'vao', unidade: 'm2', preco: 290, area_minima: 1, desenho: L(['batente-e']), largura: 800, altura: 1200, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'janela', nome: 'Janela de batente 2 folhas', tipo: 'vao', unidade: 'm2', preco: 280, area_minima: 1.2, desenho: L(['batente-e', 'batente-d']), largura: 1200, altura: 1200, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'janela', nome: 'Janela oscilobatente 1 folha', tipo: 'vao', unidade: 'm2', preco: 320, area_minima: 1, desenho: L(['oscilo-e']), largura: 800, altura: 1200, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'janela', nome: 'Janela oscilobatente 2 folhas', tipo: 'vao', unidade: 'm2', preco: 310, area_minima: 1.2, desenho: L(['batente-e', 'oscilo-d']), largura: 1200, altura: 1200, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'janela', nome: 'Janela de correr 2 folhas', tipo: 'vao', unidade: 'm2', preco: 230, area_minima: 1.2, desenho: L(['correr', 'correr']), largura: 1500, altura: 1200, serie: 'Sistema de correr com rutura térmica' },
  { categoria: 'janela', nome: 'Janela basculante', tipo: 'vao', unidade: 'm2', preco: 300, area_minima: 0.5, desenho: L(['basculante']), largura: 600, altura: 500, serie: 'Sistema de batente' },
  { categoria: 'janela', nome: 'Caixilho fixo', tipo: 'vao', unidade: 'm2', preco: 180, area_minima: 0.5, desenho: L(['fixo']), largura: 1000, altura: 1000, serie: 'Sistema de batente' },
  // Portas
  { categoria: 'porta', nome: 'Porta de entrada 1 folha', tipo: 'vao', unidade: 'un', preco: 1650, area_minima: 0, desenho: L(['porta-e']), largura: 1000, altura: 2200, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'porta', nome: 'Porta de varanda 2 folhas', tipo: 'vao', unidade: 'm2', preco: 300, area_minima: 2.5, desenho: L(['porta-e', 'porta-d']), largura: 1400, altura: 2150, serie: 'Sistema de batente com rutura térmica' },
  { categoria: 'porta', nome: 'Porta de correr 2 folhas', tipo: 'vao', unidade: 'm2', preco: 240, area_minima: 3, desenho: L(['correr', 'correr']), largura: 2000, altura: 2150, serie: 'Sistema de correr com rutura térmica' },
  { categoria: 'porta', nome: 'Porta de correr elevatória', tipo: 'vao', unidade: 'm2', preco: 420, area_minima: 4, desenho: L(['correr', 'fixo']), largura: 3000, altura: 2300, serie: 'Sistema elevatório' },
  // Envidraçados
  { categoria: 'envidracado', nome: 'Fecho de varanda (4 folhas de correr)', tipo: 'vao', unidade: 'm2', preco: 210, area_minima: 3, desenho: L(['correr', 'correr', 'correr', 'correr']), largura: 3200, altura: 2200, serie: 'Sistema de correr' },
  { categoria: 'envidracado', nome: 'Montra comercial com porta', tipo: 'vao', unidade: 'm2', preco: 260, area_minima: 4, desenho: L(['fixo', 'porta-d', 'fixo'], { bandeira: { t: 'fixo', h: 500 } }), largura: 3600, altura: 2800, serie: 'Sistema de batente' },
  // Estores e acessórios
  { categoria: 'acessorio', nome: 'Estore em alumínio térmico', tipo: 'artigo', unidade: 'm2', preco: 85, area_minima: 1, descricao: 'Lâmina em alumínio com espuma de poliuretano, caixa de estore e guias.' },
  { categoria: 'acessorio', nome: 'Motorização de estore', tipo: 'artigo', unidade: 'un', preco: 160, descricao: 'Motor tubular com interruptor; ligação elétrica no local preparado.' },
  { categoria: 'acessorio', nome: 'Mosquiteira enrolável', tipo: 'artigo', unidade: 'un', preco: 95, descricao: 'Mosquiteira enrolável vertical em alumínio lacado.' },
  { categoria: 'acessorio', nome: 'Peitoril em alumínio', tipo: 'artigo', unidade: 'ml', preco: 32, descricao: 'Peitoril em chapa de alumínio quinada e lacada.' },
  // Serviços
  { categoria: 'servico', nome: 'Montagem', tipo: 'artigo', unidade: 'un', preco: 45, descricao: 'Montagem em obra por vão, incluindo fixação e vedação.' },
  { categoria: 'servico', nome: 'Remoção de caixilharia existente', tipo: 'artigo', unidade: 'un', preco: 35, descricao: 'Desmontagem e transporte a destino adequado.' },
  { categoria: 'servico', nome: 'Transporte e deslocação', tipo: 'artigo', unidade: 'vg', preco: 60 },
  { categoria: 'servico', nome: 'Remates e acabamentos', tipo: 'artigo', unidade: 'vg', preco: 0, descricao: 'Remates em alumínio e vedação final.' },
];

module.exports = { settings, artigos };
