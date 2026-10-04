import { brDate } from "./format";

// Linha de contexto para qualquer texto/imagem compartilhado: de onde veio, de qual dia e quando foi gerado.
export function geradoEm(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function contextoWhats(base: string, dataRef: string): string {
  return `📍 ${base}  |  📅 Dia ${brDate(dataRef)}\n🕒 Gerado em ${geradoEm()}\n`;
}
