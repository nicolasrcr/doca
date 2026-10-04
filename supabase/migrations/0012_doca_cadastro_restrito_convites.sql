-- Cadastro restrito por lista de e-mails, convite pendente por empresa, "Minha empresa",
-- índices de chaves estrangeiras e ajustes de policies. Já aplicada no Supabase Doca.
-- Obs.: todas as checagens de papel são null-safe (coalesce) — quem não tem papel retorna NULL.

create table if not exists allowed_emails (
  email text primary key check (email = lower(email)),
  org_id uuid references organizations(id) on delete cascade,
  role text check (role in ('admin','editor','viewer')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
alter table allowed_emails enable row level security;
create policy "ver convites autorizados" on allowed_emails for select to authenticated
  using (is_super_admin() or (org_id is not null and org_role(org_id) = 'admin'));
create policy "remover convites autorizados" on allowed_emails for delete to authenticated
  using (is_super_admin() or (org_id is not null and org_role(org_id) = 'admin'));
-- quem já tem conta entra na lista antes de ligar o bloqueio
insert into allowed_emails (email) select lower(email) from auth.users where email is not null on conflict do nothing;

create or replace function guard_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'Este e-mail não está autorizado a criar conta. Peça acesso ao administrador.';
  end if;
  return new;
end $$;

create or replace function apply_pending_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into org_members (org_id, user_id, role)
  select a.org_id, new.id, coalesce(a.role, 'editor') from allowed_emails a
  where a.email = lower(new.email) and a.org_id is not null
  on conflict do nothing;
  return new;
end $$;

create or replace function allow_email(p_email text, p_org_id uuid default null, p_role text default 'editor') returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_cur uuid; v_has boolean;
begin
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'E-mail inválido.'; end if;
  if p_org_id is null then
    if not is_super_admin() then raise exception 'Só o administrador da plataforma pode autorizar e-mails sem organização.'; end if;
  elsif not (coalesce(org_role(p_org_id), '') = 'admin' or is_super_admin()) then
    raise exception 'Só o administrador da organização pode convidar pessoas.';
  end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'Papel inválido.'; end if;
  select org_id, true into v_cur, v_has from allowed_emails where email = v_email;
  if v_has and v_cur is not null and v_cur is distinct from p_org_id and not is_super_admin() then
    raise exception 'Este e-mail já foi reservado por outra organização.';
  end if;
  insert into allowed_emails (email, org_id, role, created_by) values (v_email, p_org_id, case when p_org_id is null then null else p_role end, auth.uid())
  on conflict (email) do update set org_id = excluded.org_id, role = excluded.role;
end $$;

create or replace function invite_to_org(p_org_id uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_uid uuid;
begin
  if not (coalesce(org_role(p_org_id), '') = 'admin' or is_super_admin()) then
    raise exception 'Só o administrador da organização pode convidar pessoas.';
  end if;
  if p_role not in ('admin','editor','viewer') then raise exception 'Papel inválido.'; end if;
  select id into v_uid from profiles where lower(email) = v_email;
  if v_uid is not null then
    insert into org_members (org_id, user_id, role) values (p_org_id, v_uid, p_role)
    on conflict (org_id, user_id) do update set role = excluded.role;
    return 'added';
  end if;
  perform allow_email(v_email, p_org_id, p_role);
  return 'pending';
end $$;

create or replace function create_my_organization(p_name text, p_base_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  if not is_super_admin() and exists (select 1 from organizations where created_by = auth.uid()) then
    raise exception 'Você já criou uma empresa.';
  end if;
  if p_base_id is not null and coalesce(base_role(p_base_id), '') <> 'owner' then
    raise exception 'Só o dono da base pode incluí-la na empresa.';
  end if;
  insert into organizations (name, created_by) values (trim(p_name), auth.uid()) returning id into v_org;
  insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'admin');
  if p_base_id is not null then
    update bases set org_id = v_org where id = p_base_id and org_id is null;
  end if;
  return v_org;
end $$;

-- versões null-safe das funções de organização da 0010
create or replace function invite_org_member(p_org_id uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not (coalesce(org_role(p_org_id), '') = 'admin' or is_super_admin()) then
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
  if not (coalesce(org_role(p_org_id), '') = 'admin' or is_super_admin()) then
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

create or replace function guard_base_org_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is distinct from old.org_id and not is_super_admin() then
    if coalesce(base_role(old.id), '') <> 'owner' or (new.org_id is not null and coalesce(org_role(new.org_id), '') <> 'admin') then
      raise exception 'Sem permissão para mover esta base de organização.';
    end if;
  end if;
  return new;
end $$;

revoke execute on function guard_signup(), apply_pending_invite(), allow_email(text,uuid,text), invite_to_org(uuid,text,text), create_my_organization(text,uuid) from public, anon, authenticated;
grant execute on function allow_email(text,uuid,text), invite_to_org(uuid,text,text), create_my_organization(text,uuid) to authenticated;
create trigger trg_apply_pending_invite after insert on auth.users for each row execute function apply_pending_invite();
create trigger trg_a_guard_signup before insert on auth.users for each row execute function guard_signup();

-- funções de papel só para usuários logados
revoke execute on function base_role(uuid), is_base_member(uuid) from public, anon;
grant execute on function base_role(uuid), is_base_member(uuid) to authenticated;

-- índices de chaves estrangeiras
create index if not exists base_members_user_id_idx on base_members(user_id);
create index if not exists bases_owner_id_idx on bases(owner_id);
create index if not exists drivers_base_id_idx on drivers(base_id);
create index if not exists payouts_base_id_idx on payouts(base_id);
create index if not exists org_members_user_id_idx on org_members(user_id);
create index if not exists organizations_created_by_idx on organizations(created_by);
create index if not exists payment_rules_driver_id_idx on payment_rules(driver_id);
create index if not exists driver_adjustments_base_id_idx on driver_adjustments(base_id);
create index if not exists driver_adjustments_driver_id_idx on driver_adjustments(driver_id);
create index if not exists driver_adjustments_payout_idx on driver_adjustments(applied_payout_id);
create index if not exists driver_adjustments_created_by_idx on driver_adjustments(created_by);
create index if not exists qr_sessions_base_id_idx on qr_conference_sessions(base_id);
create index if not exists qr_sessions_created_by_idx on qr_conference_sessions(created_by);
create index if not exists allowed_emails_org_id_idx on allowed_emails(org_id);

-- auth.uid() avaliado uma vez por consulta
alter policy "see own profile" on profiles using (id = (select auth.uid()));
alter policy "see profiles of base co-members" on profiles using (exists (
  select 1 from base_members m1 join base_members m2 on m1.base_id = m2.base_id
  where m1.user_id = (select auth.uid()) and m2.user_id = profiles.id));
alter policy "profiles: co-membros da organizacao e super-admin" on profiles using (
  is_super_admin() or exists (select 1 from org_members a join org_members b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
alter policy "authenticated can insert base" on bases with check ((select auth.uid()) is not null and (org_id is null or org_role(org_id) = 'admin' or is_super_admin()));
alter policy "owner can read own base" on bases using (owner_id = (select auth.uid()));
