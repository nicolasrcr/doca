-- Doca — Fase 1 (preço hierárquico) e Fase 2 (conferência QR)
-- Rode este arquivo no SQL Editor do seu projeto Supabase (zpvbhwzoxmqtzghjicqf).
-- Ele só ADICIONA tabelas/colunas novas — não altera nada do que já existe.

-- ───────────────────────────────────────────────────────────
-- 1. Regras de preço hierárquicas (motorista → bairro → padrão da base)
-- ───────────────────────────────────────────────────────────
create table if not exists payment_rules (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  driver_id uuid references drivers(id) on delete cascade,      -- null = vale p/ todos os motoristas
  bairro text not null default '',                               -- '' = vale p/ todos os bairros
  amount numeric(10,2) not null,
  created_at timestamptz default now(),
  unique (base_id, driver_id, bairro)
);

-- ───────────────────────────────────────────────────────────
-- 2. Dias especiais (acréscimo por data exata ou dia da semana recorrente)
-- ───────────────────────────────────────────────────────────
create table if not exists special_days (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  day_date date,                 -- preenchido = acréscimo só nessa data
  weekday int,                   -- preenchido (0=dom..6=sáb) = acréscimo recorrente
  amount numeric(10,2) not null,
  label text,
  created_at timestamptz default now(),
  constraint special_days_kind check (
    (day_date is not null and weekday is null) or
    (day_date is null and weekday is not null)
  )
);
create unique index if not exists special_days_date_uq on special_days(base_id, day_date) where day_date is not null;
create unique index if not exists special_days_weekday_uq on special_days(base_id, weekday) where weekday is not null;

-- ───────────────────────────────────────────────────────────
-- 3. Descontos avulsos itemizados (motivo + valor), fora do fechamento
--    (o fechamento em si já guarda os ajustes dentro de payouts.items;
--     esta tabela é para descontos/vales lançados fora de um fechamento específico)
-- ───────────────────────────────────────────────────────────
create table if not exists driver_adjustments (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  data date not null default current_date,
  motivo text not null,
  valor numeric(10,2) not null,      -- negativo = desconto, positivo = bônus/adiantamento
  applied_payout_id uuid references payouts(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ───────────────────────────────────────────────────────────
-- 4. Progresso da Conferência QR (persistido, não só localStorage)
-- ───────────────────────────────────────────────────────────
create table if not exists qr_conference_sessions (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  label text not null default '',
  items jsonb not null default '[]',      -- [{code, driver, checked}]
  cursor int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ───────────────────────────────────────────────────────────
-- 5. RLS — mesmo padrão de is_org_member usado nas tabelas existentes
--    (membro da base lê; owner/editor escreve; leitor só leitura)
-- ───────────────────────────────────────────────────────────
alter table payment_rules enable row level security;
alter table special_days enable row level security;
alter table driver_adjustments enable row level security;
alter table qr_conference_sessions enable row level security;

create policy "membros leem payment_rules" on payment_rules for select
  using (exists (select 1 from base_members m where m.base_id = payment_rules.base_id and m.user_id = auth.uid()));
create policy "editores escrevem payment_rules" on payment_rules for all
  using (exists (select 1 from base_members m where m.base_id = payment_rules.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')))
  with check (exists (select 1 from base_members m where m.base_id = payment_rules.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')));

create policy "membros leem special_days" on special_days for select
  using (exists (select 1 from base_members m where m.base_id = special_days.base_id and m.user_id = auth.uid()));
create policy "editores escrevem special_days" on special_days for all
  using (exists (select 1 from base_members m where m.base_id = special_days.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')))
  with check (exists (select 1 from base_members m where m.base_id = special_days.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')));

create policy "membros leem driver_adjustments" on driver_adjustments for select
  using (exists (select 1 from base_members m where m.base_id = driver_adjustments.base_id and m.user_id = auth.uid()));
create policy "editores escrevem driver_adjustments" on driver_adjustments for all
  using (exists (select 1 from base_members m where m.base_id = driver_adjustments.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')))
  with check (exists (select 1 from base_members m where m.base_id = driver_adjustments.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')));

create policy "membros leem qr_conference_sessions" on qr_conference_sessions for select
  using (exists (select 1 from base_members m where m.base_id = qr_conference_sessions.base_id and m.user_id = auth.uid()));
create policy "editores escrevem qr_conference_sessions" on qr_conference_sessions for all
  using (exists (select 1 from base_members m where m.base_id = qr_conference_sessions.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')))
  with check (exists (select 1 from base_members m where m.base_id = qr_conference_sessions.base_id and m.user_id = auth.uid() and m.role in ('owner','editor')));

-- ───────────────────────────────────────────────────────────
-- 6. Colunas novas em `bases` (meta configurável e toggle de expurgo)
-- ───────────────────────────────────────────────────────────
alter table bases add column if not exists expurgar_insucessos boolean not null default false;
alter table bases add column if not exists stale_days int not null default 3;
