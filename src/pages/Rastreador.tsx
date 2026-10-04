import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtN } from "../lib/format";
import { hhmm, lerCsv, lerGpx, resumir, type ResumoRota } from "../lib/tracker";

const W = 560, H = 360, PAD = 18;

function Trajeto({ r }: { r: ResumoRota }) {
  const g = useMemo(() => {
    const lats = r.pontos.map((p) => p.lat), lons = r.pontos.map((p) => p.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const w = Math.max(1e-6, (maxLon - minLon) * k), h = Math.max(1e-6, maxLat - minLat);
    const s = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
    const x = (lon: number) => PAD + (lon - minLon) * k * s + (W - 2 * PAD - w * s) / 2;
    const y = (lat: number) => H - PAD - (lat - minLat) * s - (H - 2 * PAD - h * s) / 2;
    return { x, y };
  }, [r]);
  const passo = Math.max(1, Math.floor(r.pontos.length / 1500));
  const linha = r.pontos.filter((_, i) => i % passo === 0).map((p) => `${g.x(p.lon).toFixed(1)},${g.y(p.lat).toFixed(1)}`).join(" ");
  const a = r.pontos[0], z = r.pontos[r.pontos.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trajeto do veículo no dia, com as paradas longas marcadas" style={{ maxHeight: 420, background: "var(--surface)", borderRadius: "var(--r)", border: "1px solid var(--line)" }}>
      <polyline points={linha} fill="none" stroke="var(--v1, #2a78d6)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {r.paradas.map((p, i) => (
        <g key={i}>
          <circle cx={g.x(p.lon)} cy={g.y(p.lat)} r={Math.min(14, 5 + p.minutos / 10)} fill="var(--v2, #eb6834)" fillOpacity=".35" stroke="var(--v2, #eb6834)" strokeWidth="2" />
          <text x={g.x(p.lon)} y={g.y(p.lat) - 10} textAnchor="middle" fontSize="11" style={{ fill: "var(--ink)", fontWeight: 600 }}>{p.minutos}min</text>
        </g>
      ))}
      <circle cx={g.x(a.lon)} cy={g.y(a.lat)} r="6" fill="var(--ok)" stroke="#fff" strokeWidth="2" />
      <circle cx={g.x(z.lon)} cy={g.y(z.lat)} r="6" fill="var(--bad)" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export default function Rastreador() {
  const { history } = useDoca();
  const [r, setR] = useState<ResumoRota | null>(null);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [paradaMin, setParadaMin] = useState(10);
  const [brutos, setBrutos] = useState<ReturnType<typeof lerCsv> | null>(null);
  const [motorista, setMotorista] = useState("");

  const abrir = async (f: File) => {
    setErro(""); setR(null); setArquivo(f.name);
    try {
      const texto = await f.text();
      const pts = /\.gpx$/i.test(f.name) || texto.trimStart().startsWith("<") ? lerGpx(texto) : lerCsv(texto);
      if (pts.length < 2) throw new Error("Não achei pontos com data e posição nesse arquivo.");
      setBrutos(pts);
      setR(resumir(pts, { paradaMin }));
    } catch (e) {
      setBrutos(null);
      setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    }
  };

  // dia da rota -> horários do JMS desse motorista, para comparar com o que o rastreador viu
  const dia = r ? new Date(r.pontos[0].t) : null;
  const iso = dia ? new Date(dia.getTime() - dia.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "";
  const doDia = history.find((d) => d.data === iso);
  const nomes = doDia?.horarios ? Object.keys(doDia.horarios).sort((a, b) => a.localeCompare(b, "pt-BR")) : [];
  const jms = motorista && doDia?.horarios ? doDia.horarios[motorista] : null;

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Rastreador (beta)</h2>
        <p className="muted">Importe o histórico do rastreador de um veículo (CSV ou GPX, um dia) e veja a que horas saiu, quanto rodou e onde ficou parado, para comparar com os horários do JMS. O arquivo é lido só no seu navegador: não é enviado nem guardado.</p>
        <div className="drop" style={{ maxWidth: 480 }}>
          <h3>Histórico do rastreador <span className="tag">CSV ou GPX</span></h3>
          <input type="file" accept=".csv,.gpx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void abrir(f); e.target.value = ""; }} />
          <p className="small muted">Colunas aceitas no CSV: data e hora, latitude, longitude e, se tiver, velocidade.</p>
        </div>
        {erro && <div className="warnbox" style={{ marginTop: ".6rem" }}>{erro}</div>}
      </div>

      {r && (
        <div className="panel">
          <div className="row">
            <h3 style={{ margin: 0 }}>{arquivo}</h3>
            <span className="spacer"></span>
            <label className="small">Parada longa a partir de{" "}
              <input type="number" min={3} max={60} value={paradaMin} style={{ width: 60 }}
                onChange={(e) => { const v = Number(e.target.value) || 10; setParadaMin(v); if (brutos) setR(resumir(brutos, { paradaMin: v })); }} /> min
            </label>
          </div>
          <div className="kpis" style={{ margin: ".8rem 0" }}>
            <div className="kpi"><div className="small muted">Saiu às</div><b>{hhmm(r.saida)}</b></div>
            <div className="kpi"><div className="small muted">Último movimento</div><b>{hhmm(r.retorno)}</b></div>
            <div className="kpi"><div className="small muted">Distância</div><b>{fmtN(Math.round(r.km))} km</b></div>
            <div className="kpi"><div className="small muted">Parado em rota</div><b>{fmtN(r.minutosParado)} min</b></div>
          </div>
          <Trajeto r={r} />
          <p className="small muted">Verde: início. Vermelho: fim. Círculos laranja: paradas longas, com a duração.</p>

          <h3>Paradas longas ({r.paradas.length})</h3>
          {r.paradas.length === 0 ? <p className="muted">Nenhuma parada acima de {paradaMin} minutos.</p> : (
            <div className="tablewrap"><table className="drv">
              <thead><tr><th>Início</th><th>Duração</th><th>Local</th></tr></thead>
              <tbody>{r.paradas.map((p, i) => (
                <tr key={i}><td>{hhmm(p.inicio)}</td><td>{p.minutos} min</td>
                  <td><a href={`https://www.google.com/maps?q=${p.lat},${p.lon}`} target="_blank" rel="noreferrer noopener">Abrir no mapa</a></td></tr>
              ))}</tbody>
            </table></div>
          )}

          <h3>Comparar com o JMS</h3>
          {nomes.length === 0 ? (
            <p className="muted small">Não há horários do JMS salvos para {iso.split("-").reverse().join("/")}. Importe e salve esse dia para comparar.</p>
          ) : (
            <>
              <label className="small">Motorista deste veículo{" "}
                <select value={motorista} onChange={(e) => setMotorista(e.target.value)}>
                  <option value="">Escolha…</option>
                  {nomes.map((n) => (<option key={n} value={n}>{n}</option>))}
                </select>
              </label>
              {jms && (
                <div className="tablewrap" style={{ marginTop: ".6rem" }}><table className="drv">
                  <thead><tr><th></th><th>Rastreador</th><th>JMS</th></tr></thead>
                  <tbody>
                    <tr><td>Saída da base</td><td>{hhmm(r.saida)}</td><td>{jms.saida || "—"}</td></tr>
                    <tr><td>Fim do dia</td><td>{hhmm(r.retorno)}</td><td>{jms.ultimaEntrega || "—"} (última entrega)</td></tr>
                  </tbody>
                </table></div>
              )}
              <p className="small muted">Diferença grande entre a saída do rastreador e a do JMS pode indicar bipagem atrasada ou veículo trocado.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
