import React from 'react';

/**
 * Card de precio reutilizable.
 * Props:
 *  - label: string  (ej. "Costo USD")
 *  - value: string | number  (texto ya formateado)
 *  - variant: "usd" | "ves" | "neutral"
 *  - onCopy: () => void  (opcional)
 */
export default function PriceCard({ label, value, variant = 'neutral', onCopy }) {
  const variantClass =
    variant === 'usd' ? 'd-price--usd' :
    variant === 'ves' ? 'd-price--ves' : '';

  return (
    <div className={`d-price ${variantClass}`}>
      <div className="d-price-top">
        <span className="d-price-ico">$</span>
        {onCopy && (
          <button className="d-copy" onClick={onCopy} title="Copiar">⧉</button>
        )}
      </div>
      <div className="d-price-sub">{label}</div>
      <div className="d-price-val">{value}</div>
    </div>
  );
}
