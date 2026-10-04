-- Dia salvo sem a Carta de porte: marcado como incompleto (carta_ok = false) em vez de zerado.
-- bairros: estatística por bairro do dia, para a análise de rotas.
alter table days add column if not exists carta_ok boolean not null default true;
alter table days add column if not exists bairros jsonb;
