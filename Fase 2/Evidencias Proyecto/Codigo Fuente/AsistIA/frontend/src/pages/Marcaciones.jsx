import AsistenciaFacialAdmin from './AsistenciaFacialAdmin'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Plus, RefreshCw, Download, Search, X, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const localTime = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const emptyForm = () => ({ alumnoId: '', horarioId: '', fecha: localDate(), hora: localTime(), estado: 'Presente' })
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const dayOfDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const d = new Date(`${value}T12:00:00Z`)
  return ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][d.getUTCDay()] || ''
}

export default function Marcaciones() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [marcaciones, setMarcaciones] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [horarios, setHorarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [modal, setModal] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.ok) throw new Error(data.message || `Error ${response.status}`)
    return data
  }, [token])

  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const [m, a, h] = await Promise.all([
        request('/api/marcaciones'), request('/api/alumnos'), request('/api/horarios'),
      ])
      setMarcaciones(m.marcaciones || [])
      setAlumnos(a.alumnos || [])
      setHorarios(h.horarios || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, isAdmin, request])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => marcaciones.filter(m => {
    const text = [m.alumno, m.rut, m.codigo, m.asignatura, m.seccion, m.docente, m.fecha, m.hora, m.estado, m.sala].join(' ').toLowerCase()
    return (statusFilter === 'Todos' || m.estado === statusFilter) && text.includes(query.toLowerCase().trim())
  }), [marcaciones, query, statusFilter])

  const availableHorarios = useMemo(() => horarios.filter(h => h.estado !== 'Cancelada' && normal(h.dia) === normal(dayOfDate(modal?.fecha))), [horarios, modal?.fecha])
  const horarioLabel = h => `${h.codigo || ''} · ${h.asignatura || ''} · ${h.seccion || ''} · ${h.dia} ${h.inicio}–${h.fin} · ${h.sala || h.modalidad || ''}`

  const save = async e => {
    e.preventDefault()
    if (!modal?.alumnoId || !modal?.horarioId) { setError('Selecciona un alumno y una clase.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      await request('/api/marcaciones', { method: 'POST', body: JSON.stringify(modal) })
      setModal(null)
      setNotice('Marcación registrada correctamente.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const remove = async m => {
    if (!window.confirm(`¿Eliminar la marcación de ${m.alumno} del ${m.fecha}?`)) return
    setError(''); setNotice('')
    try {
      await request(`/api/marcaciones/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
      setNotice('Marcación eliminada correctamente.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const exportCSV = () => {
    const header = ['Fecha', 'Hora', 'Alumno', 'RUT', 'Código', 'Asignatura', 'Sección', 'Docente', 'Sala', 'Estado', 'Origen']
    const rows = filtered.map(m => [m.fecha, m.hora, m.alumno, m.rut, m.codigo, m.asignatura, m.seccion, m.docente, m.sala, m.estado, m.origen])
    const content = '\uFEFF' + [header, ...rows].map(row => row.map(csv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `marcaciones_${localDate()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAdmin) return <div className="entity-page"><h2>Marcaciones</h2><p>Este módulo requiere permisos de administración.</p></div>

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div><p className="entity-kicker">GESTIÓN ACADÉMICA</p><h1>Marcaciones</h1><p>Registro manual y seguimiento de asistencia por clase.</p></div>
        <div className="entity-header-actions">
          <button type="button" className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={16} /> Actualizar</button>
          <button type="button" className="secondary-action" onClick={exportCSV} disabled={!filtered.length}><Download size={16} /> Exportar CSV</button>
          <button type="button" className="primary-action" onClick={() => { setError(''); setNotice(''); setModal(emptyForm()) }}><Plus size={16} /> Nueva marcación</button>
        </div>
      </header>

      <div className="entity-stats">
        <div className="stat-card"><div className="entity-stat-icon blue"><ClipboardCheck size={20} /></div><div><span>Total de marcaciones</span><strong>{marcaciones.length}</strong></div></div>
        <div className="stat-card"><div className="entity-stat-icon blue"><CheckCircle2 size={20} /></div><div><span>Presentes</span><strong>{marcaciones.filter(m => m.estado === 'Presente').length}</strong></div></div>
        <div className="stat-card"><div className="entity-stat-icon blue"><ClipboardCheck size={20} /></div><div><span>Atrasados</span><strong>{marcaciones.filter(m => m.estado === 'Atrasado').length}</strong></div></div>
        <div className="stat-card"><div className="entity-stat-icon blue"><AlertTriangle size={20} /></div><div><span>Pendientes</span><strong>{marcaciones.filter(m => m.estado === 'Pendiente').length}</strong></div></div>
      </div>
      {!user?.scope && <AsistenciaFacialAdmin token={token} />}


      {notice && <div className="page-notice" role="status"><CheckCircle2 size={17} /> {notice}</div>}
      {error && <div className="page-notice" role="alert" style={{ color: '#b42318', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}><AlertTriangle size={17} /> {error}</div>}

      <div className="data-panel">
        <div className="panel-header"><h2>Historial de asistencia</h2></div>
        <div className="data-toolbar"><div className="data-tools">
          <label className="entity-search"><Search size={18} /><input aria-label="Buscar marcaciones" placeholder="Buscar alumno, RUT, curso, fecha..." value={query} onChange={e => setQuery(e.target.value)} /></label>
          <select aria-label="Filtrar por estado" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {['Todos', 'Presente', 'Atrasado', 'Pendiente'].map(s => <option key={s}>{s}</option>)}
          </select></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="entity-table">
            <thead><tr><th>Fecha</th><th>Hora</th><th>Alumno</th><th>Curso / Sección</th><th>Docente</th><th>Estado</th><th>Origen</th><th>Acciones</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}>Cargando marcaciones...</td></tr> : filtered.length === 0 ? <tr><td colSpan={8}>No hay marcaciones para mostrar.</td></tr> : filtered.map(m => (
                <tr key={m.id}>
                  <td>{m.fecha}</td><td>{m.hora}</td>
                  <td><strong>{m.alumno}</strong><div>{m.rut}</div></td>
                  <td>{m.codigo} · {m.asignatura}<div>{m.seccion}</div></td>
                  <td>{m.docente}</td><td>{m.estado}</td><td>{m.origen || 'Manual'}</td>
                  <td><button type="button" className="icon-action" title="Eliminar" aria-label={`Eliminar marcación de ${m.alumno}`} onClick={() => remove(m)}><Trash2 size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <div className="modal-backdrop" onClick={() => setModal(null)}>
        <div className="entity-modal" role="dialog" aria-modal="true" aria-label="Nueva marcación" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2>Nueva marcación</h2><button type="button" onClick={() => setModal(null)} aria-label="Cerrar"><X size={20} /></button></div>
          <form onSubmit={save}>
            <div className="modal-fields">
              <label>Alumno<select required value={modal.alumnoId} onChange={e => setModal({ ...modal, alumnoId: e.target.value })}><option value="">Seleccionar alumno</option>{alumnos.filter(a => a.estado === 'Activo').map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.rut}</option>)}</select></label>
              <label>Fecha<input type="date" required value={modal.fecha} onChange={e => setModal({ ...modal, fecha: e.target.value, horarioId: '' })} /></label>
              <label>Hora<input type="time" required value={modal.hora} onChange={e => setModal({ ...modal, hora: e.target.value })} /></label>
              <label>Estado<select value={modal.estado} onChange={e => setModal({ ...modal, estado: e.target.value })}>{['Presente', 'Atrasado', 'Pendiente'].map(s => <option key={s}>{s}</option>)}</select></label>
              <label style={{ gridColumn: '1 / -1' }}>Clase / Horario<select required value={modal.horarioId} onChange={e => setModal({ ...modal, horarioId: e.target.value })}><option value="">Seleccionar clase</option>{availableHorarios.map(h => <option key={h.id} value={h.id}>{horarioLabel(h)}</option>)}</select></label>
            </div>
            <p style={{ fontSize: 13, opacity: .75 }}>Se muestran únicamente clases correspondientes al día seleccionado. El estado se asigna manualmente.</p>
            <div className="modal-actions"><button type="button" className="secondary-action" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? 'Guardando...' : 'Registrar marcación'}</button></div>
          </form>
        </div>
      </div>}
    </div>
  )
}


