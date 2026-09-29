-- Para o Histórico poder mostrar tendência de coleta e devolução ao longo do tempo
-- (não só no dia atual), os totais precisam ficar salvos em `days`, não só calculados
-- em memória no momento do upload da planilha.

alter table days add column if not exists retido_base int not null default 0;
alter table days add column if not exists devolucao int not null default 0;
alter table days add column if not exists com_assinatura int not null default 0;
