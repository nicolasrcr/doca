-- Fila de pedidos de acesso enviados pela página pública. Visitantes só conseguem ENVIAR um pedido
-- (função request_access); apenas o super-admin lê a fila e aprova/recusa (decide_access_request).
-- Aprovar libera o e-mail em allowed_emails, que é o que permite criar a conta (cadastro restrito).
create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  email text not null check (email = lower(email) and char_length(email) between 5 and 200),
  telefone text check (char_length(telefone) <= 40),
  bases int check (bases between 0 and 500),
  mensagem text check (char_length(mensagem) <= 500),
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (email)
);
alter table access_requests enable row level security;
create policy "super-admin ve pedidos de acesso" on access_requests for select to authenticated using (is_super_admin());

create or replace function request_access(p_nome text, p_email text, p_telefone text default null, p_bases int default null, p_mensagem text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_nome text := trim(coalesce(p_nome, ''));
begin
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Informe seu nome.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'Informe um e-mail válido.'; end if;
  if (select count(*) from access_requests where status = 'pendente') >= 500
     or (select count(*) from access_requests where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Recebemos muitos pedidos agora. Tente de novo em alguns minutos.';
  end if;
  insert into access_requests (nome, email, telefone, bases, mensagem)
  values (v_nome, v_email, left(nullif(trim(coalesce(p_telefone, '')), ''), 40),
          case when p_bases between 0 and 500 then p_bases end, left(nullif(trim(coalesce(p_mensagem, '')), ''), 500))
  on conflict (email) do update
    set nome = excluded.nome, telefone = excluded.telefone, bases = excluded.bases, mensagem = excluded.mensagem
    where access_requests.status = 'pendente';
  return 'recebido';
end $$;

create or replace function decide_access_request(p_id uuid, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not is_super_admin() then raise exception 'Só o administrador da plataforma decide pedidos de acesso.'; end if;
  select email into v_email from access_requests where id = p_id;
  if v_email is null then raise exception 'Pedido não encontrado.'; end if;
  if p_aprovar then perform allow_email(v_email); end if;
  update access_requests set status = case when p_aprovar then 'aprovado' else 'recusado' end, decided_at = now() where id = p_id;
end $$;

revoke execute on function request_access(text,text,text,int,text), decide_access_request(uuid,boolean) from public, anon, authenticated;
grant execute on function request_access(text,text,text,int,text) to anon, authenticated;
grant execute on function decide_access_request(uuid,boolean) to authenticated;
