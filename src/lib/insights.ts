import type { Base, DayRecord } from "./types";

export type Farol = "verde" | "amarelo" | "vermelho" | "sem_dados";
export type Tendencia = "subindo" | "estavel" | "caindo";
export type Nivel = "critico" | "aviso" | "info";
export type Area = "dados" | "entrega" | "motoristas" | "rotas" | "coleta" | "qualidade";

export interface Insight {
  id: string;
  area: Area;
  nivel: Nivel;
  titulo: string;
  detalhe: string; // os números por trás da sugestão
  acao?: string; // o que fazer
}

export interface Indicador {
  chave: string;
  rotulo: string;
  valor: number | null;
  alvo: string;
  farol: Farol;
}

export interface MotoristaRow {
  nome: string;
  t: number;
  e: number;
  pct: number;
  dias: number;
  diasAbaixo: number;
  porDia: number;
  farol: Farol;
}

export interface BairroRow {
  nome: string;
  total: number;
  pct: number;
  melhor: string | null;
  farol: Farol;
}

export interface SaudeBase {
  farol: Farol;
  tendencia: Tendencia | null;
  veredito: string;
  pct: number | null;
  pctAnterior: number | null;
  delta: number | null;
  total: number;
  entregues: number;
  dias: number;
  diasSemCarta: number;
  indicadores: Indicador[];
  insights: Insight[];
  prioridades: Insight[];
  motoristas: MotoristaRow[];
  bairros: BairroRow[];
}

// Limites usados quando o cliente não ajusta nada (a meta e o alerta da entrega são sempre os da base).
export const LIMITES = {
  sla: { verde: 0.9, amarelo: 0.8 },
  coleta: { verde: 0.95, amarelo: 0.9 },
  problemas: { verde: 0.03, amarelo: 0.06 }, // quanto menor, melhor
  retidos: 0.03,
  devolucao: 0.03,
  minPacotesMotorista: 20,
  minPacotesBairro: 15,
  minDiasRecorrente: 3,
};

export const classificar = (pct: number | null, meta: number, alerta: number): Farol =>
  pct == null ? "sem_dados" : pct >= meta ? "verde" : pct >= alerta ? "amarelo" : "vermelho";

export const tendenciaDe = (delta: number | null): Tendencia | null =>
  delta == null ? null : delta >= 0.005 ? "subindo" : delta <= -0.005 ? "caindo" : "estavel";

export function vereditoDe(farol: Farol, t: Tendencia | null): string {
  if (farol === "sem_dados") return "Sem dados suficientes para avaliar";
  if (farol === "verde") return t === "caindo" ? "No verde, mas em queda: vale ficar de olho" : "No verde e no caminho certo";
  if (farol === "amarelo") return t === "subindo" ? "Abaixo da meta, mas melhorando" : t === "caindo" ? "Abaixo da meta e piorando" : "Abaixo da meta, sem melhora";
  return t === "subindo" ? "Crítico, mas começando a reagir" : "Crítico: precisa de ação agora";
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const pctTxt = (v: number) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const nTxt = (v: number) => v.toLocaleString("pt-BR");
const lowerFarol = (v: number | null, l: { verde: number; amarelo: number }): Farol =>
  v == null ? "sem_dados" : v <= l.verde ? "verde" : v <= l.amarelo ? "amarelo" : "vermelho";
const upperFarol = (v: number | null, l: { verde: number; amarelo: number }): Farol =>
  v == null ? "sem_dados" : v >= l.verde ? "verde" : v >= l.amarelo ? "amarelo" : "vermelho";

const shiftDay = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const ADVICE: { re: RegExp; acao: string }[] = [
  { re: /sem motivo/i, acao: "Peça aos motoristas que registrem o motivo na bipagem; sem motivo não dá para saber o que melhorar." },
  { re: /ausen|ninguem|ninguém|destinat|nao encontrad|não encontrad/i, acao: "Avise o cliente antes da saída (WhatsApp ou ligação), combine uma janela de entrega e reagende a visita no mesmo dia quando der." },
  { re: /endere|cep|incomplet|incorret|local/i, acao: "Valide endereço e CEP na triagem e peça o complemento ao remetente antes de sair para a rota." },
  { re: /recus/i, acao: "Alinhe com o remetente os motivos de recusa e a política de devolução; registre observação na bipagem." },
  { re: /fechad|estabelec|comerc/i, acao: "Programe esses endereços para o horário comercial, no início da rota." },
  { re: /avaria|danific|violad/i, acao: "Revise o manuseio e o empilhamento da carga e registre fotos na saída." },
  { re: /extravi|perd|falt/i, acao: "Reforce a conferência de carga na saída e na volta (Conferência QR)." },
];
const adviceFor = (motivo: string) => ADVICE.find((a) => a.re.test(motivo))?.acao || "Veja com o motorista os casos mais frequentes e registre o motivo com mais detalhe.";

interface Agg { t: number; e: number; p: number }
const agg = (rows: DayRecord[]): Agg => ({ t: sum(rows.map((r) => r.total)), e: sum(rows.map((r) => r.entregues)), p: sum(rows.map((r) => r.problemas)) });

// Saúde de uma base num período (em dias) comparada ao período imediatamente anterior.
export function analisarBase(days: DayRecord[], base: Partial<Base>, periodo: number, hoje: string): SaudeBase {
  const meta = (base.meta ?? 95) / 100;
  const alerta = (base.alerta ?? 70) / 100;
  const ini = shiftDay(hoje, -(periodo - 1));
  const iniAnt = shiftDay(hoje, -(2 * periodo - 1));
  const cur = days.filter((d) => d.data >= ini && d.data <= hoje);
  const prev = days.filter((d) => d.data >= iniAnt && d.data < ini);
  const ok = cur.filter((d) => d.carta_ok !== false);
  const okPrev = prev.filter((d) => d.carta_ok !== false);
  const semCarta = cur.length - ok.length;

  const a = agg(ok);
  const pct = ratio(a.e, a.t);
  const ap = agg(okPrev);
  const pctAnterior = ratio(ap.e, ap.t);
  const delta = pct != null && pctAnterior != null ? pct - pctAnterior : null;
  const tendencia = tendenciaDe(delta);
  const farol = classificar(pct, meta, alerta);

  const slaV = ratio(sum(ok.map((d) => d.sla_ok || 0)), sum(ok.map((d) => d.sla_total || 0)));
  const colV = ratio(sum(cur.map((d) => d.coleta_feita || 0)), sum(cur.map((d) => d.coleta_total || 0)));
  const probV = ratio(a.p, a.t);
  const indicadores: Indicador[] = [
    { chave: "entrega", rotulo: "Entregas", valor: pct, alvo: `meta ${pctTxt(meta)}`, farol },
    { chave: "prazo", rotulo: "No prazo (SLA)", valor: slaV, alvo: `meta ${pctTxt(LIMITES.sla.verde)}`, farol: upperFarol(slaV, LIMITES.sla) },
    { chave: "coleta", rotulo: "Coletas feitas", valor: colV, alvo: `meta ${pctTxt(LIMITES.coleta.verde)}`, farol: upperFarol(colV, LIMITES.coleta) },
    { chave: "problemas", rotulo: "Pacotes com problema", valor: probV, alvo: `até ${pctTxt(LIMITES.problemas.verde)}`, farol: lowerFarol(probV, LIMITES.problemas) },
  ];

  const insights: Insight[] = [];
  const add = (i: Insight) => insights.push(i);

  // ── Dados
  if (!cur.length) {
    add({ id: "sem-dias", area: "dados", nivel: "aviso", titulo: "Nenhum dia salvo no período", detalhe: `Não há dias salvos nos últimos ${periodo} dias.`, acao: "Importe as planilhas do JMS (Monitoramento de bipagem e Carta de porte) para a análise começar." });
  } else if (semCarta > 0) {
    add({
      id: "sem-carta",
      area: "dados",
      nivel: ok.length ? "aviso" : "critico",
      titulo: `Falta o número de entregas em ${semCarta} de ${cur.length} dia${cur.length === 1 ? "" : "s"}`,
      detalhe: "Sem a Carta de porte não há como confirmar o que foi entregue, então esses dias ficam fora do cálculo de entregas, pagamento e farol.",
      acao: "Importe a Carta de porte desses dias (Operação) e salve o dia de novo. Enquanto isso, a análise quantitativa e qualitativa fica incompleta.",
    });
  }
  const ultimo = days.length ? days[days.length - 1].data : null;
  const stale = base.stale_days ?? 3;
  if (ultimo) {
    const idle = Math.round((new Date(hoje + "T12:00:00").getTime() - new Date(ultimo + "T12:00:00").getTime()) / 86400000);
    if (idle > stale) add({ id: "parada", area: "dados", nivel: "aviso", titulo: `Sem dia salvo há ${idle} dias`, detalhe: `O último dia salvo foi ${ultimo.split("-").reverse().join("/")}.`, acao: "Salve o dia todos os dias para o farol refletir a operação de verdade." });
  }

  // ── Entrega
  if (pct != null && a.t > 0) {
    if (pct < meta) {
      const faltam = Math.max(0, Math.ceil(meta * a.t - 1e-9) - a.e);
      add({
        id: "meta",
        area: "entrega",
        nivel: pct < alerta ? "critico" : "aviso",
        titulo: `Entrega em ${pctTxt(pct)}, abaixo da meta de ${pctTxt(meta)}`,
        detalhe: `Faltaram ${nTxt(faltam)} entregas no período para bater a meta (${nTxt(a.e)} de ${nTxt(a.t)} pacotes).`,
        acao: "Ataque primeiro os motivos de problema mais frequentes e os motoristas/bairros abaixo do alerta, listados abaixo.",
      });
    }
    if (tendencia === "caindo" && delta != null) {
      add({ id: "queda", area: "entrega", nivel: "aviso", titulo: "A entrega está caindo", detalhe: `${pctTxt(pct)} agora contra ${pctTxt(pctAnterior!)} no período anterior (${(delta * 100).toFixed(1).replace(".", ",")} p.p.).`, acao: "Compare com o que mudou nesse tempo: motoristas, rotas, volume ou motivos de problema." });
    } else if (tendencia === "subindo" && delta != null && pct < meta) {
      add({ id: "subida", area: "entrega", nivel: "info", titulo: "A entrega está melhorando", detalhe: `${pctTxt(pct)} agora contra ${pctTxt(pctAnterior!)} no período anterior.`, acao: "Mantenha o que está funcionando; ainda falta chegar à meta." });
    }
  }

  // ── Motivos de problema
  const motivos: Record<string, number> = {};
  for (const d of ok) for (const [k, v] of Object.entries(d.motivos || {})) motivos[k] = (motivos[k] || 0) + v;
  const totalMot = sum(Object.values(motivos));
  if (totalMot > 0) {
    const top = Object.entries(motivos).sort((x, y) => y[1] - x[1]).slice(0, 3);
    top.forEach(([m, v], i) => {
      const share = v / totalMot;
      if (i > 0 && share < 0.15) return;
      add({
        id: `motivo-${i}`,
        area: "qualidade",
        nivel: i === 0 && share >= 0.3 && (probV ?? 0) > LIMITES.problemas.verde ? "aviso" : "info",
        titulo: `Problema nº ${i + 1}: “${m}”`,
        detalhe: `${nTxt(v)} casos, ${pctTxt(share)} de todos os problemas do período.`,
        acao: adviceFor(m),
      });
    });
  }

  // ── Motoristas
  const mm = new Map<string, { t: number; e: number; dias: number; abaixo: number }>();
  for (const d of ok) {
    for (const m of d.motoristas || []) {
      const x = mm.get(m.n) || { t: 0, e: 0, dias: 0, abaixo: 0 };
      x.t += m.t; x.e += m.e; x.dias += 1;
      if (m.t >= 5 && m.e / m.t < alerta) x.abaixo += 1;
      mm.set(m.n, x);
    }
  }
  const motoristas: MotoristaRow[] = [...mm.entries()]
    .map(([nome, x]) => {
      const p = x.t ? x.e / x.t : 0;
      return { nome, t: x.t, e: x.e, pct: p, dias: x.dias, diasAbaixo: x.abaixo, porDia: x.dias ? x.t / x.dias : 0, farol: classificar(x.t ? p : null, meta, alerta) };
    })
    .sort((x, y) => x.pct - y.pct);
  const fortes = motoristas.filter((m) => m.t >= LIMITES.minPacotesMotorista && m.pct >= meta).sort((x, y) => y.pct - x.pct);
  const nomes = (l: MotoristaRow[]) => l.slice(0, 2).map((m) => m.nome).join(" e ");
  for (const m of motoristas.filter((x) => x.t >= LIMITES.minPacotesMotorista && x.pct < alerta).slice(0, 3)) {
    const recorrente = m.diasAbaixo >= LIMITES.minDiasRecorrente;
    add({
      id: `drv-${m.nome}`,
      area: "motoristas",
      nivel: recorrente ? "critico" : "aviso",
      titulo: `${m.nome} entregou ${pctTxt(m.pct)}${recorrente ? `, abaixo do alerta em ${m.diasAbaixo} dias` : ""}`,
      detalhe: `${nTxt(m.e)} de ${nTxt(m.t)} pacotes em ${m.dias} dia${m.dias === 1 ? "" : "s"}; alerta da base: ${pctTxt(alerta)}.`,
      acao: fortes.length
        ? `Converse com ele sobre os motivos e acompanhe de perto. Se continuar, passe parte da rota para quem está acima da meta (${nomes(fortes)}).`
        : "Converse com ele sobre os motivos e acompanhe de perto; avalie rever a rota ou a carga dele.",
    });
  }
  const comVolume = motoristas.filter((m) => m.dias >= 1 && m.t >= LIMITES.minPacotesMotorista);
  if (comVolume.length >= 3) {
    const sorted = comVolume.map((m) => m.porDia).sort((x, y) => x - y);
    const mediana = sorted[Math.floor(sorted.length / 2)];
    const lo = base.carga_desigual_min ?? 0.6;
    const hi = base.carga_desigual_max ?? 1.4;
    const pesados = comVolume.filter((m) => m.porDia > mediana * hi).sort((x, y) => y.porDia - x.porDia);
    const leves = comVolume.filter((m) => m.porDia < mediana * lo && m.pct >= alerta).sort((x, y) => x.porDia - y.porDia);
    if (pesados.length && leves.length) {
      add({
        id: "carga",
        area: "motoristas",
        nivel: "aviso",
        titulo: "Carga desigual entre os motoristas",
        detalhe: `${pesados[0].nome} leva ${nTxt(Math.round(pesados[0].porDia))} pacotes por dia; a mediana da base é ${nTxt(Math.round(mediana))}; ${leves[0].nome} leva ${nTxt(Math.round(leves[0].porDia))}.`,
        acao: `Redistribua parte da carga de ${pesados[0].nome} para ${leves[0].nome}${leves[1] ? ` ou ${leves[1].nome}` : ""}, que levam bem menos pacotes e estão acima do alerta. Confirme antes se eles têm disponibilidade.`,
      });
    }
  }
  if (fortes.length) {
    add({ id: "fortes", area: "motoristas", nivel: "info", titulo: `Melhores resultados: ${nomes(fortes)}`, detalhe: fortes.slice(0, 2).map((m) => `${m.nome} ${pctTxt(m.pct)} (${nTxt(m.t)} pacotes)`).join(" · "), acao: "Bons candidatos para pegar as rotas mais difíceis e para apoiar quem está abaixo da meta." });
  }

  // ── Rotas / bairros
  const bm = new Map<string, { total: number; e: number; p: number; porMot: Map<string, number> }>();
  let comBairros = 0;
  for (const d of ok) {
    if (!d.bairros) continue;
    comBairros++;
    for (const [nome, v] of Object.entries(d.bairros)) {
      const x = bm.get(nome) || { total: 0, e: 0, p: 0, porMot: new Map() };
      x.total += v.total; x.e += v.e; x.p += v.p;
      bm.set(nome, x);
    }
    for (const m of d.motoristas || []) {
      for (const [nome, q] of Object.entries(m.b || {})) {
        const x = bm.get(nome);
        if (x) x.porMot.set(m.n, (x.porMot.get(m.n) || 0) + q);
      }
    }
  }
  const bairros: BairroRow[] = [...bm.entries()]
    .map(([nome, x]) => {
      let melhor: string | null = null;
      let mq = 0;
      for (const [n, q] of x.porMot) if (q > mq) { melhor = n; mq = q; }
      const p = x.total ? x.e / x.total : 0;
      return { nome, total: x.total, pct: p, melhor, farol: classificar(x.total ? p : null, meta, alerta) };
    })
    .sort((x, y) => y.total * (1 - y.pct) - x.total * (1 - x.pct));
  for (const b of bairros.filter((x) => x.total >= LIMITES.minPacotesBairro && x.pct < alerta).slice(0, 3)) {
    add({
      id: `bairro-${b.nome}`,
      area: "rotas",
      nivel: "aviso",
      titulo: `Bairro crítico: ${b.nome} (${pctTxt(b.pct)})`,
      detalhe: `${nTxt(b.total)} pacotes no período, abaixo do alerta de ${pctTxt(alerta)}.`,
      acao: `Revise a rota deste bairro${b.melhor ? `; ${b.melhor} é quem mais entrega lá, considere deixá-lo(a) responsável` : ""}. Se o problema for acesso ou endereço, trate com o remetente.`,
    });
  }
  if (ok.length && !comBairros) {
    add({
      id: "sem-bairros",
      area: "rotas",
      nivel: "info",
      titulo: "Análise de rotas por bairro indisponível",
      detalhe: "Os relatórios importados não trazem o bairro/distrito do destinatário.",
      acao: "Se o JMS tiver um relatório com o distrito do destinatário, importe-o junto: a análise de rotas e bairros críticos aparece sozinha.",
    });
  }

  // ── Coleta
  const colT = sum(cur.map((d) => d.coleta_total || 0));
  if (colT > 0 && colV != null) {
    const falha = sum(cur.map((d) => d.coleta_falha_bipagem || 0));
    if (colV < LIMITES.coleta.verde) {
      add({ id: "coleta", area: "coleta", nivel: colV < LIMITES.coleta.amarelo ? "critico" : "aviso", titulo: `Coleta em ${pctTxt(colV)}, abaixo de ${pctTxt(LIMITES.coleta.verde)}`, detalhe: `${nTxt(sum(cur.map((d) => d.coleta_feita || 0)))} de ${nTxt(colT)} coletas concluídas.`, acao: "Veja quais clientes ficaram sem coleta, ajuste o horário/rota de coleta e confirme a bipagem na saída do cliente." });
    }
    if (falha / colT > 0.03) {
      add({ id: "coleta-bip", area: "coleta", nivel: "aviso", titulo: "Muitas falhas de bipagem na coleta", detalhe: `${nTxt(falha)} falhas em ${nTxt(colT)} coletas (${pctTxt(falha / colT)}).`, acao: "Treine a bipagem na coleta e confira o estado dos coletores." });
    }
  }

  // ── Prazo, retidos, devolução
  if (slaV != null && slaV < LIMITES.sla.verde) {
    add({ id: "sla", area: "qualidade", nivel: slaV < LIMITES.sla.amarelo ? "critico" : "aviso", titulo: `Só ${pctTxt(slaV)} dos pacotes dentro do prazo de 24h`, detalhe: `Meta de prazo: ${pctTxt(LIMITES.sla.verde)}.`, acao: "Antecipe a saída das rotas e reduza o tempo que o pacote fica parado na base antes de sair." });
  }
  const ret = ratio(sum(ok.map((d) => d.retido_base || 0)), a.t);
  if (ret != null && ret > LIMITES.retidos) {
    add({ id: "retidos", area: "qualidade", nivel: "aviso", titulo: `${pctTxt(ret)} dos pacotes ficaram retidos na base`, detalhe: `${nTxt(sum(ok.map((d) => d.retido_base || 0)))} pacotes sem saída para rota.`, acao: "Revise o planejamento de saída: distribua o excedente entre os motoristas ou inclua mais uma rota." });
  }
  const dev = ratio(sum(ok.map((d) => d.devolucao || 0)), a.t);
  if (dev != null && dev > LIMITES.devolucao) {
    add({ id: "devolucao", area: "qualidade", nivel: "aviso", titulo: `${pctTxt(dev)} dos pacotes em devolução`, detalhe: `${nTxt(sum(ok.map((d) => d.devolucao || 0)))} pacotes.`, acao: "Veja os motivos de devolução mais comuns e converse com os remetentes de maior volume." });
  }

  const ordem: Record<Nivel, number> = { critico: 0, aviso: 1, info: 2 };
  insights.sort((x, y) => ordem[x.nivel] - ordem[y.nivel]);
  const prioridades = insights.filter((i) => i.nivel !== "info").slice(0, 3);

  return {
    farol,
    tendencia,
    veredito: vereditoDe(farol, tendencia),
    pct,
    pctAnterior,
    delta,
    total: a.t,
    entregues: a.e,
    dias: cur.length,
    diasSemCarta: semCarta,
    indicadores,
    insights,
    prioridades,
    motoristas,
    bairros,
  };
}
