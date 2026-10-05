-- Entregas por hora do dia (histograma de horários). Preenchida a partir da próxima importação de cada dia.
alter table days add column if not exists horas jsonb;
