-- Doca — gaps identificados no relatório de menu do JMS BR:
-- 1) coleta (pickup) como dimensão própria, separada da entrega
-- 2) status de ocorrência (aberto/tratando/barrado/devolvido/resolvido)
-- 3) coluna linhas_descartadas em `days` (já usada pelo app, faltava na tabela)

alter table days add column if not exists coleta_total int not null default 0;
alter table days add column if not exists coleta_feita int not null default 0;
alter table days add column if not exists coleta_falha_bipagem int not null default 0;
alter table days add column if not exists linhas_descartadas int not null default 0;

alter table occurrences add column if not exists status text not null default 'aberto'
  check (status in ('aberto','tratando','barrado','devolvido','resolvido'));

-- mantém `resolvido` coerente com o novo `status` para quem ainda lê a coluna antiga
update occurrences set status = 'resolvido' where resolvido = true and status = 'aberto';
