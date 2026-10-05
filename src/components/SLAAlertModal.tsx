import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import type { SLAAlertItem } from '../hooks/useSLAAlert';
import { formatMinutos, getUrgencyStyle } from '../hooks/useSLAAlert';

interface SLAAlertModalProps {
  alerts: SLAAlertItem[];
  isOpen: boolean;
  onClose: () => void;
  onViewDetail?: (code: string) => void;
}

export default function SLAAlertModal({
  alerts,
  isOpen,
  onClose,
  onViewDetail,
}: SLAAlertModalProps) {
  const [dismissed, setDismissed] = useState(new Set<string>());

  if (!isOpen || alerts.length === 0) return null;

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.c));

  const handleDismiss = (code: string) => {
    setDismissed((prev) => new Set(prev).add(code));
  };

  const handleClose = () => {
    if (visibleAlerts.length === 0) {
      onClose();
      setDismissed(new Set());
    }
  };

  const criticalCount = alerts.filter((a) => a.urgency === 'critical').length;
  const warningCount = alerts.filter((a) => a.urgency === 'warning').length;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
                🚨 Alertas de SLA
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                {criticalCount > 0 && (
                  <>
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                    </span>
                    {warningCount > 0 && ' · '}
                  </>
                )}
                {warningCount > 0 && (
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                    {warningCount} aviso{warningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => {
                setDismissed(new Set(alerts.map((a) => a.c)));
                handleClose();
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Fechar"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 0',
            }}
          >
            {visibleAlerts.map((alert, idx) => {
              const style = getUrgencyStyle(alert.urgency);
              return (
                <motion.div
                  key={alert.c}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: idx * 0.05 }}
                  style={{
                    padding: '16px 24px',
                    borderLeft: `4px solid ${style.border}`,
                    backgroundColor: style.bg,
                    marginBottom: '12px',
                    marginLeft: '16px',
                    marginRight: '16px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      gap: '16px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>{style.icon}</span>
                        <strong style={{ color: style.color, fontSize: '16px' }}>
                          #{alert.c}
                        </strong>
                        {alert.minsFaltam > 0 && (
                          <span
                            style={{
                              background: style.border,
                              color: 'white',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {formatMinutos(alert.minsFaltam)} restante
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '13px',
                          color: style.color,
                          lineHeight: '1.5',
                        }}
                      >
                        <div>
                          <strong>Motorista:</strong> {alert.drv}
                        </div>
                        {alert.base && (
                          <div>
                            <strong>Base:</strong> {alert.base}
                          </div>
                        )}
                        {alert.hr_saida && (
                          <div>
                            <strong>Saiu em:</strong>{' '}
                            {new Date(alert.hr_saida).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                        {alert.tempo_total_min && (
                          <div>
                            <strong>Tempo decorrido:</strong> {formatMinutos(alert.tempo_total_min)}
                          </div>
                        )}
                        {alert.prob && (
                          <div style={{ marginTop: '4px' }}>
                            <strong>Observação:</strong> {alert.prob}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {onViewDetail && (
                        <button
                          onClick={() => onViewDetail(alert.c)}
                          style={{
                            padding: '8px 16px',
                            background: style.border,
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLElement).style.opacity = '0.9';
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLElement).style.opacity = '1';
                          }}
                        >
                          Ver detalhes
                        </button>
                      )}
                      <button
                        onClick={() => handleDismiss(alert.c)}
                        style={{
                          padding: '8px 16px',
                          background: 'transparent',
                          color: style.color,
                          border: `1px solid ${style.border}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.background = style.bg;
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Footer */}
          {visibleAlerts.length > 0 && (
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => {
                  setDismissed(new Set(alerts.map((a) => a.c)));
                  handleClose();
                }}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = '#e5e7eb';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = '#f3f4f6';
                }}
              >
                Descartar todos
              </button>
              {visibleAlerts.length > 0 && (
                <button
                  onClick={() => onClose()}
                  style={{
                    padding: '10px 20px',
                    background: '#161616',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = '#37383a';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = '#161616';
                  }}
                >
                  Entendido, vou verificar!
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
