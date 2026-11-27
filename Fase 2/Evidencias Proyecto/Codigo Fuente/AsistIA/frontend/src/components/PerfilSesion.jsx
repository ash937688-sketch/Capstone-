import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

// Perfil fuera del Sidebar: accesible en cualquier ruta y rol.
export default function PerfilSesion() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const cerrarSesion = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="session-top-profile" aria-label="Usuario conectado">
      <div className="session-top-profile-info">
        <strong title={user?.name || 'Usuario'}>{user?.name || 'Usuario'}</strong>
        <span>{user?.role || 'Sin rol'}</span>
      </div>
      <button
        type="button"
        className="session-top-logout"
        onClick={cerrarSesion}
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut size={18} />
        <span className="session-top-logout-text">Cerrar sesión</span>
      </button>
    </div>
  )
}