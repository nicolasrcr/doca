-- Auditoria (quem fez o quê), histórico de importações e status da conferência QR.
-- audit_logs: só o dono da base (e o super-admin) lê; editores e donos registram.
-- import_batches: qualquer membro lê o histórico; editores e donos registram.
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_email text,
  action text not null check (char_length(action) between 2 and 60),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_base_idx on audit_logs (base_id, created_at desc);
alter table audit_logs enable row level security;
create policy "dono ve auditoria" on audit_logs for select to authenticated
  using (coalesce(base_role(base_id), '') = 'owner' or is_super_admin());
create policy "editores registram auditoria" on audit_logs for insert to authenticated
  with check (user_id = auth.uid() and coalesce(base_role(base_id), '') in ('owner','editor'));

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  base_id uuid not null references bases(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_email text,
  data date,
  arquivos jsonb not null default '[]',
  total int not null default 0,
  entregues int not null default 0,
  divergencias int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists import_batches_base_idx on import_batches (base_id, created_at desc);
alter table import_batches enable row level security;
create policy "membros veem importacoes" on import_batches for select to authenticated
  using (coalesce(base_role(base_id), '') <> '');
create policy "editores registram importacoes" on import_batches for insert to authenticated
  with check (user_id = auth.uid() and coalesce(base_role(base_id), '') in ('owner','editor'));

alter table qr_conference_sessions add column if not exists status text not null default 'ativa';
