-- Plano e cobrança: o super-admin define plano, teste, limite de bases e link de pagamento por cliente.
-- Cliente sem linha aqui continua sem limite. Pagamento em si é externo (link Pix/cartão).
create table if not exists subscriptions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null default 'teste' check (char_length(plano) <= 40),
  status text not null default 'teste' check (status in ('teste','ativo','suspenso')),
  trial_ate date,
  limite_bases int check (limite_bases is null or limite_bases >= 0),
  link_pagamento text check (link_pagamento is null or link_pagamento ~ '^https://'),
  obs text check (char_length(obs) <= 500),
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
create policy "dono ve a propria assinatura" on subscriptions for select to authenticated using (owner_id = auth.uid() or is_super_admin());
create policy "super-admin cria assinatura" on subscriptions for insert to authenticated with check (is_super_admin());
create policy "super-admin altera assinatura" on subscriptions for update to authenticated using (is_super_admin()) with check (is_super_admin());

create or replace function checar_limite_de_bases() returns trigger
language plpgsql security definer set search_path = public as $$
declare s subscriptions; n int;
begin
  select * into s from subscriptions where owner_id = new.owner_id;
  if not found then return new; end if;
  if s.status = 'suspenso' then
    raise exception 'Seu acesso está suspenso. Fale com o suporte para regularizar.';
  end if;
  if s.limite_bases is not null then
    select count(*) into n from bases where owner_id = new.owner_id;
    if n >= s.limite_bases then
      raise exception 'Seu plano permite % base(s). Fale com o suporte para ampliar.', s.limite_bases;
    end if;
  end if;
  return new;
end $$;
revoke execute on function checar_limite_de_bases() from public, anon, authenticated;
create trigger bases_limite_do_plano before insert on bases for each row execute function checar_limite_de_bases();
