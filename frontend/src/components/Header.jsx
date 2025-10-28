// src/components/Header.jsx
import React from "react";

export default function Header() {
  return (
    <header className="appbar card appbar--tight">
      <div className="appbar__left">
        {/* Logo claro/oscuro desde /public/svg */}
        <div className="appbar__title" style={{ display: "flex", alignItems: "center" }}>
          <picture className="brand-logo">
            {/* Tema oscuro -> logo negro */}
            <source srcSet="/svg/logo%20black.svg" media="(prefers-color-scheme: dark)" />
            {/* Tema claro (fallback) -> logo blanco */}
            <img
              src="/svg/logo%20white.svg"
              alt="Palacio del Blumer"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </picture>
        </div>

        <div className="appbar__subtitle muted">Consulta de precios</div>
      </div>
    </header>
  );
}
