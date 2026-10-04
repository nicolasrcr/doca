// Leitura de histórico de rastreador (CSV ou GPX) e métricas do dia. Tudo roda no navegador:
// o arquivo não é enviado nem guardado em lugar nenhum.
export interface Ponto { t: number; lat: number; lon: number; kmh: number | null }
export interface Parada { inicio: number; minutos: number; lat: number; lon: number }
export interface ResumoRota {
  pontos: Ponto[];
  km: number;
  saida: number | null; // primeiro movimento
  retorno: number | null; // último movimento
  minutosParado: number;
  paradas: Parada[]; // paradas longas
}

const rad = (g: number) => (g * Math.PI) / 180;
export function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const num = (s: string) => {
  const v = parseFloat(String(s).trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};

function parseData(s: string): number {
  const t = s.trim();
  // dd/mm/aaaa hh:mm(:ss) — padrão brasileiro dos relatórios de rastreador
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1], +br[4], +br[5], +(br[6] || 0)).getTime();
  const d = Date.parse(t);
  return Number.isFinite(d) ? d : NaN;
}

export function lerGpx(xml: string): Ponto[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("O arquivo GPX está corrompido.");
  const out: Ponto[] = [];
  doc.querySelectorAll("trkpt, rtept").forEach((n) => {
    const lat = num(n.getAttribute("lat") || ""), lon = num(n.getAttribute("lon") || "");
    const t = parseData(n.querySelector("time")?.textContent || "");
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(t)) out.push({ t, lat, lon, kmh: null });
  });
  return out;
}

export function lerCsv(texto: string): Ponto[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error("O arquivo está vazio.");
  const sep = (linhas[0].match(/;/g)?.length || 0) >= (linhas[0].match(/,/g)?.length || 0) ? ";" : ",";
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const cab = linhas[0].split(sep).map(norm);
  const ach = (nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c === n || c.startsWith(n)));
  const iLat = ach(["latitude", "lat"]), iLon = ach(["longitude", "lon", "lng", "long"]);
  let iT = ach(["datahora", "datetime", "timestamp", "dataehora", "horario", "time", "data"]);
  const iData = ach(["data", "date"]), iHora = ach(["hora", "hour"]);
  const iVel = ach(["velocidade", "speed", "vel"]);
  if (iLat < 0 || iLon < 0) throw new Error("Não achei as colunas de latitude e longitude.");
  const separadas = iT < 0 && iData >= 0 && iHora >= 0;
  if (iT < 0 && !separadas) throw new Error("Não achei a coluna de data e hora.");
  if (iT === iData && iHora >= 0 && iT >= 0) iT = -1; // coluna "data" sozinha + "hora" separada
  const out: Ponto[] = [];
  for (const l of linhas.slice(1)) {
    const c = l.split(sep);
    const lat = num(c[iLat]), lon = num(c[iLon]);
    const t = iT >= 0 ? parseData(c[iT] || "") : parseData(`${c[iData] || ""} ${c[iHora] || ""}`);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const v = iVel >= 0 ? num(c[iVel]) : NaN;
    out.push({ t, lat, lon, kmh: Number.isFinite(v) ? v : null });
  }
  return out;
}

export function resumir(pontosBrutos: Ponto[], opts: { paradaMin?: number; raioM?: number } = {}): ResumoRota {
  const paradaMin = opts.paradaMin ?? 10, raio = opts.raioM ?? 60;
  const p = pontosBrutos.slice().sort((a, b) => a.t - b.t);
  if (p.length < 2) throw new Error("Preciso de pelo menos 2 pontos com data, latitude e longitude.");
  let km = 0, parado = 0;
  let saida: number | null = null, retorno: number | null = null;
  for (let i = 1; i < p.length; i++) {
    const d = distM(p[i - 1], p[i]), dt = (p[i].t - p[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const v = (d / dt) * 3.6;
    if (v > 160) continue; // salto de GPS: não conta
    km += d / 1000;
    if (v >= 5) { if (saida === null) saida = p[i - 1].t; retorno = p[i].t; }
  }
  const paradas: Parada[] = [];
  let ini = 0;
  for (let i = 1; i <= p.length; i++) {
    if (i === p.length || distM(p[ini], p[i]) > raio) {
      const min = (p[i - 1].t - p[ini].t) / 60000;
      if (min >= paradaMin) paradas.push({ inicio: p[ini].t, minutos: Math.round(min), lat: p[ini].lat, lon: p[ini].lon });
      ini = i;
    }
  }
  if (saida !== null && retorno !== null) {
    parado = paradas.filter((x) => x.inicio >= saida! && x.inicio <= retorno!).reduce((a, x) => a + x.minutos, 0);
  }
  return { pontos: p, km, saida, retorno, minutosParado: parado, paradas };
}

export const hhmm = (t: number | null) => (t === null ? "—" : new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
