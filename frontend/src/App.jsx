import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Scan from './pages/Scan';
import Detalle from './pages/Detalle';

function Header() {
  return (
    <header className="appbar card appbar--tight">
      <div className="appbar__left">
        <div className="appbar__title" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <picture className="brand-logo">
            {/* Logo negro SOLO en dark mode */}
            <source
              media="(prefers-color-scheme: dark)"
              srcSet="/svg/logo-black.png" /* usa tu ruta real */
            />
            {/* Fallback (tema claro): logo blanco */}
            <img
              src="/svg/logo white.jpg"   /* usa tu ruta real */
              alt="Palacio del Blumer"
              className="brand-logo__img"
            />
          </picture>
        </div>
      </div>
    </header>
  );
}


export default function App() {
  const loc = useLocation();
  const titulo = loc.pathname.startsWith('/detalle') ? 'Detalle' : 'Escanear';
  document.title = `BLUMER — ${titulo}`;
  return (
    <div className="container">
      <Header />
      <Routes>
        <Route path="/" element={<Scan />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/detalle" element={<Detalle />} />
      </Routes>
    </div>
  );
}
