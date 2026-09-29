/**
 * Símbolo da marca Doca: duas formas que se encaixam ao redor de um
 * espaço central — a base (azul) que sustenta e a peça que se conecta
 * a ela (azul-marinho). Ver proposta de identidade visual (set/2026).
 */
export function DocaMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* forma inferior — base, sustentação */}
      <rect x="8" y="30" width="62" height="62" rx="20" fill="var(--focus, #0071E3)" />
      {/* forma superior — conexão, por cima, com leve separação visual */}
      <rect x="32" y="8" width="60" height="60" rx="20" fill="var(--mark2, var(--secondary, #102A43))" />
      {/* espaço negativo central */}
      <rect x="39" y="39" width="22" height="22" rx="7" fill="var(--surface, #fff)" />
    </svg>
  );
}

export default function DocaLogo({
  size = 22,
  withName = true,
  className = "",
}: {
  size?: number;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={`docaLogo ${className}`}>
      <DocaMark size={size} />
      {withName && <span className="docaLogoName">Doca</span>}
    </span>
  );
}
