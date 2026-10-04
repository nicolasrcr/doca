import { mae, parseDateTime } from "./compute";
import type { SheetTable } from "./types";

export type CheckNivel = "ok" | "aviso" | "erro";

export interface Check {
  id: string;
  nivel: CheckNivel;
  titulo: string;
  detalhe?: string;
  fix?: { rotulo: string; horas: number }; // corrigir deslocando todos os horários
}

const hojeISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const nTxt = (v: number) => v.toLocaleString("pt-BR");
const pTxt = (v: number) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const dia = (iso: string) => iso.split("-").reverse().join("/");

const literalDay = (v: string | undefined) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((v || "").trim());
  if (m) return m[1];
  const d = v ? parseDateTime(v) : null;
  if (!d) return "";
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};

// Faixa em que ficam 98% das entregas (ignora pontas isoladas), ex.: "09h e 21h".
function faixa(horas: number[]): string {
  const o = horas.slice().sort((a, b) => a - b);
  const lo = o[Math.floor(o.length * 0.01)];
  const hi = o[Math.min(o.length - 1, Math.floor(o.length * 0.99))];
  return `${String(lo).padStart(2, "0")}h e ${String(hi).padStart(2, "0")}h`;
}

// Janela em que uma operação de entrega acontece normalmente (hora local de Brasília).
const JANELA = { de: 6, ate: 22 };

function shareInWindow(hours: number[], shift: number): number {
  let ok = 0;
  for (const h of hours) {
    const x = (((h + shift) % 24) + 24) % 24;
    if (x >= JANELA.de && x < JANELA.ate) ok++;
  }
  return ok / hours.length;
}

function fusoLabel(shift: number): string {
  if (shift === -11) return "parece o horário da China (UTC+8, 11h à frente de Brasília)";
  if (shift === -10) return "parece o horário do Japão/Coreia (10h à frente de Brasília)";
  if (shift === -3 || shift === 3) return "parece estar em UTC (3h de diferença para Brasília)";
  return `os horários parecem deslocados em ${Math.abs(shift)}h`;
}

// Confere se os arquivos fazem sentido ANTES de importar: fuso dos horários, colunas reconhecidas,
// vários dias no mesmo arquivo, pedidos repetidos e concordância entre bipagem e carta de porte.
export function validarTabelas(bip: SheetTable[], carta: SheetTable | null, opts?: { shiftHoras?: number }): Check[] {
  const checks: Check[] = [];
  if (!bip.length) {
    checks.push({ id: "sem-bipagem", nivel: "erro", titulo: "Não encontrei o Monitoramento de bipagem de entrega", detalhe: "Sem ele não há pacotes para analisar. Adicione o arquivo e tente de novo." });
    return checks;
  }

  // ── colunas reconhecidas (só o que é essencial para a análise)
  const faltaEssencial = bip.some((t) => t.map.cod < 0 || t.map.ent < 0);
  const falta: string[] = [];
  const querCol: [string, string][] = [["hr_chegada", "horário da entrega"], ["hr_saida", "horário de saída"], ["base", "base de entrega"]];
  for (const [k, nome] of querCol) if (bip.every((t) => t.map[k] < 0)) falta.push(nome);
  if (faltaEssencial) {
    checks.push({ id: "colunas", nivel: "erro", titulo: "Não encontrei as colunas de pedido e de entregador", detalhe: "O formato do arquivo parece diferente do esperado. Se o JMS mudou o relatório, me avise." });
  } else if (falta.length) {
    checks.push({ id: "colunas", nivel: "aviso", titulo: `Colunas não encontradas: ${falta.join(", ")}`, detalhe: "A análise que depende delas (prazo, horários, separação por base) fica limitada." });
  } else {
    checks.push({ id: "colunas", nivel: "ok", titulo: "Colunas principais reconhecidas" });
  }

  // ── fuso / horário plausível
  const horas: number[] = [];
  for (const t of bip) {
    if (t.map.hr_chegada < 0) continue;
    for (const r of t.data) {
      const d = parseDateTime(r[t.map.hr_chegada]);
      if (d) horas.push(d.getHours());
      if (horas.length >= 20000) break;
    }
  }
  if (horas.length >= 50) {
    const base = shareInWindow(horas, 0);
    if (base >= 0.9) {
      checks.push({
        id: "fuso",
        nivel: "ok",
        titulo: opts?.shiftHoras ? `Horários ajustados em ${opts.shiftHoras > 0 ? "+" : ""}${opts.shiftHoras}h e agora fazem sentido` : "Horários de entrega fazem sentido",
        detalhe: `${pTxt(base)} das entregas entre ${JANELA.de}h e ${JANELA.ate}h; a maioria entre ${faixa(horas)}. Confira se bate com o seu horário de operação.`,
      });
    } else {
      // centro (média circular) das horas de entrega; uma operação típica de entrega tem o centro por volta das 14h
      let sx = 0, sy = 0;
      for (const h of horas) { sx += Math.cos((h / 24) * 2 * Math.PI); sy += Math.sin((h / 24) * 2 * Math.PI); }
      const centro = ((Math.atan2(sy, sx) / (2 * Math.PI)) * 24 + 24) % 24;
      let best = Math.round(14.5 - centro);
      while (best > 12) best -= 24;
      while (best < -12) best += 24;
      const bestShare = shareInWindow(horas, best);
      if (best !== 0 && bestShare >= 0.9) {
        checks.push({
          id: "fuso",
          nivel: "aviso",
          titulo: `Os horários parecem estar em outro fuso: ${fusoLabel(best)}`,
          detalhe: `Só ${pTxt(base)} das entregas caem entre ${JANELA.de}h e ${JANELA.ate}h. Deslocando ${best > 0 ? "+" : ""}${best}h, ${pTxt(bestShare)} passam a cair nessa janela. Isso afeta entrega noturna, início tardio e prazo.`,
          fix: { rotulo: `Corrigir horários (${best > 0 ? "+" : ""}${best}h)`, horas: best },
        });
      } else {
        checks.push({ id: "fuso", nivel: "aviso", titulo: "Muitas entregas em horários incomuns", detalhe: `Só ${pTxt(base)} das entregas caem entre ${JANELA.de}h e ${JANELA.ate}h e nenhum ajuste de fuso resolve. Confira se o arquivo é mesmo do dia e da base certos.` });
      }
    }
  }

  // ── entrega antes da saída
  let neg = 0, tot = 0;
  for (const t of bip) {
    if (t.map.hr_saida < 0 || t.map.hr_chegada < 0) continue;
    for (const r of t.data) {
      const s = parseDateTime(r[t.map.hr_saida]), c = parseDateTime(r[t.map.hr_chegada]);
      if (s && c) { tot++; if (c < s) neg++; }
    }
  }
  if (tot >= 50) {
    if (neg / tot > 0.02) checks.push({ id: "ordem", nivel: "aviso", titulo: `${pTxt(neg / tot)} das entregas aparecem antes da saída`, detalhe: "Costuma indicar horários em fusos diferentes ou colunas trocadas. O prazo (SLA) desses pacotes não é confiável." });
    else checks.push({ id: "ordem", nivel: "ok", titulo: "Saída sempre antes da entrega" });
  }

  // ── vários dias no mesmo arquivo
  const dias = new Map<string, number>();
  for (const t of bip) {
    const col = t.map.hr_saida >= 0 ? t.map.hr_saida : t.map.hr_chegada;
    if (col < 0) continue;
    for (const r of t.data) {
      const d = literalDay(r[col]);
      if (d) dias.set(d, (dias.get(d) || 0) + 1);
    }
  }
  if (dias.size) {
    const ord = [...dias.entries()].sort((a, b) => b[1] - a[1]);
    const total = ord.reduce((a, [, n]) => a + n, 0);
    const outros = total - ord[0][1];
    if (outros / total > 0.05) {
      checks.push({
        id: "dias",
        nivel: "aviso",
        titulo: `O arquivo tem pacotes de ${ord.length} dias diferentes`,
        detalhe: `${pTxt(ord[0][1] / total)} são de ${dia(ord[0][0])}; o resto: ${ord.slice(1, 4).map(([d, n]) => `${dia(d)} (${nTxt(n)})`).join(", ")}. Tudo será salvo como o dia ${dia(ord[0][0])}. Se quiser separar por dia, exporte um dia por arquivo.`,
      });
    } else {
      checks.push({ id: "dias", nivel: "ok", titulo: `Arquivo de um único dia (${dia(ord[0][0])})` });
    }
    const hoje = hojeISO();
    const futuros = ord.filter(([d]) => d > hoje);
    if (futuros.length) checks.push({ id: "futuro", nivel: "aviso", titulo: "Há pacotes com data no futuro", detalhe: `Dia ${dia(futuros[0][0])}. Pode ser fuso ou data errada no arquivo.` });
  }

  // ── pedidos repetidos
  let linhas = 0;
  const vistos = new Set<string>();
  for (const t of bip) {
    for (const r of t.data) {
      const c = mae(r[t.map.cod] || "");
      if (!c) continue;
      linhas++;
      vistos.add(c);
    }
  }
  if (linhas > 0 && linhas - vistos.size > 0) {
    const rep = linhas - vistos.size;
    checks.push({ id: "repetidos", nivel: rep / linhas > 0.01 ? "aviso" : "ok", titulo: `${nTxt(rep)} linha${rep === 1 ? "" : "s"} repetida${rep === 1 ? "" : "s"} (mesmo pedido)`, detalhe: "Cada pedido é contado uma única vez." });
  }

  // ── bipagem × carta de porte
  if (carta && carta.map.cod >= 0) {
    const cartaCods = new Set<string>();
    for (const r of carta.data) { const c = mae(r[carta.map.cod] || ""); if (c) cartaCods.add(c); }
    let comum = 0;
    for (const c of cartaCods) if (vistos.has(c)) comum++;
    const cobertura = cartaCods.size ? comum / cartaCods.size : 0;
    if (cartaCods.size === 0) checks.push({ id: "carta", nivel: "aviso", titulo: "A Carta de porte veio vazia", detalhe: "Sem pedidos nela, nenhuma entrega será confirmada." });
    else if (cobertura < 0.8) checks.push({ id: "carta", nivel: "aviso", titulo: `Só ${pTxt(cobertura)} dos pedidos da Carta de porte estão no Monitoramento de bipagem`, detalhe: "Os arquivos parecem ser de dias ou de bases diferentes. Confira antes de importar, ou as entregas ficarão erradas." });
    else checks.push({ id: "carta", nivel: "ok", titulo: "Bipagem e Carta de porte combinam", detalhe: `${pTxt(cobertura)} dos pedidos da Carta de porte estão na bipagem.` });
  } else {
    checks.push({ id: "carta", nivel: "aviso", titulo: "Falta a Carta de porte", detalhe: "Sem ela não dá para confirmar as entregas; os dias serão salvos como incompletos." });
  }

  const ordem: Record<CheckNivel, number> = { erro: 0, aviso: 1, ok: 2 };
  return checks.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
