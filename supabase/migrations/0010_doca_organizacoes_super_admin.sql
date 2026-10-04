-- Doca — organizações (tenants) e super-admin da plataforma.
--  * Organização = grupo de bases de um parceiro; o papel na organização vale para todas as bases dela.
--  * Super-admin = login master da plataforma: vê e gerencia tudo e cria organizações.
-- Reaproveita base_role()/is_base_member(), já usadas pelas policies de days, drivers, occurrences e payouts.

-- 1. Super-admins (sem policies: inacessível pela API; só as funções abaixo leem)
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table platform_admins enable row level security;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- 2. Organizações e membros
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','editor','viewer')),
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table bases add column if not exists org_id uuid references organizations(id) on delete set null;
create index if not exists bases_org_id_idx on bases(org_id);

create or replace function org_role(o_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from org_members where org_id = o_id and user_id = auth.uid();
$$;
create or replace function is_org_member(o_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select org_role(o_id) is not null or is_super_admin();
$$;

-- 3. Papel efetivo na base = maior entre: super-admin, membro direto e papel na organização da base
create or replace function base_role(b_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case max(rank) when 3 then 'owner' when 2 then 'editor' when 1 then 'viewer' end
  from (
    select 3 as rank where is_super_admin()
    union all
    select case m.role when 'owner' then 3 when 'editor' then 2 else 1 end
      from base_members m where m.base_id = b_id and m.user_id = auth.uid()
    union all
    select case om.role when 'admin' then 3 when 'editor' then 2 else 1 end
      from bases b join org_members om on om.org_id = b.org_id
      where b.id = b_id and om.user_id = auth.uid()
  ) t;
$$;
create or replace function is_base_member(b_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select base_role(b_id) is not null;
$$;

-- 4. Policies de organizações
create policy "ver propria organizacao" on organizations for select to authenticated
  using (is_org_member(id));
create policy "ver membros da organizacao" on org_members for select to authenticated
  using (is_org_member(org_id));
-- (escrita só pelas RPCs abaixo)

-- perfis: colegas de organização e, para o super-admin, todos
create policy "profiles: co-membros da organizacao e super-admin" on profiles for select to authenticated
  using (
    is_super_admin()
    or exists (select 1 from org_members a join org_members b on a.org_id = b.org_id
               where a.user_id = auth.uid() and b.user_id = profiles.id)
  );

-- 5. Tabelas da fase 1 passam a usar o papel efetivo (inclui organização e super-admin)
alter policy "membros leem payment_rules" on payment_rules using (is_base_member(base_id));
alter policy "editores escrevem payment_rules" on payment_rules using (base_role(base_id) in ('owner','editor')) with check (base_role(base_id) in ('owner','editor'));
alter policy "membros leem special_days" on special_days using (is_base_member(base_id));
alter policy "editores escrevem special_days" on special_days using (base_role(base_id) in ('owner','editor')) with check (base_role(base_id) in ('owner','editor'));
alter policy "membros leem driver_adjustments" on driver_adjustments using (is_base_member(base_id));
alter policy "editores escrevem driver_adjustments" on driver_adjustments using (base_role(base_id) in ('owner','editor')) with check (base_role(base_id) in ('owner','editor'));
alter policy "membros leem qr_conference_sessions" on qr_conference_sessions using (is_base_member(base_id));
alter policy "editores escrevem qr_conference_sessions" on qr_conference_sessions using (base_role(base_id) in ('owner','editor')) with check (base_role(base_id) in ('owner','editor'));

-- 6. Criar base: dentro de uma organização só o admin dela (ou o super-admin)
alter policy "authenticated can insert base" on bases
  with check (auth.uid() is not null and (org_id is null or org_role(org_id) = 'admin' or is_super_admin()));

-- mover base entre organizações: só dono efetivo, e só para organização onde seja admin
create or replace function guard_base_org_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is distinct from old.org_id and not is_super_admin() then
    if base_role(old.id) <> 'owner' or (new.org_id is not null and org_role(new.org_id) is distinct from 'admin') then
      raise exception 'Sem permissão para mover esta base de organização.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_base_org before update of org_id on bases
  for each row execute function guard_base_org_change();

-- 7. RPCs de organização
create or replace function create_organization(p_name text, p_admin_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid;
begin
  if not is_super_admin() then raise exception 'Só o administrador da plataforma pode criar organizações.'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Informe o nome da organização.'; end if;
  select id into v_uid from profiles where lower(email) = lower(trim(p_admin_email));
  if v_uid is null then
    raise exception 'Não encontrei ninguém com esse e-mail. Peça para essa pessoa criar uma conta no Doca primeiro.';
  end if;
  insert into organizations (name, created_by) values (trim(p_name), auth.uid()) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, v_uid, 'admin');
  return v_org;
end $$;

create or replace function invite_org_member(p_org_id uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (org_role(p_org_id) = 'admin' or is_super_admin()) then
    raise exception 'Só o administrador da organização pode convidar pessoas.';
  end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'Papel inválido.'; end if;
  select id into v_uid from profiles where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'Não encontrei ninguém com esse e-mail. Peça para essa pessoa criar uma conta no Doca primeiro.';
  end if;
  insert into org_members (org_id, user_id, role) values (p_org_id, v_uid, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
end $$;

create or replace function update_org_member_role(p_org_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (org_role(p_org_id) = 'admin' or is_super_admin()) then
    raise exception 'Só o administrador da organização pode alterar papéis.';
  end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'Papel inválido.'; end if;
  if p_role <> 'admin' and not exists (
    select 1 from org_members where org_id = p_org_id and role = 'admin' and user_id <> p_user_id
  ) then
    raise exception 'A organização precisa ter pelo menos um administrador.';
  end if;
  update org_members set role = p_role where org_id = p_org_id and user_id = p_user_id;
end $$;

-- remover membro: delete direto pela API, autorizado por policy; o trigger protege o último admin
create policy "admin remove membros da organizacao" on org_members for delete to authenticated
  using (org_role(org_id) = 'admin' or is_super_admin());
create or replace function guard_last_org_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and old.role = 'admin' and not exists (
    select 1 from org_members where org_id = old.org_id and role = 'admin' and user_id <> old.user_id
  ) then
    raise exception 'A organização precisa ter pelo menos um administrador.';
  end if;
  return old;
end $$;
create trigger trg_guard_last_org_admin before delete on org_members
  for each row execute function guard_last_org_admin();

-- invite_member/update/remove por base: dono efetivo (inclui admin da organização e super-admin) já passa
-- pela checagem base_role(...) = 'owner' existente.

-- 8. Permissões de execução: só usuários logados
revoke execute on function is_super_admin(), org_role(uuid), is_org_member(uuid),
  create_organization(text,text), invite_org_member(uuid,text,text),
  update_org_member_role(uuid,uuid,text), guard_base_org_change(), guard_last_org_admin()
  from public, anon;
grant execute on function is_super_admin(), org_role(uuid), is_org_member(uuid),
  create_organization(text,text), invite_org_member(uuid,text,text),
  update_org_member_role(uuid,uuid,text) to authenticated;
revoke execute on function guard_base_org_change(), guard_last_org_admin() from authenticated;

-- 9. Primeiro super-admin
insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'nicolasrcr@gmail.com'
on conflict do nothing;
