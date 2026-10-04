-- Metas por motorista e por dia da semana, resumo diário, plano de ação e link de leitura do motorista.
alter table drivers add column if not exists meta numeric check (meta is null or (meta between 50 and 100));
alter table bases add column if not exists metas_semana jsonb not null default '{}';
alter table bases add column if not exists resumo_diario boolean not null default false;

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 3 and 200),
  detalhe text check (char_length(detalhe) <= 1000),
  responsavel text check (char_length(responsavel) <= 120),
  prazo date,
  status text not null default 'aberta' check (status in ('aberta','feita')),
  origem text,
  baseline numeric,
  done_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists action_items_base_idx on action_items (base_id, created_at desc);
alter table action_items enable row level security;
create policy "membros veem plano de acao" on action_items for select to authenticated using (coalesce(base_role(base_id), '') <> '');
create policy "editores criam plano de acao" on action_items for insert to authenticated with check (coalesce(base_role(base_id), '') in ('owner','editor') and created_by = auth.uid());
create policy "editores editam plano de acao" on action_items for update to authenticated using (coalesce(base_role(base_id), '') in ('owner','editor')) with check (coalesce(base_role(base_id), '') in ('owner','editor'));
create policy "editores removem plano de acao" on action_items for delete to authenticated using (coalesce(base_role(base_id), '') in ('owner','editor'));

create table if not exists driver_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  driver_name text not null check (char_length(driver_name) between 1 and 120),
  revoked boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table driver_links enable row level security;
create policy "editores veem links de motorista" on driver_links for select to authenticated using (coalesce(base_role(base_id), '') in ('owner','editor'));
create policy "editores criam links de motorista" on driver_links for insert to authenticated with check (coalesce(base_role(base_id), '') in ('owner','editor') and created_by = auth.uid());
create policy "editores revogam links de motorista" on driver_links for update to authenticated using (coalesce(base_role(base_id), '') in ('owner','editor')) with check (coalesce(base_role(base_id), '') in ('owner','editor'));

-- Leitura pública do próprio resultado: só quem tem o link (token) vê, e só os dados daquele motorista.
create or replace function driver_view(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare l driver_links; b bases; dias jsonb; pag jsonb; mmeta numeric;
begin
  select * into l from driver_links where token = p_token and not revoked;
  if not found then return null; end if;
  select * into b from bases where id = l.base_id;
  select dr.meta into mmeta from drivers dr where dr.base_id = l.base_id and dr.name = l.driver_name limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('data', d.data, 't', (m->>'t')::int, 'e', (m->>'e')::int, 'p', (m->>'p')::int) order by d.data), '[]'::jsonb)
    into dias
  from days d, jsonb_array_elements(d.motoristas) m
  where d.base_id = l.base_id and d.data >= current_date - 30 and coalesce(d.carta_ok, true) and m->>'n' = l.driver_name;
  select jsonb_build_object('inicio', p.period_start, 'fim', p.period_end, 'entregas', (i->>'deliveries')::int, 'liquido', (i->>'net')::numeric)
    into pag
  from payouts p, jsonb_array_elements(p.items) i
  where p.base_id = l.base_id and p.status = 'fechado' and i->>'driver' = l.driver_name
  order by p.period_end desc limit 1;
  return jsonb_build_object('base', b.name, 'motorista', l.driver_name, 'meta', coalesce(mmeta, b.meta, 95), 'dias', dias, 'pagamento', pag);
end $$;
revoke execute on function driver_view(uuid) from public, anon, authenticated;
grant execute on function driver_view(uuid) to anon, authenticated;
