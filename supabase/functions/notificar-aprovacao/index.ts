import { createClient } from "npm:@supabase/supabase-js@2";

// Envia o e-mail de convite quando o super-admin aprova um pedido de acesso.
// Só o super-admin autenticado pode chamar; o e-mail precisa já estar liberado em allowed_emails.
const ORIGENS = ["https://waiternowapp.com", "https://www.waiternowapp.com"];

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ORIGENS.includes(origin) ? origin : ORIGENS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return out({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: isSuper, error: eSuper } = await caller.rpc("is_super_admin");
  if (eSuper || !isSuper) return out({ error: "Só o administrador da plataforma pode fazer isso." }, 403);

  let email = "";
  try {
    email = String((await req.json()).email ?? "").trim().toLowerCase();
  } catch {
    return out({ error: "Pedido inválido." }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return out({ error: "E-mail inválido." }, 400);

  const admin = createClient(url, service);
  const { data: liberado } = await admin.from("allowed_emails").select("email").eq("email", email).maybeSingle();
  if (!liberado) return out({ error: "Este e-mail ainda não foi liberado." }, 400);

  const redirectTo = origin && ORIGENS.includes(origin) ? origin : undefined;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return out({ status: "ja_cadastrado" });
    return out({ error: error.message }, 502);
  }
  return out({ status: "enviado" });
});
