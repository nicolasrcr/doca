import { useState, type FormEvent } from "react";
import "../styles/landing.css";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import DocaLogo from "./DocaLogo";

type Aba = "in" | "up";

function LoginCard() {
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const [aba, setAba] = useState<Aba>("in");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = aba === "in" ? await signIn(email, senha) : await signUp(email, senha);
    setBusy(false);
    if (error) {
      const bloqueado = /autorizado|Database error saving new user/i.test(error.message);
      toast(
        aba === "up" && bloqueado
          ? "Este e-mail ainda não foi liberado. Use “Pedir acesso” e aguarde a aprovação."
          : /Invalid login credentials/i.test(error.message)
            ? "E-mail ou senha incorretos."
            : error.message
      );
    } else if (aba === "up") {
      toast("Conta criada. Se o seu projeto exigir confirmação de e-mail, confira sua caixa de entrada.");
    }
  };

  return (
    <div className="lp-card" id="entrar">
      <div className="lp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "in"} className={aba === "in" ? "on" : ""} onClick={() => setAba("in")}>Entrar</button>
        <button type="button" role="tab" aria-selected={aba === "up"} className={aba === "up" ? "on" : ""} onClick={() => setAba("up")}>Criar conta</button>
      </div>
      <form className="lp-form" onSubmit={enviar}>
        <label>E-mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Senha
          <input type="password" autoComplete={aba === "in" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />
        </label>
        <button className="lp-btn primary lg" type="submit" disabled={busy}>
          {busy ? "Aguarde…" : aba === "in" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <p className="lp-hint">
        {aba === "in"
          ? "Ainda não tem acesso? "
          : "A conta só pode ser criada com um e-mail já liberado. Ainda não foi liberado? "}
        <a href="#acesso">Peça acesso</a>.
      </p>
    </div>
  );
}

function PedirAcesso() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [fone, setFone] = useState("");
  const [bases, setBases] = useState("1");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [armadilha, setArmadilha] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (armadilha) return; // robô: o campo escondido veio preenchido
    setBusy(true);
    const { error } = await supabase.rpc("request_access", {
      p_nome: nome,
      p_email: email,
      p_telefone: fone || null,
      p_bases: Number(bases) || null,
      p_mensagem: msg || null,
    });
    setBusy(false);
    if (error) setErro(error.message);
    else setOk(true);
  };

  if (ok) {
    return (
      <div className="lp-card" id="acesso">
        <div className="lp-ok">
          <b>Pedido recebido.</b> Vamos avaliar e, quando for aprovado, o seu e-mail fica liberado para criar a conta em “Entrar → Criar conta”.
          Se você já foi liberado, pode criar a conta agora.
        </div>
      </div>
    );
  }

  return (
    <div className="lp-card" id="acesso">
      <h3 style={{ marginTop: 0 }}>Pedir acesso</h3>
      <p className="lp-hint" style={{ marginTop: 0, marginBottom: ".9rem" }}>Estamos em fase de testes, com acesso por convite. Conte um pouco sobre a sua operação.</p>
      <form className="lp-form" onSubmit={enviar}>
        <label>Seu nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
        </label>
        <label>E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required />
        </label>
        <label>WhatsApp (opcional)
          <input type="tel" value={fone} onChange={(e) => setFone(e.target.value)} maxLength={40} placeholder="(61) 99999-9999" />
        </label>
        <label>Quantas bases você tem?
          <select value={bases} onChange={(e) => setBases(e.target.value)}>
            <option value="1">1 base</option>
            <option value="3">2 a 5 bases</option>
            <option value="8">6 a 10 bases</option>
            <option value="15">Mais de 10 bases</option>
          </select>
        </label>
        <label>Quer contar mais? (opcional)
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} />
        </label>
        <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} name="site" />
        <label style={{ display: "flex", gap: ".5rem", alignItems: "flex-start", fontWeight: 400 }}>
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} required style={{ width: "auto", marginTop: ".2rem" }} />
          <span>Concordo em ser contatado por e-mail ou WhatsApp sobre o meu pedido. Uso seus dados só para isso.</span>
        </label>
        {erro && <div className="warnbox">{erro}</div>}
        <button className="lp-btn primary lg" type="submit" disabled={busy || !aceite}>{busy ? "Enviando…" : "Enviar pedido"}</button>
      </form>
    </div>
  );
}

const PASSOS = [
  { t: "Exporte do JMS", d: "Baixe o Monitoramento de bipagem de entrega e a Carta de porte, do jeito que você já faz hoje." },
  { t: "Arraste no Doca", d: "Antes de importar, conferimos o fuso dos horários, as colunas, os dias e os pedidos repetidos. Se algo estiver estranho, avisamos e sugerimos o ajuste." },
  { t: "Veja a saúde da operação", d: "Farol de cada base contra a sua meta, tendência e o que atacar primeiro, em linguagem de gerente." },
];

const RECURSOS = [
  { t: "Farol por base, com a sua meta", d: "Você define a meta de cada base. O Doca mostra verde, amarelo ou vermelho e se a base está subindo ou caindo em relação ao período anterior." },
  { t: "Sugestões do que melhorar", d: "Motoristas abaixo do alerta, carga desigual, motivos de problema mais frequentes, coleta, prazo, entregas noturnas e saída tardia. Cada sugestão traz os números que a originaram." },
  { t: "Todas as bases num só painel", d: "Para quem tem mais de uma base: saúde da empresa, ranking, tendência por dia e a lista de bases que precisam de atenção, com acesso direto a cada uma." },
  { t: "Conferência dos arquivos", d: "Avisa quando os horários parecem estar em outro fuso, quando falta a Carta de porte ou quando o arquivo mistura vários dias. Sem a Carta de porte, o dia fica marcado como incompleto em vez de mostrar números errados." },
  { t: "Equipe e permissões", d: "Gestor, operador e consulta. Convide pelo e-mail uma única vez e o acesso vale para todas as bases da empresa." },
  { t: "Fechamento de pagamento", d: "Preço por motorista e bairro, dias especiais, descontos e conferência antes de fechar. O fechamento não é gerado com dias de dados incompletos." },
];

const FAQ = [
  { q: "Preciso de integração com o JMS?", a: "Não. Você exporta as planilhas como já faz e arrasta no Doca. Não pedimos a sua senha do JMS e não acessamos o sistema." },
  { q: "Quais arquivos funcionam?", a: "O Monitoramento de bipagem de entrega e a Carta de porte, em .xlsx ou .csv. Um relatório com o bairro ou CEP do destinatário é opcional e libera a análise de rotas por bairro." },
  { q: "E se eu tiver várias bases?", a: "Pode enviar um arquivo por base ou vários de uma vez. O Doca separa as bases pela coluna “Base de entrega”, mostra o que encontrou e pede a sua confirmação antes de criar." },
  { q: "Os números são confiáveis?", a: "Eles dependem dos arquivos que você envia. Por isso o Doca confere os arquivos antes de importar e marca como incompleto o dia que estiver sem a Carta de porte." },
  { q: "As sugestões vêm de inteligência artificial?", a: "São regras aplicadas aos seus números, sempre com os dados que as originaram. Elas apontam onde olhar; a decisão de mudar rota ou motorista continua sendo do gerente." },
  { q: "Quanto custa?", a: "Estamos em fase de testes, com acesso por convite. Peça acesso e conversamos." },
  { q: "O Doca é um produto da J&T?", a: "Não. O Doca é independente e não tem vínculo com a J&T Express. J&T e JMS são marcas de seus titulares." },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-wrap">
          <DocaLogo size={26} />
          <nav className="lp-nav" aria-label="Seções">
            <a href="#como">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <span className="spacer"></span>
          <a className="lp-btn" href="#entrar">Entrar</a>
          <a className="lp-btn primary" href="#acesso">Pedir acesso</a>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap">
          <div>
            <span className="lp-kicker">Para franqueados J&amp;T</span>
            <h1>Saiba a saúde da sua base sem montar planilha.</h1>
            <p className="lp-sub">
              Arraste as planilhas que você já exporta do JMS. O Doca confere os arquivos, encontra as suas bases e mostra, num painel simples,
              onde a operação está bem e onde ela precisa de ação.
            </p>
            <div className="lp-cta">
              <a className="lp-btn primary lg" href="#acesso">Pedir acesso</a>
              <a className="lp-btn lg" href="#como">Ver como funciona</a>
            </div>
            <p className="lp-note">Fase de testes, com acesso por convite.</p>
          </div>
          <LoginCard />
        </div>
      </section>

      <section className="lp-sec alt" id="como">
        <div className="lp-wrap">
          <h2>Do arquivo ao diagnóstico em três passos</h2>
          <p className="lp-lead">Sem integração, sem instalar nada. Você continua exportando do JMS e o Doca faz o resto.</p>
          <div className="lp-grid g3">
            {PASSOS.map((p, i) => (
              <div className="lp-item" key={p.t}>
                <span className="lp-num">{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </div>
            ))}
          </div>

          <div className="lp-demo" aria-label="Exemplo ilustrativo do painel">
            <div className="lp-demo-top">
              <b>Saúde da operação</b>
              <span className="lp-demo-tag">Exemplo ilustrativo, valores fictícios</span>
            </div>
            {[
              ["verde", "Base Centro", "98,4%", "▲ 1,2 p.p."],
              ["amarelo", "Base Norte", "93,1%", "▬ 0,1 p.p."],
              ["vermelho", "Base Sul", "81,7%", "▼ 3,4 p.p."],
            ].map(([f, n, p, t]) => (
              <div className="lp-demo-row" key={n}>
                <span className={"lp-dot " + f} aria-label={f} />
                <span>{n}</span>
                <b>{p}</b>
                <span className="mut lp-hide-s">{t}</span>
              </div>
            ))}
            <div className="lp-tip">
              <b>O que fazer primeiro:</b> Base Sul caiu 3,4 p.p. e o motivo número 1 é “Ausência do destinatário”. Avise o cliente antes da saída e reagende a visita no mesmo dia.
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec" id="recursos">
        <div className="lp-wrap">
          <h2>Tudo o que o gerente e o dono precisam ver</h2>
          <p className="lp-lead">Do dia a dia da base à visão da empresa inteira, a partir dos mesmos arquivos.</p>
          <div className="lp-grid g3">
            {RECURSOS.map((r) => (
              <div className="lp-item" key={r.t}>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap">
          <h2>Feito para quem opera a base</h2>
          <div className="lp-grid g3" style={{ marginTop: "1.4rem" }}>
            <div className="lp-item"><h3>Dono de várias bases</h3><p>Veja qual base está no verde, qual está caindo e onde agir, sem pedir relatório para cada gerente.</p></div>
            <div className="lp-item"><h3>Gerente de base</h3><p>Saiba quais motoristas precisam de apoio, quais motivos de problema mais pesam e o que mudar na rota e nos horários.</p></div>
            <div className="lp-item"><h3>Franqueado de uma base</h3><p>Tenha a saúde da operação e o fechamento dos motoristas num lugar só, sem montar planilha todo dia.</p></div>
          </div>
          <div className="lp-grid g2" style={{ marginTop: "1.4rem" }}>
            <div className="lp-item"><h3>Seus dados ficam separados</h3><p>Cada empresa só enxerga as próprias bases. O acesso é por convite e cada pessoa tem o papel que você definir.</p></div>
            <div className="lp-item"><h3>Você controla o que envia</h3><p>O Doca não acessa o JMS. Só trabalha com os arquivos que você mesmo exporta e escolhe enviar.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-faq" id="duvidas">
        <div className="lp-wrap">
          <h2>Dúvidas comuns</h2>
          <div style={{ marginTop: "1.2rem", maxWidth: 760 }}>
            {FAQ.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final lp-sec alt">
        <div className="lp-wrap">
          <div>
            <h2>Quer ver a saúde da sua base?</h2>
            <p className="lp-lead" style={{ marginBottom: "1rem" }}>
              Peça acesso. Assim que for aprovado, você cria a conta, arrasta os arquivos do JMS e vê o primeiro diagnóstico.
            </p>
            <p className="lp-hint">Já foi liberado? <a href="#entrar">Entre ou crie a sua conta</a>.</p>
          </div>
          <PedirAcesso />
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div><b>Doca</b> · Gestão e análise para franqueados de entrega.</div>
          <div>
            O Doca é um produto independente e não tem vínculo, parceria ou endosso da J&amp;T Express. J&amp;T e JMS são marcas de seus respectivos titulares,
            citadas apenas para indicar a origem dos relatórios que o franqueado já exporta.
          </div>
          <div>As sugestões são calculadas a partir dos arquivos enviados e não substituem a decisão do gerente.</div>
        </div>
      </footer>
    </div>
  );
}
