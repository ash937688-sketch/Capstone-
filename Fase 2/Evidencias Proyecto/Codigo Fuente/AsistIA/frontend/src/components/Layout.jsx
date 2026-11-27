import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import PerfilSesion from './PerfilSesion'

function Layout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuAbierto(false)
  }, [location.pathname])

  return (
    <div className={`app ${menuAbierto ? 'mobile-menu-open' : ''}`}>
      <button
        type="button"
        className="mobile-menu-toggle"
        aria-label="Abrir o cerrar menu"
        aria-expanded={menuAbierto}
        onClick={() => setMenuAbierto(v => !v)}
      >
        {menuAbierto ? '✕' : '☰'}
      </button>

      {menuAbierto && (
        <button
          type="button"
          className="mobile-menu-overlay"
          aria-label="Cerrar menu"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <Sidebar />
      <PerfilSesion />

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
