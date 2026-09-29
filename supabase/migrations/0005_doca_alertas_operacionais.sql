-- Limites dos alertas operacionais (seção 5 da análise dos relatórios JMS), ajustáveis
-- por base em Ajustes. Todos têm um padrão sensato no código quando a coluna vem nula.
alter table bases add column if not exists taxa_falha_aviso numeric;
alter table bases add column if not exists taxa_falha_critico numeric;
alter table bases add column if not exists inicio_tardio_aviso_h numeric;
alter table bases add column if not exists inicio_tardio_critico_h numeric;
alter table bases add column if not exists ritmo_multiplicador numeric;
alter table bases add column if not exists carga_desigual_min numeric;
alter table bases add column if not exists carga_desigual_max numeric;
alter table bases add column if not exists entrega_noturna_limite int;
alter table bases add column if not exists entrega_noturna_min int;
