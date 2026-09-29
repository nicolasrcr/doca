import { useState } from "react";
import { useToast } from "../hooks/useToast";

interface ViaCep {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  ddd: string;
  erro?: boolean;
}

export default function Cep() {
  const toast = useToast();
  const [cep, setCep] = useState("");
  const [data, setData] = useState<ViaCep | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = (await res.json()) as ViaCep;
      if (json.erro) {
        toast("CEP não encontrado");
      } else {
        setData(json);
      }
    } catch {
      toast("Não consegui consultar o CEP agora");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Consulta CEP</h2>
        <p className="muted">Digite os 8 dígitos do CEP para localizar o endereço — útil para conferir o bairro na hora de cadastrar a tabela de preços.</p>
        <input
          className="mono"
          placeholder="00000-000"
          value={cep}
          maxLength={9}
          style={{ maxWidth: 180, padding: ".5rem .7rem", border: "1px solid var(--line)", borderRadius: "var(--r-sm)" }}
          onChange={(e) => {
            const v = e.target.value;
            setCep(v);
            lookup(v);
          }}
        />
        {loading && <p className="muted small" style={{ marginTop: ".5rem" }}>Consultando…</p>}
        {data && (
          <div className="split" style={{ marginTop: "1rem" }}>
            <div className="panel">
              <p><b>{data.logradouro || "—"}</b></p>
              <p>{data.bairro || "—"}</p>
              <p>{data.localidade} / {data.uf}</p>
              <p className="muted small">DDD {data.ddd}</p>
            </div>
            <iframe
              title="mapa"
              style={{ width: "100%", minHeight: 220, border: "1px solid var(--line)", borderRadius: "var(--r)" }}
              src={`https://www.google.com/maps?q=${encodeURIComponent(`${data.logradouro}, ${data.bairro}, ${data.localidade} ${data.uf}`)}&output=embed`}
            />
          </div>
        )}
      </div>
    </section>
  );
}
