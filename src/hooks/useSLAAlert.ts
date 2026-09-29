import { useMemo } from 'react';
import type { DriverAgg } from '../lib/types';

export interface SLAAlertItem {
  c: string;
  drv: string;
  prob: string;
  base?: string;
  hr_saida?: string;
  hr_chegada?: string;
  tempo_total_min?: number;
  sla_horas?: number;
  urgency: 'critical' | 'warning' | 'info'; // critical: < 30min, warning: < 2h, info: < 6h
  minsFaltam: number; // minutos até vencer
}

/**
 * Detecta pedidos com SLA próximo de vencer
 * @param drivers Lista de agregados por motorista
 * @param slaHoras SLA padrão em horas (default: 24)
 * @returns Lista de pedidos em alerta
 */
export function useSLAAlerts(drivers: DriverAgg[] | null, slaHoras = 24): SLAAlertItem[] {
  return useMemo(() => {
    if (!drivers || !drivers.length) return [];

    const alerts: SLAAlertItem[] = [];
    const now = new Date();
    const slaMinutos = slaHoras * 60;

    for (const driver of drivers) {
      for (const item of driver.itens || []) {
        // Pular se já está entregue ou sem dados de timestamp
        if (item.st === 'e' || !item.hr_saida) continue;

        // Calcular quanto tempo falta (ainda está em trânsito)
        if (item.hr_chegada) {
          // Já chegou - se ultrapassou SLA, é problema
          if (item.sla_ok === false) {
            alerts.push({
              c: item.c,
              drv: item.drv,
              prob: item.prob,
              base: item.base,
              hr_saida: item.hr_saida,
              hr_chegada: item.hr_chegada,
              tempo_total_min: item.tempo_total_min,
              sla_horas: item.sla_horas || slaHoras,
              urgency: 'critical',
              minsFaltam: 0,
            });
          }
        } else {
          // Ainda em trânsito - calcular tempo restante
          try {
            const saida = new Date(item.hr_saida);
            if (!isNaN(saida.getTime())) {
              const decorridos = Math.round((now.getTime() - saida.getTime()) / (1000 * 60));
              const minsFaltam = slaMinutos - decorridos;

              // Critical: menos de 30 min de SLA restante
              if (minsFaltam > 0 && minsFaltam <= 30) {
                alerts.push({
                  c: item.c,
                  drv: item.drv,
                  prob: item.prob,
                  base: item.base,
                  hr_saida: item.hr_saida,
                  hr_chegada: item.hr_chegada,
                  tempo_total_min: decorridos,
                  sla_horas: item.sla_horas || slaHoras,
                  urgency: 'critical',
                  minsFaltam,
                });
              }
              // Warning: 30 min - 2h restante
              else if (minsFaltam > 30 && minsFaltam <= 120) {
                alerts.push({
                  c: item.c,
                  drv: item.drv,
                  prob: item.prob,
                  base: item.base,
                  hr_saida: item.hr_saida,
                  hr_chegada: item.hr_chegada,
                  tempo_total_min: decorridos,
                  sla_horas: item.sla_horas || slaHoras,
                  urgency: 'warning',
                  minsFaltam,
                });
              }
              // Info: 2h - 6h restante (optional, para contexto)
              else if (minsFaltam > 120 && minsFaltam <= 360) {
                alerts.push({
                  c: item.c,
                  drv: item.drv,
                  prob: item.prob,
                  base: item.base,
                  hr_saida: item.hr_saida,
                  hr_chegada: item.hr_chegada,
                  tempo_total_min: decorridos,
                  sla_horas: item.sla_horas || slaHoras,
                  urgency: 'info',
                  minsFaltam,
                });
              }
            }
          } catch {
            // Ignorar erros de parsing de data
          }
        }
      }
    }

    // Ordenar por urgência e tempo faltante (críticos primeiro)
    return alerts.sort((a, b) => {
      const urgencyOrder = { critical: 0, warning: 1, info: 2 };
      const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgDiff !== 0) return urgDiff;
      return a.minsFaltam - b.minsFaltam;
    });
  }, [drivers, slaHoras]);
}

/**
 * Formata tempo em minutos para texto legível (ex: "45 min", "2h 15min")
 */
export function formatMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Retorna cor e ícone baseado na urgência
 */
export function getUrgencyStyle(urgency: 'critical' | 'warning' | 'info') {
  switch (urgency) {
    case 'critical':
      return { bg: '#fef2f2', border: '#dc2626', color: '#991b1b', icon: '🚨' };
    case 'warning':
      return { bg: '#fffbeb', border: '#f59e0b', color: '#92400e', icon: '⚠️' };
    case 'info':
      return { bg: '#eff6ff', border: '#3b82f6', color: '#1e3a8a', icon: 'ℹ️' };
  }
}
