-- Resumo diário: todo dia às 8h de Brasília (11h UTC), para bases com resumo_diario ligado e webhook https.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function resumo_diario_texto(b uuid) returns text
language plpgsql security definer set search_path = public as $$
declare bs bases; d days; baixos text; pct numeric; falt int; meta numeric; t text;
begin
  select * into bs from bases where id = b;
  if not found then return null; end if;
  select * into d from days where base_id = b and coalesce(carta_ok, true) order by data desc limit 1;
  if not found then return null; end if;
  meta := coalesce(bs.meta, 95);
  pct := case when d.total > 0 then 100.0 * d.entregues / d.total else 0 end;
  falt := greatest(0, ceil(d.total * meta / 100.0)::int - d.entregues);
  select string_agg(format('• %s: %s%% (%s/%s)', s.m->>'n', replace(to_char(round(100.0 * (s.m->>'e')::numeric / (s.m->>'t')::numeric, 1), 'FM990.0'), '.', ','), s.m->>'e', s.m->>'t'),
                    E'\n' order by (s.m->>'e')::numeric / (s.m->>'t')::numeric)
    into baixos
  from (select j.m from jsonb_array_elements(d.motoristas) as j(m)
        where (j.m->>'t')::int >= 20 and (j.m->>'e')::numeric / (j.m->>'t')::numeric < meta / 100.0
        order by (j.m->>'e')::numeric / (j.m->>'t')::numeric limit 5) s;
  t := format(E'*Resumo diário | %s*\n📅 Dia %s\n\n✅ Entregues: %s de %s (%s%%)\n🎯 Meta %s%%: %s\n⚠️ Com problema: %s',
        bs.name, to_char(d.data, 'DD/MM/YYYY'), d.entregues, d.total,
        replace(to_char(round(pct, 1), 'FM990.0'), '.', ','), round(meta)::text,
        case when falt = 0 then 'batida' else 'faltaram ' || falt || ' entregas' end, d.problemas);
  if baixos is not null then t := t || E'\n\n*Atenção: abaixo da meta*\n' || baixos; end if;
  return t;
end $$;

create or replace function enviar_resumo_base(b uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare bs bases; txt text; ultimo date; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into bs from bases where id = b;
  if not found then return 'base não encontrada'; end if;
  if bs.whatsapp_webhook is null or bs.whatsapp_webhook !~ '^https://[^/]+' then return 'sem endereço de webhook https'; end if;
  if bs.whatsapp_webhook ~* '^https://(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)' then return 'endereço não permitido'; end if;
  select max(data) into ultimo from days where base_id = b and coalesce(carta_ok, true);
  if ultimo is null or ultimo < hoje - 3 then return 'sem dia recente salvo'; end if;
  txt := resumo_diario_texto(b);
  perform net.http_post(
    url := bs.whatsapp_webhook,
    body := jsonb_build_object('origem', 'resumo_diario', 'base', bs.name, 'data', ultimo, 'texto', txt),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000);
  return 'enviado';
end $$;

create or replace function enviar_resumos_diarios() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from bases where resumo_diario loop
    if enviar_resumo_base(r.id) = 'enviado' then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function enviar_resumo_agora(p_base uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(base_role(p_base), '') not in ('owner', 'editor') then raise exception 'Sem permissão nesta base.'; end if;
  return enviar_resumo_base(p_base);
end $$;

revoke execute on function resumo_diario_texto(uuid), enviar_resumo_base(uuid), enviar_resumos_diarios(), enviar_resumo_agora(uuid) from public, anon, authenticated;
grant execute on function enviar_resumo_agora(uuid) to authenticated;

select cron.schedule('doca-resumo-diario', '0 11 * * *', 'select public.enviar_resumos_diarios()');
