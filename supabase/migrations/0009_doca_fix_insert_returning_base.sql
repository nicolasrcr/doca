-- insert(...).select() avalia a policy de SELECT na linha recém-criada, antes de o
-- trigger handle_new_base() registrar o dono em base_members. Sem esta policy, a leitura
-- do retorno falha com "violates row-level security policy" mesmo com o insert permitido.
create policy "owner can read own base" on public.bases
  for select to authenticated
  using (owner_id = auth.uid());
