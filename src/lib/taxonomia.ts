import { norm } from "./format";

// Agrupa os motivos de problema escritos pelo JMS em poucas categorias que o gerente consegue agir.
export const CATEGORIAS = [
  "Endereço",
  "Destinatário ausente",
  "Recusado",
  "Avaria ou extravio",
  "Reagendamento",
  "Local fechado ou de risco",
  "Sem motivo informado",
  "Outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

const REGRAS: [RegExp, Categoria][] = [
  [/sem motivo/, "Sem motivo informado"],
  [/endereco|cep|numero|nao localiz|nao encontr|incomplet|inexistente|complement/, "Endereço"],
  [/ausen|ninguem|nao atend|nao estava|destinatario nao|cliente nao|sem resposta|telefone/, "Destinatário ausente"],
  [/recus|rejeit|devolv|cancel|nao quis|nao solicit|desist/, "Recusado"],
  [/avari|dano|danific|molhad|violad|extravi|perdid|roubo|furto/, "Avaria ou extravio"],
  [/reagend|agendad|outra data|solicitou|adiad|feriado|ferias/, "Reagendamento"],
  [/fechad|sem expediente|area de risco|risco|condominio|portaria|acesso|chuva|bloqueio/, "Local fechado ou de risco"],
];

export function categoriaDe(motivo: string): Categoria {
  const m = norm(motivo);
  if (!m) return "Sem motivo informado";
  for (const [re, cat] of REGRAS) if (re.test(m)) return cat;
  return "Outros";
}

export function agruparMotivos(motivos: Record<string, number>): { categoria: Categoria; total: number; motivos: [string, number][] }[] {
  const out = new Map<Categoria, { total: number; motivos: [string, number][] }>();
  for (const [mot, n] of Object.entries(motivos)) {
    const c = categoriaDe(mot);
    const cur = out.get(c) || { total: 0, motivos: [] };
    cur.total += n;
    cur.motivos.push([mot, n]);
    out.set(c, cur);
  }
  return [...out.entries()]
    .map(([categoria, v]) => ({ categoria, total: v.total, motivos: v.motivos.sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.total - a.total);
}
