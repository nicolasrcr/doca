import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtR, todayISO } from "../lib/format";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function Precos() {
  const {
    drivers,
    paymentRules,
    specialDays,
    adjustments,
    canEdit,
    savePaymentRule,
    deletePaymentRule,
    saveSpecialDay,
    deleteSpecialDay,
    saveAdjustment,
    deleteAdjustment,
  } = useDoca();

  const [ruleDriver, setRuleDriver] = useState("");
  const [ruleBairro, setRuleBairro] = useState("");
  const [ruleAmount, setRuleAmount] = useState("");

  const [dayKind, setDayKind] = useState<"data" | "semana">("data");
  const [dayDate, setDayDate] = useState(todayISO());
  const [dayWeekday, setDayWeekday] = useState(6);
  const [dayAmount, setDayAmount] = useState("");
  const [dayLabel, setDayLabel] = useState("");

  const [adjDriver, setAdjDriver] = useState("");
  const [adjData, setAdjData] = useState(todayISO());
  const [adjMotivo, setAdjMotivo] = useState("");
  const [adjValor, setAdjValor] = useState("");

  const nameOf = (id: string | null) => (id ? drivers.find((d) => d.id === id)?.name || "—" : "Todos os motoristas");

  return (
    <section className="pane active">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 .25rem" }}>Tabela de preços por motorista e bairro</h2>
        <p className="muted small">
          Prioridade: valor específico de motorista+bairro → valor padrão do bairro (todos os motoristas) → valor geral do
          motorista → padrão da base. Deixe "Bairro" em branco para valer em qualquer bairro.
        </p>
        {canEdit && (
          <div className="toolbar">
            <select value={ruleDriver} onChange={(e) => setRuleDriver(e.target.value)}>
              <option value="">Todos os motoristas</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input placeholder="Bairro (vazio = todos)" value={ruleBairro} onChange={(e) => setRuleBairro(e.target.value)} />
            <input
              type="number" step={0.01} min={0} placeholder="R$/entrega"
              value={ruleAmount} onChange={(e) => setRuleAmount(e.target.value)} style={{ width: 110 }}
            />
            <button
              className="btn primary"
              onClick={() => {
                const amount = parseFloat(ruleAmount);
                if (!amount || amount <= 0) return;
                savePaymentRule({ driver_id: ruleDriver || null, bairro: ruleBairro.trim(), amount });
                setRuleAmount("");
                setRuleBairro("");
              }}
            >
              Salvar preço
            </button>
          </div>
        )}
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Motorista</th><th>Bairro</th><th>Valor/entrega</th><th></th></tr></thead>
            <tbody>
              {paymentRules.map((r) => (
                <tr key={r.id}>
                  <td>{nameOf(r.driver_id)}</td>
                  <td>{r.bairro || "Todos"}</td>
                  <td>{fmtR(r.amount)}</td>
                  <td>{canEdit && <button className="btn small" onClick={() => deletePaymentRule(r.id)}>Excluir</button>}</td>
                </tr>
              ))}
              {!paymentRules.length && (
                <tr><td colSpan={4} className="muted small">Nenhum preço configurado ainda — o valor geral da base é usado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 .25rem" }}>Dias especiais (acréscimo)</h2>
        <p className="muted small">Ex.: sábado paga R$ 1,00 a mais por entrega — cadastre um recorrente para "Sábado". O acréscimo soma ao valor do bairro/motorista naquele dia.</p>
        {canEdit && (
          <div className="toolbar">
            <select value={dayKind} onChange={(e) => setDayKind(e.target.value as "data" | "semana")}>
              <option value="data">Data específica</option>
              <option value="semana">Dia da semana recorrente</option>
            </select>
            {dayKind === "data" ? (
              <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
            ) : (
              <select value={dayWeekday} onChange={(e) => setDayWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            )}
            <input placeholder="Motivo (ex.: Sábado)" value={dayLabel} onChange={(e) => setDayLabel(e.target.value)} />
            <input
              type="number" step={0.01} placeholder="Acréscimo R$"
              value={dayAmount} onChange={(e) => setDayAmount(e.target.value)} style={{ width: 110 }}
            />
            <button
              className="btn primary"
              onClick={() => {
                const amount = parseFloat(dayAmount);
                if (!amount) return;
                saveSpecialDay(
                  dayKind === "data"
                    ? { day_date: dayDate, amount, label: dayLabel.trim() || null }
                    : { weekday: dayWeekday, amount, label: dayLabel.trim() || null }
                );
                setDayAmount("");
                setDayLabel("");
              }}
            >
              Salvar dia especial
            </button>
          </div>
        )}
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Quando</th><th>Motivo</th><th>Acréscimo</th><th></th></tr></thead>
            <tbody>
              {specialDays.map((s) => (
                <tr key={s.id}>
                  <td>{s.day_date ? s.day_date.split("-").reverse().join("/") : WEEKDAYS[s.weekday ?? 0] + " (toda semana)"}</td>
                  <td>{s.label || "—"}</td>
                  <td>{fmtR(s.amount)}</td>
                  <td>{canEdit && <button className="btn small" onClick={() => deleteSpecialDay(s.id)}>Excluir</button>}</td>
                </tr>
              ))}
              {!specialDays.length && <tr><td colSpan={4} className="muted small">Nenhum dia especial cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ margin: "0 0 .25rem" }}>Descontos e bônus avulsos</h2>
        <p className="muted small">Lançamentos aqui entram automaticamente como item itemizado no próximo fechamento gerado para o motorista, dentro do período da data informada.</p>
        {canEdit && (
          <div className="toolbar">
            <select value={adjDriver} onChange={(e) => setAdjDriver(e.target.value)}>
              <option value="">Selecione o motorista</option>
              {drivers.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
            <input type="date" value={adjData} onChange={(e) => setAdjData(e.target.value)} />
            <input placeholder="Motivo (ex.: avaria, bônus meta)" value={adjMotivo} onChange={(e) => setAdjMotivo(e.target.value)} />
            <input
              type="number" step={0.01} placeholder="Valor (negativo=desconto)"
              value={adjValor} onChange={(e) => setAdjValor(e.target.value)} style={{ width: 150 }}
            />
            <button
              className="btn primary"
              onClick={() => {
                const valor = parseFloat(adjValor);
                if (!adjDriver || !adjMotivo.trim() || !valor) return;
                saveAdjustment({ driver_id: adjDriver, data: adjData, motivo: adjMotivo.trim(), valor });
                setAdjMotivo("");
                setAdjValor("");
              }}
            >
              Registrar
            </button>
          </div>
        )}
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Motorista</th><th>Data</th><th>Motivo</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{nameOf(a.driver_id)}</td>
                  <td>{a.data.split("-").reverse().join("/")}</td>
                  <td>{a.motivo}</td>
                  <td style={{ color: a.valor < 0 ? "var(--bad)" : "var(--ok)" }}>{fmtR(a.valor)}</td>
                  <td>{a.applied_payout_id ? "aplicado" : "pendente"}</td>
                  <td>{canEdit && !a.applied_payout_id && <button className="btn small" onClick={() => deleteAdjustment(a.id)}>Excluir</button>}</td>
                </tr>
              ))}
              {!adjustments.length && <tr><td colSpan={6} className="muted small">Nenhum lançamento ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
