import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { LINK_PEDE_SENHA } from "../lib/urlHash";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [precisaSenha, setPrecisaSenha] = useState(LINK_PEDE_SENHA);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setPrecisaSenha(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    signIn: (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string) => supabase.auth.signUp({ email, password }),
    signOut: () => supabase.auth.signOut(),
    precisaSenha,
    // define (ou troca) a senha de quem entrou por convite, link de recuperação ou já está logado
    definirSenha: async (senha: string) => {
      const r = await supabase.auth.updateUser({ password: senha });
      if (!r.error) setPrecisaSenha(false);
      return r;
    },
    esqueciSenha: (email: string) => supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
  };
}
