import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import "../styles/landing.css";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import DocaLogo from "./DocaLogo";

type Aba = "in" | "up";

function LoginCard({ inicial = "in" }: { inicial?: Aba }) {
  const { signIn, signUp, esqueciSenha } = useAuth();
  const toast = useToast();
  const [aba, setAba] = useState<Aba>(inicial);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (aba === "up" && senha.length < 8) { toast("Use uma senha com pelo menos 8 caracteres."); return; }
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
    <div className="lp-card">
      <div className="lp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "in"} className={aba === "in" ? "on" : ""} onClick={() => setAba("in")}>Entrar</button>
        <button type="button" role="tab" aria-selected={aba === "up"} className={aba === "up" ? "on" : ""} onClick={() => setAba("up")}>Criar conta</button>
      </div>
      <form className="lp-form" onSubmit={enviar}>
        <label>E-mail
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Senha
          <input type="password" autoComplete={aba === "in" ? "current-password" : "new-password"} value={senha} onChange={(e) => setSenha(e.target.value)} minLength={aba === "up" ? 8 : undefined} required />
          {aba === "up" && <span className="lp-hint">Use pelo menos 8 caracteres.</span>}
        </label>
        <button className="lp-pill block" type="submit" disabled={busy}>
          {busy ? "Aguarde…" : aba === "in" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      {aba === "in" && (
        <p className="lp-hint">
          <a href="#esqueci" onClick={async (e) => {
            e.preventDefault();
            if (!email.trim()) { toast("Digite o seu e-mail acima e toque em “Esqueci a senha” de novo."); return; }
            const { error } = await esqueciSenha(email.trim());
            toast(error ? "Não consegui enviar agora: " + error.message : "Se este e-mail tiver conta, enviamos o link para criar uma nova senha.");
          }}>Esqueci a senha</a>
        </p>
      )}
      <p className="lp-hint">
        {aba === "in"
          ? "Ainda não tem acesso? "
          : "A conta só pode ser criada com um e-mail já liberado. Ainda não foi liberado? "}
        <a href="#acesso" data-fecha>Peça acesso</a>.
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
        <button className="lp-pill block" type="submit" disabled={busy || !aceite}>{busy ? "Enviando…" : "Enviar pedido"}</button>
      </form>
    </div>
  );
}

const PASSOS = [
  { t: "Exporte", d: "Baixe do JMS os relatórios que você já usa: Monitoramento de bipagem de entrega e Carta de porte." },
  { t: "Arraste", d: "Antes de importar, conferimos fuso, colunas, dias e pedidos repetidos. Se algo estiver estranho, avisamos e sugerimos o ajuste." },
  { t: "Decida", d: "Farol de cada base contra a sua meta, tendência e o que atacar primeiro, em linguagem de gerente." },
];

const RECURSOS = [
  { t: "Farol por base, com a sua meta", d: "Você define a meta. O Doca mostra verde, amarelo ou vermelho e se a base sobe ou cai contra o período anterior.", big: true },
  { t: "Sugestões do que melhorar", d: "Motoristas abaixo do alerta, carga desigual, motivos de problema, coleta, prazo e saída tardia, sempre com os números que as originaram." },
  { t: "Todas as bases num painel", d: "Saúde da empresa, ranking e a lista de bases que pedem atenção, com acesso direto a cada uma." },
  { t: "Arquivos conferidos", d: "Avisa de fuso errado, Carta de porte ausente e arquivo com vários dias. Dia incompleto é marcado, não zerado." },
  { t: "Equipe e permissões", d: "Gestor, operador e consulta. Um convite vale para todas as bases da empresa." },
  { t: "Fechamento de pagamento", d: "Preço por motorista e bairro, dias especiais e conferência antes de fechar." },
];

const FAQ = [
  { q: "Preciso de integração com o JMS?", a: "Não. Você exporta as planilhas como já faz e arrasta no Doca. Não pedimos a sua senha do JMS e não acessamos o sistema." },
  { q: "Quais arquivos funcionam?", a: "O Monitoramento de bipagem de entrega e a Carta de porte, em .xlsx ou .csv. Um relatório com bairro ou CEP do destinatário é opcional e libera a análise de rotas por bairro." },
  { q: "E se eu tiver várias bases?", a: "Envie um arquivo por base ou vários de uma vez. O Doca separa as bases pela coluna “Base de entrega”, mostra o que encontrou e pede a sua confirmação antes de criar." },
  { q: "Os números são confiáveis?", a: "Dependem dos arquivos que você envia. Por isso o Doca confere tudo antes de importar e marca como incompleto o dia sem Carta de porte." },
  { q: "As sugestões vêm de inteligência artificial?", a: "São regras aplicadas aos seus números, sempre com os dados que as originaram. Apontam onde olhar; a decisão continua sendo do gerente." },
  { q: "Quanto custa?", a: "Estamos em fase de testes, com acesso por convite. Peça acesso e conversamos." },
  { q: "O Doca é um produto da J&T?", a: "Não. O Doca é independente e não tem vínculo com a J&T Express. J&T e JMS são marcas de seus titulares." },
];

const BASES_EXEMPLO: [string, "verde" | "amarelo" | "vermelho", string, string][] = [
  ["Base Centro", "verde", "98,4%", "▲ 1,2"],
  ["Base Norte", "amarelo", "93,1%", "▬ 0,1"],
  ["Base Sul", "vermelho", "81,7%", "▼ 3,4"],
];
const SERIE = [88, 90, 89, 92, 94, 93, 96, 95, 97, 98];

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`lp-rv ${on ? "in" : ""} ${className}`}>{children}</div>;
}

function PainelExemplo() {
  const w = 300, h = 70, min = 85, max = 100;
  const pts = SERIE.map((v, i) => `${(i / (SERIE.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`).join(" ");
  return (
    <div className="lp-mock" role="img" aria-label="Exemplo ilustrativo do painel, com valores fictícios">
      <div className="lp-mock-bar"><i /><i /><i /><span>Exemplo ilustrativo · valores fictícios</span></div>
      <div className="lp-mock-body">
        <div className="lp-mock-hero">
          <small>Entregas no prazo</small>
          <b>96,2<em>%</em></b>
          <span className="lp-mock-meta">meta 95% · ▲ 1,8 p.p.</span>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div className="lp-mock-list">
          {BASES_EXEMPLO.map(([n, f, p, t]) => (
            <div className="lp-mock-row" key={n}>
              <span className={"lp-dot " + f} />
              <span>{n}</span>
              <b>{p}</b>
              <span className="mut">{t}</span>
            </div>
          ))}
          <div className="lp-mock-tip"><b>Faça primeiro:</b> Base Sul caiu 3,4 p.p. O motivo nº 1 é “Ausência do destinatário”. Avise o cliente antes da saída.</div>
        </div>
      </div>
    </div>
  );
}

function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="lp-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lp-modal-box lp-light" role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => (e.target as HTMLElement).closest("[data-fecha]") && onClose()}>
        <button className="lp-x" onClick={onClose} aria-label="Fechar">×</button>
        {children}
      </div>
    </div>
  );
}

export default function Landing() {
  const [modal, setModal] = useState<Aba | null>(null);
  const irAcesso = () => document.getElementById("acesso")?.scrollIntoView({ behavior: "smooth", block: "center" });
  // Endereços diretos para divulgar: /#cadastro (formulário de pedir acesso), /#entrar (login) e /#criar-conta.
  // Também aceita /cadastro e /entrar quando o servidor devolve a página inicial para endereços desconhecidos.
  useEffect(() => {
    const abrir = () => {
      const alvo = (location.hash.replace(/^#/, "") || location.pathname.replace(/^\//, "")).toLowerCase();
      if (alvo === "cadastro" || alvo === "acesso" || alvo === "pedir-acesso") setTimeout(irAcesso, 400);
      else if (alvo === "entrar" || alvo === "login") setModal("in");
      else if (alvo === "criar-conta") setModal("up");
    };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-wrap">
          <DocaLogo size={24} />
          <nav className="lp-nav" aria-label="Seções">
            <a href="#como">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <span className="spacer"></span>
          <button className="lp-link" onClick={() => setModal("in")}>Entrar</button>
          <button className="lp-pill sm" onClick={irAcesso}>Pedir acesso</button>
        </div>
      </header>

      <section className="lp-hero lp-dark">
        <div className="lp-wrap">
          <p className="lp-eyebrow">Para franqueados J&amp;T</p>
          <h1>A saúde da sua base.<br />Sem planilha.</h1>
          <p className="lp-sub">Arraste o que você já exporta do JMS. O Doca confere os arquivos, encontra as suas bases e mostra onde agir primeiro.</p>
          <div className="lp-cta">
            <button className="lp-pill" onClick={irAcesso}>Pedir acesso</button>
            <a className="lp-ghost" href="#como">Ver como funciona ›</a>
          </div>
          <p className="lp-note">Fase de testes, com acesso por convite.</p>
          <Reveal className="lp-stage"><PainelExemplo /></Reveal>
        </div>
      </section>

      <section className="lp-sec lp-light" id="como">
        <div className="lp-wrap">
          <Reveal><h2>Do arquivo ao diagnóstico.<br /><span>Em três passos.</span></h2></Reveal>
          <div className="lp-steps">
            {PASSOS.map((p, i) => (
              <Reveal key={p.t} className="lp-step">
                <span className="lp-n">{i + 1}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-dark" id="recursos">
        <div className="lp-wrap">
          <Reveal><h2>Tudo o que o gerente<br />e o dono precisam ver.</h2></Reveal>
          <div className="lp-bento">
            {RECURSOS.map((r) => (
              <Reveal key={r.t} className={"lp-tile" + (r.big ? " big" : "")}>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-light">
        <div className="lp-wrap">
          <Reveal><h2>Feito para quem<br /><span>opera a base.</span></h2></Reveal>
          <div className="lp-cols">
            <Reveal><h3>Dono de várias bases</h3><p>Veja qual base está no verde, qual cai e onde agir, sem pedir relatório a cada gerente.</p></Reveal>
            <Reveal><h3>Gerente de base</h3><p>Saiba quais motoristas precisam de apoio, quais motivos pesam e o que mudar em rota e horários.</p></Reveal>
            <Reveal><h3>Franqueado de uma base</h3><p>Saúde da operação e fechamento dos motoristas num lugar só.</p></Reveal>
            <Reveal><h3>Dados separados</h3><p>Cada empresa só enxerga as próprias bases. Acesso por convite e papel definido por você.</p></Reveal>
            <Reveal><h3>Você controla o envio</h3><p>O Doca não acessa o JMS. Só usa os arquivos que você exporta e escolhe enviar.</p></Reveal>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-light lp-faq" id="duvidas">
        <div className="lp-wrap narrow">
          <Reveal><h2>Dúvidas comuns</h2></Reveal>
          {FAQ.map((f) => (
            <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
          ))}
        </div>
      </section>

      <section className="lp-sec lp-dark lp-final">
        <div className="lp-wrap">
          <Reveal>
            <h2>Quer ver a saúde<br />da sua base?</h2>
            <p className="lp-sub">Peça acesso. Aprovado, você cria a conta, arrasta os arquivos e vê o primeiro diagnóstico.</p>
            <p className="lp-note">Já foi liberado? <button className="lp-link" onClick={() => setModal("up")}>Crie a sua conta</button> ou <button className="lp-link" onClick={() => setModal("in")}>entre</button>.</p>
          </Reveal>
          <div className="lp-light lp-formcard"><PedirAcesso /></div>
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

      {modal && (
        <Modal label="Entrar no Doca" onClose={() => setModal(null)}>
          <LoginCard inicial={modal} />
        </Modal>
      )}
    </div>
  );
}
