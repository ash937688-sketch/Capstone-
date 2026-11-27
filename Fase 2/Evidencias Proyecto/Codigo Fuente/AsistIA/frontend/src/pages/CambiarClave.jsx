import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function CambiarClave() {
  const { user, changePassword, logout } = useAuth(); const navigate = useNavigate()
  const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false)
  if (!user) return <Navigate to="/login" replace />
  if (!user.mustChangePassword) return <Navigate to="/" replace />
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setMessage(''); const data = new FormData(event.currentTarget)
    const next = data.get('newPassword'); const confirmation = data.get('confirmation')
    if (next !== confirmation) { setMessage('Las contraseñas nuevas no coinciden.'); setLoading(false); return }
    try { const result = await changePassword(data.get('currentPassword'), next); if (!result.ok) return setMessage(result.message); navigate('/', { replace: true }) }
    catch { setMessage('No se pudo conectar con el servidor.') } finally { setLoading(false) }
  }
  return <div className="password-page"><div className="password-card"><div className="password-icon"><ShieldCheck size={30} /></div><p className="auth-eyebrow">PRIMER ACCESO</p><h1>Crea tu contraseña personal</h1><p>Por seguridad debes reemplazar la clave temporal antes de continuar.</p><form onSubmit={submit}><Password label="Clave temporal" name="currentPassword" /><Password label="Nueva contraseña" name="newPassword" /><Password label="Confirmar nueva contraseña" name="confirmation" />{message && <div className="auth-message">{message}</div>}<button className="auth-submit" disabled={loading}>{loading ? 'Guardando…' : 'Guardar nueva contraseña'}</button></form><small><KeyRound size={13} /> Usa 8 caracteres, mayúscula, minúscula y número.</small><button className="cancel-password" onClick={logout}>Cerrar sesión</button></div></div>
}
function Password({ label, name }) { return <label className="auth-field"><span>{label}</span><div><KeyRound size={18} /><input name={name} type="password" minLength="8" required /></div></label> }
