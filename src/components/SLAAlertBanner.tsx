import { motion } from 'framer-motion';
import type { SLAAlertItem } from '../hooks/useSLAAlert';

interface SLAAlertBannerProps {
  alerts: SLAAlertItem[];
  onOpen: () => void;
}

/**
 * Banner compacto que aparece no topo da página quando há alertas de SLA
 */
export default function SLAAlertBanner({ alerts, onOpen }: SLAAlertBannerProps) {
  if (!alerts || alerts.length === 0) return null;

  const critical = alerts.filter((a) => a.urgency === 'critical').length;
  const warning = alerts.filter((a) => a.urgency === 'warning').length;

  const bgColor = critical > 0 ? '#fef2f2' : '#fffbeb';
  const borderColor = critical > 0 ? '#dc2626' : '#f59e0b';
  const textColor = critical > 0 ? '#991b1b' : '#92400e';
  const icon = critical > 0 ? '🚨' : '⚠️';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onClick={onOpen}
      style={{
        background: bgColor,
        borderLeft: `4px solid ${borderColor}`,
        padding: '12px 16px',
        margin: '16px 0',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <div>
          <strong style={{ color: textColor, display: 'block', fontSize: '14px' }}>
            {critical > 0
              ? `${critical} entrega${critical !== 1 ? 's' : ''} CRÍTICA${critical !== 1 ? 's' : ''}`
              : `${warning} entrega${warning !== 1 ? 's' : ''} em risco`}
          </strong>
          <span
            style={{
              color: textColor,
              fontSize: '12px',
              opacity: 0.8,
            }}
          >
            Clique para ver os detalhes e tomar ações
          </span>
        </div>
      </div>
      <span
        style={{
          background: borderColor,
          color: 'white',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {alerts.length} {alerts.length === 1 ? 'alerta' : 'alertas'}
      </span>
    </motion.div>
  );
}
