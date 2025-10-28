import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Scan from './pages/Scan';
import Detalle from './pages/Detalle';

function Header() {
  return (
    <header className="appbar card appbar--tight">
      <div className="appbar__left">
        <div className="appbar__title" style={{display:'flex',alignItems:'center', gap:8}}>
          <picture className="brand-logo">
            <source srcSet="/svg/logo black.svg" media="(prefers-color-scheme: dark)"/>
            <img src="/svg/logo white.svg" alt="Palacio del Blumer" style={{height:28, width:'auto', display:'block'}}/>
          </picture>
        </div>
        <div className="appbar__subtitle muted">Consulta de precios</div>
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
