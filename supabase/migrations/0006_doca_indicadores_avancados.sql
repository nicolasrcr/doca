-- Persiste no histórico dados que hoje só existem no dia atual (result) e se perdem ao salvar:
-- SLA no prazo, peso, forma de pagamento, tipo de produto, bloqueados e motorista divergente.
-- Sem isso, a tela de Histórico nunca poderia mostrar tendência desses indicadores.
alter table days add column if not exists sla_ok int;
alter table days add column if not exists sla_total int;
alter table days add column if not exists peso_total numeric;
alter table days add column if not exists bloqueados int;
alter table days add column if not exists divergentes int;
alter table days add column if not exists pagamentos jsonb;
alter table days add column if not exists tipos_produto jsonb;
