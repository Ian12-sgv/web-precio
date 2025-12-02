import { Routes, Route, useLocation } from 'react-router-dom';
import Scan from './pages/Scan';
import Detalle from './pages/Detalle';
import BrandTicker from './components/BrandTicker';

function Header() {
  return (
    <header className="appbar card appbar--tight">
      {/* El carrusel sustituye completamente al logo */}
      <BrandTicker />
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
