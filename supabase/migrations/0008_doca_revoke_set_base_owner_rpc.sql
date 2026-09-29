-- set_base_owner() só deve rodar como gatilho (BEFORE INSERT em bases), nunca chamada direto
-- pela API (o linter de segurança do Supabase acusou a rota pública /rpc/set_base_owner).
revoke execute on function public.set_base_owner() from public, anon, authenticated;
