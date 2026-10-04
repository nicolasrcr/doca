-- Falha de autorização: base_role() retorna NULL para quem não tem vínculo, e
-- "NULL <> 'owner'" é NULL, então o IF das RPCs não disparava e qualquer usuário logado
-- conseguia convidar/alterar membros de QUALQUER base. Agora a checagem é null-safe.
create or replace function public.invite_member(p_base_id uuid, p_email text, p_role text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  target_id uuid;
begin
  if coalesce(base_role(p_base_id), '') <> 'owner' then
    raise exception 'Só o dono da base pode convidar membros.';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Papel inválido.';
  end if;
  select id into target_id from public.profiles where lower(email) = lower(p_email);
  if target_id is null then
    raise exception 'Não encontrei ninguém com esse e-mail. Peça para essa pessoa criar uma conta no Doca primeiro.';
  end if;
  insert into public.base_members(base_id, user_id, role) values (p_base_id, target_id, p_role)
    on conflict (base_id, user_id) do update set role = excluded.role where base_members.role <> 'owner';
end; $function$;

create or replace function public.update_member_role(p_base_id uuid, p_user_id uuid, p_role text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(base_role(p_base_id), '') <> 'owner' then
    raise exception 'Só o dono da base pode alterar papéis.';
  end if;
  if p_role not in ('editor','viewer') then
    raise exception 'Papel inválido.';
  end if;
  update public.base_members set role = p_role where base_id = p_base_id and user_id = p_user_id and role <> 'owner';
end; $function$;

-- remove_member tinha a mesma falha. A remoção passa a ser um delete direto na tabela,
-- autorizado pela policy "owner manages members" (base_role(base_id) = 'owner').
revoke execute on function public.remove_member(uuid, uuid) from public, anon, authenticated;
