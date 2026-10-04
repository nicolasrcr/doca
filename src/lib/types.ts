export type BaseRole = "owner" | "editor" | "viewer";

export interface Base {
  id: string;
  name: string;
  city: string;
  meta: number;
  alerta: number;
  rate: number;
  theme: string;
  whatsapp_webhook: string;
  owner_id: string;
  org_id?: string | null;
  created_at: string;
  role?: BaseRole;
  expurgar_insucessos?: boolean;
  stale_days?: number;
  auto_send_webhook?: boolean;
  // Limites dos alertas operacionais — cada base ajusta à sua realidade
  taxa_falha_aviso?: number; // % de sucesso abaixo disso = aviso (ex.: 97)
  taxa_falha_critico?: number; // % de sucesso abaixo disso = crítico (ex.: 95)
  inicio_tardio_aviso_h?: number; // horas entre saída e 1ª entrega = aviso (ex.: 4)
  inicio_tardio_critico_h?: number; // = crítico (ex.: 6)
  ritmo_multiplicador?: number; // entregas/h acima disso x a mediana da base = aviso (ex.: 2)
  carga_desigual_min?: number; // fração da mediana de pacotes abaixo disso = aviso (ex.: 0.6)
  carga_desigual_max?: number; // fração da mediana de pacotes acima disso = aviso (ex.: 1.4)
  entrega_noturna_limite?: number; // hora do dia (0-23) a partir da qual conta como noturna (ex.: 20)
  entrega_noturna_min?: number; // quantidade mínima de entregas noturnas para gerar o alerta (ex.: 10)
}

export type OrgRole = "admin" | "editor" | "viewer";

export interface Organization {
  id: string;
  name: string;
  created_at?: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  email: string;
}

export interface AllowedEmail {
  email: string;
  org_id: string | null;
  role: OrgRole | null;
}

export interface AccessRequest {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  bases: number | null;
  mensagem: string | null;
  status: "pendente" | "aprovado" | "recusado";
  created_at: string;
}

export interface PaymentRule {
  id: string;
  base_id: string;
  driver_id: string | null; // null = regra padrão da base
  bairro: string; // "" = vale para todos os bairros
  amount: number;
  created_at?: string;
}

export interface SpecialDay {
  id: string;
  base_id: string;
  day_date: string | null; // AAAA-MM-DD, exclusivo com weekday
  weekday: number | null; // 0=dom..6=sáb
  amount: number;
  label: string | null;
}

export interface DriverAdjustment {
  id: string;
  base_id: string;
  driver_id: string;
  data: string;
  motivo: string;
  valor: number;
  applied_payout_id: string | null;
}

export interface QrConferenceSession {
  id: string;
  base_id: string;
  label: string;
  items: { code: string; driver: string; checked: boolean }[];
  cursor: number;
  updated_at?: string;
}

export interface Driver {
  id: string;
  base_id: string;
  name: string;
  aliases: string[];
  rate: number | null;
  active: boolean;
  placa: string;
  veiculo: string;
}

export interface DayRecord {
  id: string;
  base_id: string;
  data: string; // ISO date
  meta: number;
  total: number;
  entregues: number;
  problemas: number;
  pendentes: number;
  motoristas: { n: string; t: number; e: number; p: number; q: number; b?: Record<string, number> }[];
  motivos: Record<string, number>;
  salvo_por: string;
  linhas_descartadas?: number;
  coleta_total?: number;
  coleta_feita?: number;
  coleta_falha_bipagem?: number;
  retido_base?: number;
  devolucao?: number;
  com_assinatura?: number;
  sla_ok?: number; // pacotes entregues dentro do SLA (24h), do total com saída e chegada legíveis
  sla_total?: number; // pacotes com saída e chegada legíveis (denominador de sla_ok)
  peso_total?: number; // soma do peso (kg) dos pacotes do dia
  bloqueados?: number; // pacotes com marca de revisão
  divergentes?: number; // pacotes com motorista divergente entre bipagem e carta de porte
  pagamentos?: Record<string, number>; // forma de pagamento -> contagem
  tipos_produto?: Record<string, number>; // tipo de produto -> contagem
  horarios?: Record<string, DriverStats>; // horários por motorista no dia
  carta_ok?: boolean; // false = faltou a Carta de porte: entregues/pendentes do dia não são confiáveis
  bairros?: Record<string, { total: number; e: number; p: number; n: number }>; // estatística por bairro
}

export type OccurrenceStatus = "aberto" | "tratando" | "barrado" | "devolvido" | "resolvido";

export interface Occurrence {
  id?: string;
  base_id: string;
  code: string;
  driver: string;
  motivo: string;
  nota: string;
  responsavel: string;
  resolvido: boolean;
  status?: OccurrenceStatus;
}

export interface PayoutBreakdownRow {
  bairro: string;
  data: string; // AAAA-MM-DD
  entregas: number;
  valorUnit: number;
  origem: "dia_especial" | "bairro" | "motorista" | "sem_valor";
  subtotal: number;
}

export interface PayoutDiscount {
  motivo: string;
  valor: number; // negativo = desconto, positivo = bônus
}

export interface PayoutItem {
  driver: string;
  deliveries: number;
  rate: number;
  gross: number;
  adjustments: number;
  note: string;
  net: number;
  breakdown?: PayoutBreakdownRow[];
  discounts?: PayoutDiscount[];
  pendente?: boolean; // faltam valores definidos p/ algum bairro/dia
}

export interface Payout {
  id: string;
  base_id: string;
  period_start: string;
  period_end: string;
  status: "rascunho" | "conferido" | "fechado";
  items: PayoutItem[];
  created_at: string;
  closed_at?: string | null;
  closed_by?: string | null;
}

export interface Member {
  user_id: string;
  base_id: string;
  role: BaseRole;
  email: string;
}

export type ItemStatus = "e" | "p" | "n"; // entregue, problema, nao entregue

export interface ParcelItem {
  c: string; // code/número do pedido
  drv: string; // driver/entregador (bipagem)
  prob: string; // problema/motivo
  st: ItemStatus; // status
  // Dados operacionais
  base?: string; // base de entrega
  distrito?: string; // bairro/distrito do destinatário
  hr_saida?: string; // horário de saída (pickup)
  hr_chegada?: string; // horário de chegada (delivery)
  tempo_total_min?: number; // tempo total em minutos
  tempo_retencao_min?: number; // tempo de retenção
  tipo_produto?: string; // tipo de produto
  peso?: number; // peso em kg
  assinante?: boolean; // se houve assinatura/comprovante (nunca guarda o nome de quem assinou — LGPD)
  sla_ok?: boolean; // se atendeu o SLA
  sla_horas?: number; // SLA esperado em horas
  retencao?: string; // motivo da retenção na base, quando houver
  responsavelOficial?: string; // motorista responsável segundo a carta de porte, quando disponível
  divergenteMotorista?: boolean; // bipagem e carta de porte apontam motoristas diferentes
  pagamento?: string; // forma de pagamento, quando disponível na carta de porte
  centroFinanceiro?: string; // centro financeiro de entrega
  origem?: string; // origem do pacote (carta de porte) ou "Tipos de Pgto" (bipagem)
  bloqueado?: boolean; // marca de revisão — pacote sinalizado para revisão/bloqueio
  hrProblema?: string; // horário do registro do pacote problemático
  hrDigitacao?: string; // tempo de digitação (carta de porte)
  entregue?: boolean; // chegou de fato (hr_chegada preenchido) — independente da classificação de SLA em `st`
}

export interface DriverAgg {
  nome: string;
  itens: ParcelItem[];
  t: number;
  e: number;
  p: number;
  n: number;
  pct: number;
}

export interface DivergenciaMotorista {
  codigo: string;
  motoristaBipagem: string;
  motoristaResponsavel: string;
}

export interface RetidoInfo {
  codigo: string;
  motorista: string;
  motivo: string;
}

export interface DriverStats {
  saida: string | null; // mediana do horário de saída, "HH:MM"
  primeiraEntrega: string | null;
  ultimaEntrega: string | null;
  entregasPorHora: number;
  saidaAtePrimeiraH: number | null;
  noturnas: number; // entregas depois do limite noturno da base
}

export interface DayResult {
  list: DriverAgg[];
  tot: { t: number; e: number; p: number; n: number; retidoBase: number; devolucao: number; comAssinatura: number };
  motivos: Record<string, number>;
  hasEnt: boolean;
  porBairro: Record<string, Record<string, number>>; // motorista -> bairro -> entregues
  bairroStats: Record<string, { total: number; e: number; p: number; n: number }>; // bairro -> estatística completa
  linhasDescartadas: number; // linhas com hr_saida/hr_chegada preenchidos mas ilegíveis
  divergentes: DivergenciaMotorista[]; // pacotes em que bipagem e carta de porte discordam do motorista
  retidos: RetidoInfo[]; // pacotes com retenção registrada na base
  bloqueados: RetidoInfo[]; // pacotes com marca de revisão (bloqueados para conferência)
  driverStats: Record<string, DriverStats>;
}

export type AlertLevel = "info" | "aviso" | "critico";

export interface Alert {
  id: string;
  tipo: "pendentes" | "retidos" | "bloqueados" | "motorista_divergente" | "inicio_tardio" | "ritmo_atipico" | "taxa_falha" | "entrega_noturna" | "carga_desigual";
  nivel: AlertLevel;
  motorista?: string;
  mensagem: string;
  acao: string;
}

export interface SheetTable {
  headers: string[];
  data: string[][];
  map: Record<string, number>; // cod, ent, prob, base, hr_saida, hr_chegada, tempo_retencao, tipo_produto, peso, assinante
  positional: boolean;
}

export const SCREEN_IDS = [
  "painel",
  "geral",
  "saude",
  "ajustes",
  "entregas",
  "conferencia",
  "qrconf",
  "bases",
  "membros",
  "orgs",
  "auditoria",
  "clientes",
  "parados",
  "pendencias",
  "fechamento",
  "precos",
  "motoristas",
  "alertas",
  "historico",
  "cabine",
  "integracoes",
  "cep",
] as const;
export type ScreenId = (typeof SCREEN_IDS)[number];

export const SCREENS: Record<ScreenId, { label: string; cat: string }> = {
  painel: { label: "Painel da base", cat: "indicadores" },
  geral: { label: "Visão geral das bases", cat: "indicadores" },
  saude: { label: "Saúde e sugestões da base", cat: "indicadores" },
  ajustes: { label: "Dados da base", cat: "infos" },
  entregas: { label: "Monitoramento de bipagem de entrega", cat: "operacao" },
  conferencia: { label: "Conferência de carga", cat: "operacao" },
  qrconf: { label: "Conferência QR", cat: "operacao" },
  bases: { label: "Minhas bases", cat: "gestaobases" },
  membros: { label: "Membros e permissões", cat: "gestaobases" },
  orgs: { label: "Empresa e equipe", cat: "gestaobases" },
  auditoria: { label: "Auditoria e importações", cat: "gestaobases" },
  clientes: { label: "Ocorrências", cat: "clientes" },
  parados: { label: "Pacotes parados (aging)", cat: "clientes" },
  pendencias: { label: "Pendências de hoje", cat: "clientes" },
  fechamento: { label: "Fechamento de pagamento", cat: "financeiro" },
  precos: { label: "Tabela de preços", cat: "financeiro" },
  motoristas: { label: "Motoristas e veículos", cat: "transporte" },
  alertas: { label: "Alertas operacionais", cat: "qualidade" },
  historico: { label: "Histórico e ranking", cat: "indicadores" },
  cabine: { label: "Exportar dados", cat: "cabine" },
  integracoes: { label: "Serviços integrados", cat: "integracoes" },
  cep: { label: "Consulta CEP", cat: "integracoes" },
};

export interface Cat {
  id: string;
  icon: string;
  label: string;
  desc: string;
}

export const CATS: Cat[] = [
  { id: "infos", icon: "🧾", label: "Infos Básicas", desc: "Nome, cidade e meta de entrega da base" },
  { id: "operacao", icon: "📦", label: "Operação", desc: "Importa as planilhas do JMS e monta o painel do dia" },
  { id: "gestaobases", icon: "🏬", label: "Gestão de Bases", desc: "Bases cadastradas — criar e trocar entre elas" },
  { id: "clientes", icon: "👥", label: "Clientes", desc: "Pacotes com problema e o que já foi tratado" },
  { id: "financeiro", icon: "💰", label: "Financeiro", desc: "Fechamento de pagamento por motorista" },
  { id: "transporte", icon: "🛵", label: "Transporte", desc: "Motoristas, placas e veículos cadastrados" },
  { id: "qualidade", icon: "🛡️", label: "Qualidade de Serviço", desc: "Motoristas abaixo do alerta de SLA hoje" },
  { id: "indicadores", icon: "📈", label: "Indicadores de Negócio", desc: "Evolução dos dias salvos e ranking de motoristas" },
  { id: "cabine", icon: "🗄️", label: "Cabine de Dados", desc: "Exportação dos dados brutos em CSV" },
  { id: "integracoes", icon: "🔗", label: "Serviços Integrados", desc: "Endereço do webhook e payload de exemplo" },
];

export const childrenOf = (catId: string): ScreenId[] =>
  SCREEN_IDS.filter((id) => SCREENS[id].cat === catId);
