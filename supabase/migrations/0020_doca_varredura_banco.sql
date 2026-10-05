-- Varredura do banco (05/10/2026). Já aplicado no Supabase.

-- 1) Preço padrão da base (driver_id nulo) duplicava a cada salvar, porque NULL conta como valor diferente
--    no índice único. Agora NULL é tratado como igual e o upsert atualiza a mesma linha.
create unique index if not exists payment_rules_base_driver_bairro_nn on payment_rules (base_id, driver_id, bairro) nulls not distinct;

-- 2) Índices nas chaves estrangeiras que não tinham.
create index if not exists action_items_created_by_idx on action_items (created_by);
create index if not exists allowed_emails_created_by_idx on allowed_emails (created_by);
create index if not exists audit_logs_user_id_idx on audit_logs (user_id);
create index if not exists driver_links_base_id_idx on driver_links (base_id);
create index if not exists driver_links_created_by_idx on driver_links (created_by);
create index if not exists import_batches_user_id_idx on import_batches (user_id);

-- 3) auth.uid() avaliado uma vez por consulta (e não por linha) nas políticas novas.
alter policy "editores criam plano de acao" on action_items with check (coalesce(base_role(base_id), '') in ('owner','editor') and created_by = (select auth.uid()));
alter policy "editores registram auditoria" on audit_logs with check (user_id = (select auth.uid()) and coalesce(base_role(base_id), '') in ('owner','editor'));
alter policy "editores registram importacoes" on import_batches with check (user_id = (select auth.uid()) and coalesce(base_role(base_id), '') in ('owner','editor'));
alter policy "editores criam links de motorista" on driver_links with check (coalesce(base_role(base_id), '') in ('owner','editor') and created_by = (select auth.uid()));
alter policy "dono ve a propria assinatura" on subscriptions using (owner_id = (select auth.uid()) or is_super_admin());
