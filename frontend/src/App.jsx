import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Scan from './pages/Scan';
import Detalle from './pages/Detalle';

function Header() {
  return (
    <header className="appbar card appbar--tight">
      <div className="appbar__left">
        <div className="appbar__title" style={{display:'flex', alignItems:'center', gap:8}}>
  <picture className="brand-logo">
    <img
      src="/svg/logo white.jpg"
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
