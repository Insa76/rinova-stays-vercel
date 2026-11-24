
import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Concierge from './components/Concierge';
import Home from './pages/Home';
import Property from './pages/Property';
import Admin, { Login } from './pages/Admin';

function Public({ children }) {
  return (
    <>
      <Header />
      {children}
      <Concierge />
    </>
  );
}

export default function App() {
  const loc = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Public><Home /></Public>} />
      <Route path="/alojamiento/:slug" element={<Public><Property /></Public>} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<Admin />} />
      <Route
        path="*"
        element={
          <Public>
            <main className="page-shell">
              <h1>Página no encontrada</h1>
              <a href="/">Volver al inicio</a>
            </main>
          </Public>
        }
      />
    </Routes>
  );
}
