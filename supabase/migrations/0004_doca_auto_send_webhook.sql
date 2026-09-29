-- Disparo automático do resumo diário: hoje o franqueado tinha que copiar e colar
-- o resumo no WhatsApp manualmente. Com um webhook configurado (ex.: n8n com a API
-- oficial do WhatsApp Business), o Doca pode enviar o payload sozinho ao salvar o dia.
alter table bases add column if not exists auto_send_webhook boolean not null default false;
