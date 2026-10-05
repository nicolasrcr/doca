import { useEffect, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast } from "../hooks/useToast";
import { NOMES_DIA } from "../lib/metas";

export default function Ajustes() {
  const { curBase, updateBase, canEdit } = useDoca();
  const toast = useToast();
  const [name, setName] = useState(curBase?.name || "");
  const [city, setCity] = useState(curBase?.city || "");
  const [meta, setMeta] = useState(curBase?.meta ?? 95);
  const [alerta, setAlerta] = useState(curBase?.alerta ?? 70);
  const [rate, setRate] = useState(curBase?.rate ?? 0);
  const [theme, setTheme] = useState(curBase?.theme || "");
  const [expurgar, setExpurgar] = useState(curBase?.expurgar_insucessos ?? false);
  const [staleDays, setStaleDays] = useState(curBase?.stale_days ?? 3);
  const [taxaFalhaAviso, setTaxaFalhaAviso] = useState(curBase?.taxa_falha_aviso ?? 97);
  const [taxaFalhaCritico, setTaxaFalhaCritico] = useState(curBase?.taxa_falha_critico ?? 95);
  const [inicioTardioAviso, setInicioTardioAviso] = useState(curBase?.inicio_tardio_aviso_h ?? 4);
  const [inicioTardioCritico, setInicioTardioCritico] = useState(curBase?.inicio_tardio_critico_h ?? 6);
  const [ritmoMultiplicador, setRitmoMultiplicador] = useState(curBase?.ritmo_multiplicador ?? 2);
  const [cargaMin, setCargaMin] = useState(curBase?.carga_desigual_min ?? 0.6);
  const [cargaMax, setCargaMax] = useState(curBase?.carga_desigual_max ?? 1.4);
  const [noturnaLimite, setNoturnaLimite] = useState(curBase?.entrega_noturna_limite ?? 20);
  const [noturnaMin, setNoturnaMin] = useState(curBase?.entrega_noturna_min ?? 10);
  const [semana, setSemana] = useState<Record<string, string>>({});

  useEffect(() => {
    setName(curBase?.name || "");
    setCity(curBase?.city || "");
    setMeta(curBase?.meta ?? 95);
    setAlerta(curBase?.alerta ?? 70);
    setRate(curBase?.rate ?? 0);
    setTheme(curBase?.theme || "");
    setExpurgar(curBase?.expurgar_insucessos ?? false);
    setStaleDays(curBase?.stale_days ?? 3);
    setTaxaFalhaAviso(curBase?.taxa_falha_aviso ?? 97);
    setTaxaFalhaCritico(curBase?.taxa_falha_critico ?? 95);
    setInicioTardioAviso(curBase?.inicio_tardio_aviso_h ?? 4);
    setInicioTardioCritico(curBase?.inicio_tardio_critico_h ?? 6);
    setRitmoMultiplicador(curBase?.ritmo_multiplicador ?? 2);
    setCargaMin(curBase?.carga_desigual_min ?? 0.6);
    setCargaMax(curBase?.carga_desigual_max ?? 1.4);
    setNoturnaLimite(curBase?.entrega_noturna_limite ?? 20);
    setNoturnaMin(curBase?.entrega_noturna_min ?? 10);
    setSemana(Object.fromEntries(Object.entries(curBase?.metas_semana || {}).map(([k, v]) => [k, String(v)])));
    document.documentElement.removeAttribute("data-theme");
    if (curBase?.theme) document.documentElement.setAttribute("data-theme", curBase.theme);
  }, [curBase]);

  const save = () => {
    if (!(meta >= 50 && meta <= 100)) { toast("Meta precisa estar entre 50% e 100%"); return; }
    if (!(alerta >= 0 && alerta < meta)) { toast("O alerta precisa ser menor que a meta"); return; }
    const metasSemana: Record<string, number> = {};
    for (const [k, v] of Object.entries(semana)) {
      if (v === "") continue;
      const n = parseFloat(v);
      if (!(n >= 50 && n <= 100)) { toast(`A meta de ${NOMES_DIA[Number(k)]} precisa estar entre 50% e 100%`); return; }
      metasSemana[k] = n;
    }
    updateBase({
      metas_semana: metasSemana,
      name: name.trim() || curBase?.name,
      city: city.trim(),
      meta,
      alerta,
      rate,
      theme,
      expurgar_insucessos: expurgar,
      stale_days: staleDays,
      taxa_falha_aviso: taxaFalhaAviso,
      taxa_falha_critico: taxaFalhaCritico,
      inicio_tardio_aviso_h: inicioTardioAviso,
      inicio_tardio_critico_h: inicioTardioCritico,
      ritmo_multiplicador: ritmoMultiplicador,
      carga_desigual_min: cargaMin,
      carga_desigual_max: cargaMax,
      entrega_noturna_limite: noturnaLimite,
      entrega_noturna_min: noturnaMin,
    });
    document.documentElement.removeAttribute("data-theme");
    if (theme) document.documentElement.setAttribute("data-theme", theme);
  };

  if (!curBase) return null;

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Dados e metas da base</h2>
        <div className="form">
          <label htmlFor="setBase">Nome da base</label><input id="setBase" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
          <label htmlFor="setCity">Cidade</label><input id="setCity" value={city} disabled={!canEdit} onChange={(e) => setCity(e.target.value)} />
          <label htmlFor="setMeta">Meta de entrega (%)</label><input id="setMeta" type="number" min={50} max={100} step={0.5} value={meta} disabled={!canEdit} onChange={(e) => setMeta(parseFloat(e.target.value))} />
          <label htmlFor="setAlert">Alerta abaixo de (%)</label><input id="setAlert" type="number" min={0} max={100} step={1} value={alerta} disabled={!canEdit} onChange={(e) => setAlerta(parseFloat(e.target.value))} />
          <label htmlFor="setExpurgar">Expurgar insucessos justificados da meta</label>
          <label className="small" style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
            <input id="setExpurgar" type="checkbox" checked={expurgar} disabled={!canEdit} onChange={(e) => setExpurgar(e.target.checked)} />
            Não penalizar o motorista por problema com motivo justificado (recusa, endereço errado etc.)
          </label>
          <label htmlFor="setStale">Pacote "parado" após (dias)</label><input id="setStale" type="number" min={1} max={30} step={1} value={staleDays} disabled={!canEdit} onChange={(e) => setStaleDays(parseInt(e.target.value, 10) || 1)} />
          <label htmlFor="setRate">Valor padrão por entrega (R$)</label><input id="setRate" type="number" min={0} step={0.01} value={rate} disabled={!canEdit} onChange={(e) => setRate(parseFloat(e.target.value))} />
          <label htmlFor="setTheme">Tema</label>
          <select id="setTheme" className="btn" style={{ maxWidth: 260 }} value={theme} disabled={!canEdit} onChange={(e) => setTheme(e.target.value)}>
            <option value="">Automático</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </div>
      </div>
      <details className="panel cargas" style={{ marginTop: "1rem" }}>
        <summary>Meta por dia da semana <span className="muted small">(opcional)</span></summary>
        <p className="muted small" style={{ margin: "0 0 .75rem" }}>Em branco, vale a meta da base ({meta}%).</p>
        <div className="form">
          {NOMES_DIA.map((nome, i) => (
            <span key={i} style={{ display: "contents" }}>
              <label htmlFor={`setDia${i}`}>{nome} (%)</label>
              <input id={`setDia${i}`} type="number" min={50} max={100} step={0.5} placeholder={String(meta)} value={semana[String(i)] ?? ""} disabled={!canEdit}
                onChange={(e) => setSemana({ ...semana, [String(i)]: e.target.value })} />
            </span>
          ))}
        </div>
      </details>
      <details className="panel cargas" style={{ marginTop: "1rem" }}>
        <summary>Limites dos alertas <span className="muted small">(avançado)</span></summary>
        <div className="form">
          <label htmlFor="setTFA">Taxa de falha — aviso abaixo de (%)</label><input id="setTFA" type="number" min={0} max={100} step={0.5} value={taxaFalhaAviso} disabled={!canEdit} onChange={(e) => setTaxaFalhaAviso(parseFloat(e.target.value))} />
          <label htmlFor="setTFC">Taxa de falha — crítico abaixo de (%)</label><input id="setTFC" type="number" min={0} max={100} step={0.5} value={taxaFalhaCritico} disabled={!canEdit} onChange={(e) => setTaxaFalhaCritico(parseFloat(e.target.value))} />
          <label htmlFor="setITA">Início tardio — aviso a partir de (horas após a saída)</label><input id="setITA" type="number" min={0} step={0.5} value={inicioTardioAviso} disabled={!canEdit} onChange={(e) => setInicioTardioAviso(parseFloat(e.target.value))} />
          <label htmlFor="setITC">Início tardio — crítico a partir de (horas)</label><input id="setITC" type="number" min={0} step={0.5} value={inicioTardioCritico} disabled={!canEdit} onChange={(e) => setInicioTardioCritico(parseFloat(e.target.value))} />
          <label htmlFor="setRM">Ritmo atípico — múltiplo da mediana da base</label><input id="setRM" type="number" min={1} step={0.1} value={ritmoMultiplicador} disabled={!canEdit} onChange={(e) => setRitmoMultiplicador(parseFloat(e.target.value))} />
          <label htmlFor="setCMin">Carga desigual — abaixo de (fração da mediana)</label><input id="setCMin" type="number" min={0} max={1} step={0.05} value={cargaMin} disabled={!canEdit} onChange={(e) => setCargaMin(parseFloat(e.target.value))} />
          <label htmlFor="setCMax">Carga desigual — acima de (fração da mediana)</label><input id="setCMax" type="number" min={1} step={0.05} value={cargaMax} disabled={!canEdit} onChange={(e) => setCargaMax(parseFloat(e.target.value))} />
          <label htmlFor="setNL">Entrega noturna — a partir de (hora do dia)</label><input id="setNL" type="number" min={0} max={23} step={1} value={noturnaLimite} disabled={!canEdit} onChange={(e) => setNoturnaLimite(parseInt(e.target.value, 10))} />
          <label htmlFor="setNM">Entrega noturna — mínimo de entregas para alertar</label><input id="setNM" type="number" min={1} step={1} value={noturnaMin} disabled={!canEdit} onChange={(e) => setNoturnaMin(parseInt(e.target.value, 10))} />
        </div>
      </details>
      <div className="panel" style={{ marginTop: "1rem" }}>
        {canEdit && <div className="row"><button className="btn primary" onClick={save}>Salvar ajustes</button></div>}
      </div>
    </section>
  );
}
