import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

// ASISTIA_187_14_83_TOTEM_PIN_AUTO_DEMO
const UID_ALUMNO_DEMO = 'mfocD4TcwOfnApbXqQxJIezra4F3'

export default function TotemPinDemo() {
  const { user, token } = useAuth()
  const [pin, setPin] = useState('')
  const [horarios, setHorarios] = useState([])
  const [horarioId, setHorarioId] = useState('')
  const [cargando, setCargando] = useState(true)
  const [esperando, setEsperando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (!token || user?.role !== 'Administradora') return
    let activo = true
    const cargar = async () => {
      setCargando(true)
      try {
        const r = await fetch('/api/horarios', { headers: { Authorization: `Bearer ${token}` } })
        const d = await r.json()
        if (!r.ok || !d.ok || !Array.isArray(d.horarios)) throw new Error(d.message || 'No se pudieron cargar los horarios.')
        const opciones = d.horarios.filter(h => h.esDemo === true && h.estado === 'Confirmada' && h.id)
        if (activo) {
          setHorarios(opciones)
          setHorarioId(actual => opciones.some(h => String(h.id) === actual) ? actual : opciones.length === 1 ? String(opciones[0].id) : '')
          setResultado(opciones.length ? null : { ok: false, message: 'No hay horarios demo confirmados. Revisa los horarios antes de validar.' })
        }
      } catch (e) {
        if (activo) setResultado({ ok: false, message: e.message })
      } finally {
        if (activo) setCargando(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [token, user?.role])

  const agregar = n => { setResultado(null); setPin(p => (p + n).slice(0, 6)) }
  const validar = async e => {
    e.preventDefault()
    if (!/^\d{6}$/.test(pin) || !horarioId || esperando) return
    setEsperando(true)
    setResultado(null)
    try {
      const r = await fetch('/api/academico/totem/pin-verificar-prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin, firebaseUid: UID_ALUMNO_DEMO, horarioId })
      })
      const d = await r.json().catch(() => ({}))
      setResultado({ ok: r.ok && d.ok === true, message: d.message || `HTTP ${r.status}` })
    } catch {
      setResultado({ ok: false, message: 'No se pudo conectar con el backend.' })
    } finally {
      setPin('')
      setEsperando(false)
    }
  }

  if (user?.role !== 'Administradora') return <section className="panel" style={{ padding: 24 }}><h2>Acceso restringido</h2></section>
  return (
    <section style={{ maxWidth: 660, margin: '22px auto', padding: 16 }}>
      <div className="panel" style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>ASISTENCIALIA · SPRINT 2</div>
        <h1 style={{ marginTop: 12 }}>Tótem de verificación PIN</h1>
        <p style={{ color: '#64748b' }}>Demostración: el alumno solo ingresa su PIN de seis dígitos.</p>
        <p style={{ color: '#92400e', background: '#fffbeb', padding: 12, borderRadius: 10 }}>La validación consume un PIN correcto, pero todavía no registra asistencia.</p>
        <form onSubmit={validar}>
          {cargando ? <p>Cargando clases de demostración...</p> : horarios.length > 1 ? (
            <label style={{ display: 'block', textAlign: 'left', marginTop: 16 }}>Clase de demostración
              <select value={horarioId} onChange={e => { setHorarioId(e.target.value); setResultado(null) }} style={{ display: 'block', width: '100%', marginTop: 8, padding: 12, borderRadius: 8 }}>
                <option value="">Selecciona la clase</option>
                {horarios.map(h => <option key={h.id} value={h.id}>{[h.asignatura, h.nombre, h.dia, h.horaInicio].filter(Boolean).join(' · ') || `Horario ${h.id}`}</option>)}
              </select>
            </label>
          ) : horarios.length === 1 ? <p style={{ color: '#166534' }}>Clase demo detectada automáticamente.</p> : null}
          <label style={{ display: 'block', marginTop: 22 }}>PIN de 6 dígitos
            <input aria-label="PIN temporal" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={e => { setResultado(null); setPin(e.target.value.replace(/\D/g, '').slice(0, 6)) }} autoComplete="off" type="password" placeholder="••••••" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, textAlign: 'center', letterSpacing: 12, fontSize: 32, padding: 14, borderRadius: 10, border: '1px solid #cbd5e1' }} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 330, margin: '20px auto' }}>
            {['1','2','3','4','5','6','7','8','9','Limpiar','0','Borrar'].map(k => <button key={k} type="button" onClick={() => k === 'Limpiar' ? (setPin(''), setResultado(null)) : k === 'Borrar' ? setPin(p => p.slice(0, -1)) : agregar(k)} style={{ padding: 14, border: '1px solid #cbd5e1', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', fontSize: 17 }}>{k}</button>)}
          </div>
          <button type="submit" disabled={cargando || esperando || pin.length !== 6 || !horarioId || !token} style={{ padding: '14px 25px', border: 0, borderRadius: 10, background: '#0b63ce', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: esperando ? .6 : 1 }}>{esperando ? 'Verificando...' : 'Validar PIN'}</button>
        </form>
        {resultado && <p role="status" style={{ marginTop: 18, padding: 15, borderRadius: 9, background: resultado.ok ? '#dcfce7' : '#fee2e2', color: resultado.ok ? '#166534' : '#991b1b' }}>{resultado.message}</p>}
      </div>
    </section>
  )
}
