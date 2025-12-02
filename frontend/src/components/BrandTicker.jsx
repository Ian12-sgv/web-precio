// src/components/BrandTicker.jsx
const BRANDS = [
  { key: 'carruso', label: 'Carruso' },
  { key: 'embajador', label: 'Embajador' },
  { key: 'granP', label: 'Gran P' },
  { key: 'leonardo', label: 'Leonardo' },
  { key: 'Lsensacion', label: 'La Sensación' },
  { key: 'marrison', label: 'Marrison' },
  { key: 'milena', label: 'Milena' },
  { key: 'nirvana', label: 'Nirvana' },
  { key: 'sophia', label: 'Sophia' },
];

export default function BrandTicker() {
  // Duplicamos la lista para que el scroll sea infinito
  const logos = [...BRANDS, ...BRANDS];

  return (
    <div className="brand-ticker">
      <div className="brand-ticker__track">
        {logos.map((brand, idx) => (
          <picture
            key={`${brand.key}-${idx}`}
            className="brand-ticker__item"
          >
            {/* En dark mode usas el -black */}
            <source
              media="(prefers-color-scheme: dark)"
              srcSet={`/svg/${brand.key}-black.svg`}
            />
            {/* Fallback (tema claro): versión -white */}
            <img
              src={`/svg/${brand.key}-white.svg`}
              alt={brand.label}
              className="brand-ticker__img"
              loading="lazy"
            />
          </picture>
        ))}
      </div>
    </div>
  );
}
