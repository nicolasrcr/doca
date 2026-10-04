-- Horários por motorista do dia (saída, 1ª e última entrega, ritmo, entregas noturnas),
-- para a análise de rotas por horário no histórico.
alter table days add column if not exists horarios jsonb;
