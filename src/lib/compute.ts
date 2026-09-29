import { norm } from "./format";
import { cleanText } from "./parse";
import type { Alert, AlertLevel, Base, DayResult, DivergenciaMotorista, DriverStats, Driver, DriverAgg, ItemStatus, ParcelItem, RetidoInfo, SheetTable } from "./types";

export const mae = (c: string) => String(c).trim().split("-")[0].trim();

const TRIVIAL = new Set(["", "sim", "s", "x", "1", "true", "yes", "-"]);

export function buildAliasIndex(drivers: Driver[]): Map<string, Driver> {
  const idx = new Map<string, Driver>();
  for (const d of drivers) {
    idx.set(norm(d.name), d);
    for (const a of d.aliases || []) idx.set(norm(a), d);
  }
  return idx;
}

// O JMS exporta o nome do motorista com o prefixo da base e em caixa mista
// (ex.: "F SAM - Ednilson pereira pinho"). Removemos o prefixo e padronizamos o Title Case
// antes de procurar o motorista cadastrado, senão o mesmo motorista vira "vários" na lista.
function stripBasePrefix(name: string): string {
  return name.replace(/^F\s+[A-Z0-9]{2,8}(?:-[A-Z0-9]{2,8})?\s*-\s*/i, "").trim();
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function canonicalDriver(rawName: string, aliasIdx: Map<string, Driver>): string {
  const cleaned = stripBasePrefix((rawName || "Sem motorista").trim());
  const n = norm(cleaned);
  const hit = aliasIdx.get(n);
  return hit ? hit.name : titleCase(cleaned || "Sem motorista");
}

// Parse data/hora em múltiplos formatos: ISO, DD/MM/AAAA[ HH:mm[:ss]], e serial do Excel
// (o JMS às vezes exporta a data como número de dias desde 1899-12-30, ou como texto BR).
export function parseDateTime(s: string | number | null | undefined): Date | null {
  if (s == null || s === "") return null;

  if (typeof s === "number" || /^\d+(\.\d+)?$/.test(String(s).trim())) {
    const n = typeof s === "number" ? s : parseFloat(String(s));
    // faixa plausível de serial do Excel (ano ~1950 a ~2100)
    if (n > 18000 && n < 73000) {
      // O serial do Excel é "horário de parede" (sem fuso). Ancorar em Date.UTC() e depois
      // ler com getHours()/getMinutes() (locais) desloca a hora pelo fuso do navegador
      // (ex.: -3h em Brasília). Lemos os componentes em UTC e reconstruímos como hora local.
      const epoch = Date.UTC(1899, 11, 30);
      const u = new Date(epoch + Math.round(n * 86400000));
      if (isNaN(u.getTime())) return null;
      const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const str = String(s).trim();
  if (!str) return null;

  // DD/MM/AAAA[ HH:mm[:ss]]
  const br = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    let [, dd, mm, yy, hh, min, ss] = br;
    if (yy.length === 2) yy = "20" + yy;
    const d = new Date(
      Number(yy),
      Number(mm) - 1,
      Number(dd),
      hh ? Number(hh) : 0,
      min ? Number(min) : 0,
      ss ? Number(ss) : 0
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO (AAAA-MM-DD[THH:mm:ss]) e qualquer formato que o motor de Date entenda nativamente
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

export function recompute(
  base: SheetTable | null,
  ent: SheetTable | null,
  aliasIdx: Map<string, Driver>,
  expurgarInsucessos = false
): DayResult | null {
  if (!base || base.map.cod < 0 || base.map.ent < 0) return null;

  // Marcação de entregues confirmadas (de segunda planilha)
  const entSet = new Set<string>();
  if (ent && ent.map.cod >= 0) {
    for (const r of ent.data) {
      const c = r[ent.map.cod];
      if (c) entSet.add(mae(c));
    }
  }

  // A carta de porte (segunda planilha) traz o motorista responsável oficial, a forma de
  // pagamento e o centro financeiro — dados que a bipagem sozinha não tem.
  const entExtra = new Map<string, { responsavel?: string; pagamento?: string; centroFinanceiro?: string; statusCarta?: string; origem?: string; bloqueado?: boolean; hrDigitacao?: string }>();
  if (ent && ent.map.cod >= 0) {
    for (const r of ent.data) {
      const raw = r[ent.map.cod];
      if (!raw) continue;
      const c = mae(raw);
      if (!c) continue;
      const responsavel = ent.map.responsavel >= 0 ? canonicalDriver((r[ent.map.responsavel] || "").trim(), aliasIdx) : undefined;
      const pagamento = ent.map.pagamento >= 0 ? cleanText(r[ent.map.pagamento]) : undefined;
      const centroFinanceiro = ent.map.centro_financeiro >= 0 ? (r[ent.map.centro_financeiro] || "").trim() : undefined;
      const statusCarta = ent.map.status_carta >= 0 ? (r[ent.map.status_carta] || "").trim() : undefined;
      const origem = ent.map.origem >= 0 ? (r[ent.map.origem] || "").trim() : undefined;
      const bloqueado = ent.map.bloqueado >= 0 ? !!(r[ent.map.bloqueado] || "").trim() : undefined;
      const hrDigitacao = ent.map.hr_digitacao >= 0 ? (r[ent.map.hr_digitacao] || "").trim() : undefined;
      if (!entExtra.has(c) && (responsavel || pagamento || centroFinanceiro || statusCarta || origem || bloqueado || hrDigitacao))
        entExtra.set(c, { responsavel, pagamento, centroFinanceiro, statusCarta, origem, bloqueado, hrDigitacao });
    }
  }

  // SLA padrão: 24 horas para maioria das operações
  const SLA_HORAS = 24;

  const seen = new Map<string, {
    c: string;
    drv: string;
    prob: string;
    base?: string;
    distrito?: string;
    hr_saida?: string;
    hr_chegada?: string;
    tempo_retencao?: string;
    retencao?: string;
    tipo_produto?: string;
    peso?: string;
    assinante?: string;
    origem?: string;
    bloqueado?: boolean;
    hr_problema?: string;
    hr_digitacao?: string;
  }>();

  let linhasDescartadas = 0;

  for (const r of base.data) {
    const raw = r[base.map.cod];
    if (!raw) continue;
    const c = mae(raw);
    if (!c || !/\d/.test(c)) continue;

    const drv = canonicalDriver((r[base.map.ent] || "Sem motorista").trim(), aliasIdx);
    const prob = base.map.prob >= 0 ? cleanText(r[base.map.prob]) : "";
    const base_name = base.map.base >= 0 ? (r[base.map.base] || "").trim() : "";
    const distrito = base.map.distrito >= 0 ? (r[base.map.distrito] || "").trim() : "";
    const hr_saida = base.map.hr_saida >= 0 ? (r[base.map.hr_saida] || "").trim() : "";
    const hr_chegada = base.map.hr_chegada >= 0 ? (r[base.map.hr_chegada] || "").trim() : "";
    const tempo_ret = base.map.tempo_retencao >= 0 ? (r[base.map.tempo_retencao] || "").trim() : "";
    const retencao_txt = base.map.retencao >= 0 ? cleanText(r[base.map.retencao]) : "";
    const tipo_prod = base.map.tipo_produto >= 0 ? (r[base.map.tipo_produto] || "").trim() : "";
    const peso_val = base.map.peso >= 0 ? (r[base.map.peso] || "").trim() : "";
    // Assinante: só usamos a coluna para saber SE houve assinatura — o nome de quem
    // assinou nunca é guardado no item (LGPD), por isso vira "sim"/"" aqui mesmo.
    const assinante = base.map.assinante >= 0 && (r[base.map.assinante] || "").trim() ? "sim" : "";
    const origem_val = base.map.origem >= 0 ? (r[base.map.origem] || "").trim() : "";
    const bloqueado_val = base.map.bloqueado >= 0 ? !!(r[base.map.bloqueado] || "").trim() : false;
    const hr_problema = base.map.hr_problema >= 0 ? (r[base.map.hr_problema] || "").trim() : "";
    const hr_digitacao = base.map.hr_digitacao >= 0 ? (r[base.map.hr_digitacao] || "").trim() : "";

    if ((hr_saida && !parseDateTime(hr_saida)) || (hr_chegada && !parseDateTime(hr_chegada))) linhasDescartadas++;

    if (!seen.has(c)) {
      seen.set(c, {
        c,
        drv,
        prob,
        base: base_name,
        distrito,
        hr_saida,
        hr_chegada,
        tempo_retencao: tempo_ret,
        retencao: retencao_txt,
        tipo_produto: tipo_prod,
        peso: peso_val,
        assinante,
        origem: origem_val,
        bloqueado: bloqueado_val,
        hr_problema,
        hr_digitacao,
      });
    } else {
      const ex = seen.get(c)!;
      if (prob && !ex.prob) ex.prob = prob;
      if (base_name && !ex.base) ex.base = base_name;
      if (distrito && !ex.distrito) ex.distrito = distrito;
      if (hr_saida && !ex.hr_saida) ex.hr_saida = hr_saida;
      if (hr_chegada && !ex.hr_chegada) ex.hr_chegada = hr_chegada;
      if (retencao_txt && !ex.retencao) ex.retencao = retencao_txt;
      if (origem_val && !ex.origem) ex.origem = origem_val;
      if (bloqueado_val) ex.bloqueado = true;
      if (hr_problema && !ex.hr_problema) ex.hr_problema = hr_problema;
      if (hr_digitacao && !ex.hr_digitacao) ex.hr_digitacao = hr_digitacao;
    }
  }

  const drivers = new Map<string, DriverAgg & { itens: ParcelItem[] }>();
  const motivos: Record<string, number> = {};
  const divergentes: DivergenciaMotorista[] = [];
  const retidos: RetidoInfo[] = [];
  const bloqueados: RetidoInfo[] = [];
  let retidoBase = 0;
  let devolucao = 0;
  let comAssinatura = 0;

  for (const p of seen.values()) {
    // Calcular SLA: comparar hr_chegada com hr_saida
    let sla_ok = false;
    let tempo_total_min = 0;

    if (p.hr_saida && p.hr_chegada) {
      const saida = parseDateTime(p.hr_saida);
      const chegada = parseDateTime(p.hr_chegada);
      if (saida && chegada && chegada >= saida) {
        tempo_total_min = Math.round((chegada.getTime() - saida.getTime()) / (1000 * 60));
        sla_ok = tempo_total_min <= SLA_HORAS * 60;
      }
    }

    // Determinar status: entregue no SLA = "e", com problema = "p", não entregue = "n"
    let st: ItemStatus = "n";
    if (entSet.has(p.c)) {
      st = sla_ok || !p.hr_saida || !p.hr_chegada ? "e" : "p"; // Entregue, verifica SLA se dados disponíveis
    } else if (p.prob) {
      st = "p"; // Tem problema
    }

    const extra = entExtra.get(p.c);
    const divergenteMotorista = !!(extra?.responsavel && extra.responsavel !== p.drv);
    if (divergenteMotorista) divergentes.push({ codigo: p.c, motoristaBipagem: p.drv, motoristaResponsavel: extra!.responsavel! });

    const retido = !!p.retencao || !!p.tempo_retencao;
    if (retido) retidos.push({ codigo: p.c, motorista: p.drv, motivo: p.retencao || "Retenção registrada" });

    const bloqueado = !!p.bloqueado || !!extra?.bloqueado;
    if (bloqueado) bloqueados.push({ codigo: p.c, motorista: p.drv, motivo: "Marca de revisão" });

    const item: ParcelItem = {
      c: p.c,
      drv: p.drv,
      prob: p.prob,
      st,
      base: p.base,
      distrito: p.distrito,
      hr_saida: p.hr_saida,
      hr_chegada: p.hr_chegada,
      tempo_total_min,
      tipo_produto: p.tipo_produto,
      peso: p.peso ? parseFloat(p.peso) : undefined,
      assinante: !!p.assinante,
      sla_ok,
      sla_horas: SLA_HORAS,
      retencao: p.retencao || undefined,
      responsavelOficial: extra?.responsavel,
      divergenteMotorista,
      pagamento: extra?.pagamento,
      centroFinanceiro: extra?.centroFinanceiro,
      origem: p.origem || extra?.origem,
      bloqueado: !!p.bloqueado || !!extra?.bloqueado,
      hrProblema: p.hr_problema || undefined,
      hrDigitacao: p.hr_digitacao || extra?.hrDigitacao,
      entregue: !!p.hr_chegada,
    };

    if (st === "n" && !p.hr_saida) retidoBase++;
    if (/devol/i.test(p.prob)) devolucao++;
    if (st === "e" && p.assinante) comAssinatura++;

    if (!drivers.has(p.drv))
      drivers.set(p.drv, { nome: p.drv, itens: [], t: 0, e: 0, p: 0, n: 0, pct: 0 });

    const d = drivers.get(p.drv)!;
    d.itens.push(item);
    d.t++;
    (d as unknown as Record<string, number>)[st]++;

    if (st === "p") {
      const m = TRIVIAL.has(norm(p.prob)) ? "Sem motivo informado" : p.prob;
      motivos[m] = (motivos[m] || 0) + 1;
    }
  }

  const list = [...drivers.values()].map((d) => {
    const denom = expurgarInsucessos ? d.t - d.p : d.t;
    return { ...d, pct: denom > 0 ? d.e / denom : 0 };
  });
  const totBase = list.reduce(
    (a, d) => ({ t: a.t + d.t, e: a.e + d.e, p: a.p + d.p, n: a.n + d.n }),
    { t: 0, e: 0, p: 0, n: 0 }
  );
  const tot = { ...totBase, retidoBase, devolucao, comAssinatura };

  const porBairro: Record<string, Record<string, number>> = {};
  for (const d of list) {
    const byB: Record<string, number> = {};
    for (const it of d.itens) {
      // `entregue` (chegou de fato) em vez de `st === "e"`, senão uma entrega fora do SLA
      // some do ranking por bairro mesmo tendo sido concluída.
      if (!it.entregue) continue;
      const b = it.distrito || "Sem bairro";
      byB[b] = (byB[b] || 0) + 1;
    }
    porBairro[d.nome] = byB;
  }

  // Estatística por bairro (todos os status, não só entregues) — dá o denominador certo
  // para calcular a % de entrega no prazo por bairro, e não só a contagem de entregues.
  const bairroStats: Record<string, { total: number; e: number; p: number; n: number }> = {};
  for (const d of list) {
    for (const it of d.itens) {
      if (!it.distrito) continue; // sem bairro identificado, não entra na estatística geográfica
      const b = it.distrito;
      if (!bairroStats[b]) bairroStats[b] = { total: 0, e: 0, p: 0, n: 0 };
      const bs = bairroStats[b];
      bs.total++;
      (bs as unknown as Record<string, number>)[it.st]++;
    }
  }

  // Estatísticas de horário/ritmo por motorista, usadas pelos alertas de início tardio,
  // ritmo atípico e entrega noturna, e pela tela de fechamento do motorista.
  const driverStats: Record<string, DriverStats> = {};
  for (const d of list) {
    const saidaTimes = d.itens.map((it) => (it.hr_saida ? parseDateTime(it.hr_saida) : null)).filter((x): x is Date => !!x);
    const entregues = d.itens.filter((it) => it.st === "e" && it.hr_chegada);
    const chegadaTimes = entregues.map((it) => parseDateTime(it.hr_chegada!)).filter((x): x is Date => !!x);
    const saidaMed = median(saidaTimes.map((x) => x.getTime()));
    const primeira = chegadaTimes.length ? Math.min(...chegadaTimes.map((x) => x.getTime())) : null;
    const ultima = chegadaTimes.length ? Math.max(...chegadaTimes.map((x) => x.getTime())) : null;
    const horas = primeira != null && ultima != null && ultima > primeira ? (ultima - primeira) / 3600000 : null;
    const entregasPorHora = horas && horas > 0 ? chegadaTimes.length / horas : 0;
    const saidaAtePrimeiraH = saidaMed != null && primeira != null ? Math.max(0, (primeira - saidaMed) / 3600000) : null;
    const noturnas = chegadaTimes.filter((x) => x.getHours() >= 20).length;
    driverStats[d.nome] = {
      saida: saidaMed != null ? hhmm(saidaMed) : null,
      primeiraEntrega: primeira != null ? hhmm(primeira) : null,
      ultimaEntrega: ultima != null ? hhmm(ultima) : null,
      entregasPorHora,
      saidaAtePrimeiraH,
      noturnas,
    };
  }

  return { list, tot, motivos, hasEnt: !!(ent && ent.map.cod >= 0), porBairro, bairroStats, linhasDescartadas, divergentes, retidos, bloqueados, driverStats };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Coleta (pickup) é uma dimensão própria, separada da entrega: cada linha é um pedido a ser
// coletado no cliente, com uma coluna de status/bipagem indicando se a coleta foi confirmada.
const FALHA_RE = /falh|nao\s*bip|não\s*bip|pendente|ausente|recusa/i;
const OK_RE = /coletad|bipad|sucesso|conclu|ok|confirmad/i;

export interface ColetaResult {
  total: number;
  feita: number;
  falhaBipagem: number;
  pct: number;
}

export function computeColeta(sheet: SheetTable | null): ColetaResult | null {
  if (!sheet || sheet.map.cod < 0) return null;
  const seen = new Set<string>();
  let feita = 0;
  let falha = 0;
  for (const r of sheet.data) {
    const raw = r[sheet.map.cod];
    if (!raw) continue;
    const c = mae(raw);
    if (!c || !/\d/.test(c) || seen.has(c)) continue;
    seen.add(c);
    const status = sheet.map.status_coleta >= 0 ? norm(r[sheet.map.status_coleta] || "") : "";
    if (FALHA_RE.test(status)) falha++;
    else if (!status || OK_RE.test(status)) feita++;
    else feita++; // status desconhecido: assume coletado, só a falha explícita conta como falha
  }
  const total = seen.size;
  return { total, feita, falhaBipagem: falha, pct: total ? feita / total : 0 };
}

export const faltam = (t: number, e: number, meta: number) => Math.max(0, Math.ceil(meta * t - 1e-9) - e);

export const level = (pct: number, meta: number, alerta: number): "ok" | "warn" | "bad" =>
  pct >= meta - 1e-9 ? "ok" : pct >= alerta ? "warn" : "bad";

// Motor de alertas operacionais do dia — cada regra tem um limite ajustável por base
// (em Ajustes), com um padrão sensato quando a base ainda não configurou nada.
export function computeAlerts(result: DayResult, base: Partial<Base> | null): Alert[] {
  const alerts: Alert[] = [];
  const lim = {
    taxaFalhaAviso: base?.taxa_falha_aviso ?? 97,
    taxaFalhaCritico: base?.taxa_falha_critico ?? 95,
    inicioTardioAviso: base?.inicio_tardio_aviso_h ?? 4,
    inicioTardioCritico: base?.inicio_tardio_critico_h ?? 6,
    ritmoMultiplicador: base?.ritmo_multiplicador ?? 2,
    cargaMin: base?.carga_desigual_min ?? 0.6,
    cargaMax: base?.carga_desigual_max ?? 1.4,
    noturnaLimite: base?.entrega_noturna_limite ?? 20,
    noturnaMin: base?.entrega_noturna_min ?? 10,
  };

  // "Pendente" = não chegou de fato (entregue=false), não apenas fora do SLA (st "p" inclui
  // entregas tardias mas concluídas). Usamos o campo aditivo `entregue` para não confundir os dois.
  const pendentesItens = result.list.flatMap((d) => d.itens).filter((it) => !it.entregue);
  const pendentes = pendentesItens.length;
  if (pendentes > 0) {
    const porMotivo: Record<string, number> = {};
    for (const it of pendentesItens) {
      const m = it.prob && !TRIVIAL.has(norm(it.prob)) ? it.prob : "Sem motivo informado";
      porMotivo[m] = (porMotivo[m] || 0) + 1;
    }
    const breakdown = Object.entries(porMotivo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, n]) => `${m} (${n})`)
      .join(", ");
    alerts.push({
      id: "pendentes",
      tipo: "pendentes",
      nivel: "critico",
      mensagem: `${pendentes} pacote${pendentes > 1 ? "s" : ""} não entregue${pendentes > 1 ? "s" : ""} hoje — ${breakdown}`,
      acao: "Reprogramar para a próxima rota — veja Pendências de hoje.",
    });
  }

  if (result.retidos.length > 0) {
    alerts.push({
      id: "retidos",
      tipo: "retidos",
      nivel: "critico",
      mensagem: `${result.retidos.length} pacote${result.retidos.length > 1 ? "s" : ""} com retenção registrada na base`,
      acao: "Tratar a retenção antes do fechamento do dia.",
    });
  }

  if (result.bloqueados.length > 0) {
    alerts.push({
      id: "bloqueados",
      tipo: "bloqueados",
      nivel: "aviso",
      mensagem: `${result.bloqueados.length} pacote${result.bloqueados.length > 1 ? "s" : ""} com marca de revisão`,
      acao: "Verifique o motivo da marcação no JMS antes de liberar a entrega.",
    });
  }

  if (result.divergentes.length > 0) {
    const porPar: Record<string, number> = {};
    for (const dv of result.divergentes) {
      const par = `${dv.motoristaBipagem} → ${dv.motoristaResponsavel}`;
      porPar[par] = (porPar[par] || 0) + 1;
    }
    const breakdown = Object.entries(porPar)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([par, n]) => `${par} (${n})`)
      .join(", ");
    alerts.push({
      id: "motorista_divergente",
      tipo: "motorista_divergente",
      nivel: "aviso",
      mensagem: `${result.divergentes.length} pacote${result.divergentes.length > 1 ? "s" : ""} com motorista divergente entre bipagem e carta de porte — ${breakdown}`,
      acao: "Confirme quem entregou de fato antes de fechar o pagamento.",
    });
  }

  const ritmos = Object.values(result.driverStats).map((s) => s.entregasPorHora).filter((v) => v > 0);
  const medRitmo = median(ritmos) || 0;

  const volumes = result.list.map((d) => d.t);
  const medVolume = median(volumes) || 0;

  for (const d of result.list) {
    const st = result.driverStats[d.nome];
    if (!st) continue;

    if (st.saidaAtePrimeiraH != null && st.saidaAtePrimeiraH >= lim.inicioTardioAviso) {
      const critico = st.saidaAtePrimeiraH >= lim.inicioTardioCritico;
      alerts.push({
        id: `inicio_tardio_${d.nome}`,
        tipo: "inicio_tardio",
        nivel: critico ? "critico" : "aviso",
        motorista: d.nome,
        mensagem: `Saiu às ${st.saida}, 1ª entrega só às ${st.primeiraEntrega} (${st.saidaAtePrimeiraH.toFixed(1)}h depois)`,
        acao: "Conferir se houve rota distante, parada longa ou baixa registrada com atraso.",
      });
    }

    if (medRitmo > 0 && st.entregasPorHora >= medRitmo * lim.ritmoMultiplicador) {
      alerts.push({
        id: `ritmo_atipico_${d.nome}`,
        tipo: "ritmo_atipico",
        nivel: "aviso",
        motorista: d.nome,
        mensagem: `${st.entregasPorHora.toFixed(1)} entregas/h, mais de ${lim.ritmoMultiplicador}x a mediana da base (${medRitmo.toFixed(1)}/h)`,
        acao: "Conferir comprovantes e fotos por amostragem.",
      });
    }

    if (d.t >= 20 && d.pct < lim.taxaFalhaAviso / 100) {
      const critico = d.pct < lim.taxaFalhaCritico / 100;
      alerts.push({
        id: `taxa_falha_${d.nome}`,
        tipo: "taxa_falha",
        nivel: critico ? "critico" : "aviso",
        motorista: d.nome,
        mensagem: `${(d.pct * 100).toFixed(1)}% de sucesso em ${d.t} pacotes`,
        acao: "Rever com o motorista os motivos de insucesso do dia.",
      });
    }

    if (st.noturnas >= lim.noturnaMin) {
      alerts.push({
        id: `entrega_noturna_${d.nome}`,
        tipo: "entrega_noturna",
        nivel: "info",
        motorista: d.nome,
        mensagem: `${st.noturnas} entregas depois das ${lim.noturnaLimite}h`,
        acao: "Redistribuir pacotes das rotas mais longas ou antecipar a saída.",
      });
    }

    if (medVolume > 0 && (d.t <= medVolume * lim.cargaMin || d.t >= medVolume * lim.cargaMax)) {
      alerts.push({
        id: `carga_desigual_${d.nome}`,
        tipo: "carga_desigual",
        nivel: "info",
        motorista: d.nome,
        mensagem: `${d.t} pacotes, ${(d.t / medVolume).toFixed(1)}x a mediana da base (${Math.round(medVolume)} pacotes)`,
        acao: "Rebalancear a distribuição de rotas entre os motoristas.",
      });
    }
  }

  const ordem: Record<AlertLevel, number> = { critico: 0, aviso: 1, info: 2 };
  return alerts.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
