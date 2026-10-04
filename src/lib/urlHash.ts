// Guarda o tipo do link de e-mail (convite ou recuperação de senha) ANTES de o cliente do Supabase limpar o endereço.
const h = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.replace(/^#/, "")) : new URLSearchParams();
export const TIPO_LINK = h.get("type");
export const LINK_PEDE_SENHA = TIPO_LINK === "invite" || TIPO_LINK === "recovery";
