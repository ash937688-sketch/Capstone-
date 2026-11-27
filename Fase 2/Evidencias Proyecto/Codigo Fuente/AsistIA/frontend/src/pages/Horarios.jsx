import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Plus, Download, CalendarDays, Clock3, DoorOpen, AlertTriangle, CheckCircle2, X, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
const initialForm = { cursoId: '', docenteId: '', dia: 'Lunes', inicio: '08:30', fin: '10:00', sala: '', modalidad: 'Presencial', estado: 'Confirmada' }
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const dayName = day => ({ Miercoles: 'Miércoles', Sabado: 'Sábado' }[day] || day)
const csvValue = value => `"${String(value ?? '').replaceAll('"', '""')}"`

export default function Horarios() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [horarios, setHorarios] = useState([])
  const [cursos, setCursos] = useState([])
  const [docentes, setDocentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [dayFilter, setDayFilter] = useState('Todos')
  const [modal, setModal] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.ok) throw new Error(result.message || `No fue posible completar la operación (${response.status}).`)
    return result
  }, [token])

  const load = useCallback(async () => {
    if (!token) { setHorarios([]); setCursos([]); setDocentes([]); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const [h, c, d] = await Promise.all([
        request('/api/horarios'), request('/api/cursos'), request('/api/docentes'),
      ])
      setHorarios(h.horarios || [])
      setCursos(c.cursos || [])
      setDocentes(d.docentes || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [request, token])

  useEffect(() => { load() }, [load])

  const courseLabel = useCallback(id => {
    const c = cursos.find(item => item.id === id)
    return c ? `${c.codigo} · ${c.asignatura} · ${c.seccion} · ${c.periodo}` : 'Curso no disponible'
  }, [cursos])
  const teacherLabel = useCallback(id => docentes.find(item => item.id === id)?.nombre || 'Docente no disponible', [docentes])

  const filtered = useMemo(() => horarios.filter(h => {
    const matchesDay = dayFilter === 'Todos' || normalize(h.dia) === normalize(dayFilter)
    const text = [h.codigo, h.asignatura, h.seccion, h.docente, h.sala, h.dia, h.inicio, h.fin, h.periodo, h.modalidad, h.estado].join(' ').toLowerCase()
    return matchesDay && text.includes(query.trim().toLowerCase())
  }), [horarios, dayFilter, query])

  const ordered = useMemo(() => [...filtered].sort((a, b) =>
    DAYS.findIndex(d => normalize(d) === normalize(a.dia)) - DAYS.findIndex(d => normalize(d) === normalize(b.dia)) ||
    String(a.inicio).localeCompare(String(b.inicio))
  ), [filtered])

  const openCreate = () => {
    setError(''); setNotice('')
    setModal({ ...initialForm, cursoId: cursos.find(c => c.estado === 'Activo')?.id || '', docenteId: docentes.find(d => d.estado === 'Activo')?.id || '' })
  }

  const save = async event => {
    event.preventDefault()
    if (!modal || saving) return
    if (modal.inicio >= modal.fin) { setError('La hora de término debe ser posterior a la hora de inicio.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const data = {
        cursoId: modal.cursoId, docenteId: modal.docenteId, dia: modal.dia,
        inicio: modal.inicio, fin: modal.fin, sala: modal.sala.trim(),
        modalidad: modal.modalidad, estado: modal.estado,
      }
      await request(modal.id ? `/api/horarios/${modal.id}` : '/api/horarios', {
        method: modal.id ? 'PUT' : 'POST', body: JSON.stringify(data),
      })
      setModal(null)
      setNotice(modal.id ? 'Horario actualizado correctamente.' : 'Horario registrado en Firebase.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const remove = async h => {
    if (!window.confirm(`¿Eliminar la clase ${h.codigo} ${h.seccion} del ${dayName(h.dia)} a las ${h.inicio}? Esta acción no se puede deshacer.`)) return
    setError(''); setNotice('')
    try {
      await request(`/api/horarios/${h.id}`, { method: 'DELETE' })
      setNotice('Horario eliminado correctamente.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const exportCsv = () => {
    const rows = [
      ['Código', 'Asignatura', 'Sección', 'Docente', 'Día', 'Inicio', 'Término', 'Sala', 'Modalidad', 'Período', 'Estado'],
      ...ordered.map(h => [h.codigo, h.asignatura, h.seccion, h.docente, dayName(h.dia), h.inicio, h.fin, h.sala, h.modalidad, h.periodo, h.estado]),
    ]
    const csv = rows.map(row => row.map(csvValue).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'horarios-asistia.csv'; anchor.click()
    URL.revokeObjectURL(url)
  }

  const activeCourses = cursos.filter(c => c.estado === 'Activo')
  const activeTeachers = docentes.filter(d => d.estado === 'Activo')
  const confirmed = horarios.filter(h => h.estado === 'Confirmada').length
  const rooms = new Set(horarios.filter(h => h.modalidad !== 'Online' && h.estado !== 'Cancelada').map(h => normalize(h.sala))).size
  const online = horarios.filter(h => h.modalidad === 'Online' && h.estado !== 'Cancelada').length

  const stats = [
    ['Clases registradas', horarios.length, 'Programación en Firebase', 'blue', CalendarDays],
    ['Clases confirmadas', confirmed, 'Clases con estado confirmado', 'green', CheckCircle2],
    ['Salas asignadas', rooms, 'Salas físicas utilizadas', 'orange', DoorOpen],
    ['Clases online', online, 'Sesiones en modalidad online', 'purple', Clock3],
  ]

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div>
          <p className="entity-kicker">GESTIÓN ACADÉMICA</p>
          <h1>Horario de clases</h1>
          <p>Planificación académica vinculada con Cursos y Docentes en Firebase.</p>
        </div>
        <div className="entity-header-actions">
          <button type="button" className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={17} />Actualizar</button>
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={17} />Exportar</button>
          {isAdmin && <button type="button" className="primary-action" onClick={openCreate} disabled={!activeCourses.length || !activeTeachers.length}><Plus size={18} />Agregar clase</button>}
        </div>
      </header>

      {notice && <div className="page-notice" role="status"><CheckCircle2 size={17} />{notice}</div>}
      {error && <div className="page-notice" role="alert" style={{ color: '#b42318', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}><AlertTriangle size={17} />{error}</div>}
      {(!activeCourses.length || !activeTeachers.length) && !loading && <div className="page-notice" role="status"><AlertTriangle size={17} />Para registrar una clase necesitas un curso activo y un docente activo.</div>}

      <section className="entity-stats">
        {stats.map(([label, value, note, color, Icon]) => (
          <article key={label}>
            <div className={`entity-stat-icon ${color}`}><Icon size={20} /></div>
            <div><span>{label}</span><strong>{value.toLocaleString('es-CL')}</strong><small>{note}</small></div>
          </article>
        ))}
      </section>

      <section className="data-panel">
        <div className="data-toolbar">
          <div><h2>Clases programadas</h2><span>{horarios.length} registros reales</span></div>
          <div className="data-tools">
            <label><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar asignatura, docente o sala..." /></label>
            <select aria-label="Filtrar por día" value={dayFilter} onChange={e => setDayFilter(e.target.value)} style={{ padding: '10px 12px', border: '1px solid #d9e2ec', borderRadius: 8, background: '#fff', color: '#334155' }}>
              <option value="Todos">Todos los días</option>
              {DAYS.map(day => <option key={day} value={day}>{dayName(day)}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="entity-table">
            <thead><tr>{['Día', 'Hora', 'Asignatura / Sección', 'Docente', 'Sala', 'Modalidad', 'Estado', ...(isAdmin ? ['Acciones'] : [])].map(col => <th key={col}>{col}</th>)}</tr></thead>
            <tbody>
              {ordered.map(h => (
                <tr key={h.id}>
                  <td><strong>{dayName(h.dia)}</strong></td>
                  <td>{h.inicio} – {h.fin}</td>
                  <td><div><strong>{h.asignatura}</strong><div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{h.codigo} · {h.seccion} · {h.periodo}</div></div></td>
                  <td>{h.docente}</td>
                  <td>{h.sala}</td>
                  <td>{h.modalidad === 'Hibrida' ? 'Híbrida' : h.modalidad}</td>
                  <td><span className={`entity-status ${h.estado === 'Confirmada' ? 'status-green' : h.estado === 'Cancelada' ? 'status-red' : 'status-orange'}`}>{h.estado}</span></td>
                  {isAdmin && <td><div className="row-actions">
                    <button type="button" title="Editar" aria-label={`Editar ${h.codigo}`} onClick={() => { setError(''); setNotice(''); setModal({ ...h, dia: DAYS.find(d => normalize(d) === normalize(h.dia)) || h.dia }) }}><Pencil size={15} /></button>
                    <button type="button" title="Eliminar" aria-label={`Eliminar ${h.codigo}`} onClick={() => remove(h)}><Trash2 size={15} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty-search">Cargando horarios desde Firebase...</div>}
          {!loading && ordered.length === 0 && <div className="empty-search">{query || dayFilter !== 'Todos' ? 'No se encontraron clases con estos filtros.' : 'Todavía no hay horarios registrados.'}</div>}
        </div>
        <footer className="data-footer"><span>Mostrando {ordered.length} de {horarios.length} clases</span><button type="button" onClick={() => { setQuery(''); setDayFilter('Todos') }}>Ver todos</button></footer>
      </section>

      {modal && <div className="modal-backdrop" onMouseDown={() => !saving && setModal(null)}>
        <section className="entity-modal" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="horario-modal-title">
          <header>
            <div><p className="entity-kicker">{modal.id ? 'EDITAR HORARIO' : 'NUEVA CLASE'}</p><h2 id="horario-modal-title">{modal.id ? 'Editar clase' : 'Agregar clase'}</h2></div>
            <button type="button" onClick={() => setModal(null)} disabled={saving} aria-label="Cerrar"><X size={20} /></button>
          </header>
          <form onSubmit={save}>
            <div className="modal-fields">
              <label>Curso / Sección / Período
                <select required value={modal.cursoId} onChange={e => setModal(m => ({ ...m, cursoId: e.target.value }))}>
                  <option value="">Seleccionar curso</option>
                  {cursos.filter(c => c.estado === 'Activo' || c.id === modal.cursoId).map(c => <option key={c.id} value={c.id}>{courseLabel(c.id)}{c.estado !== 'Activo' ? ' (Inactivo)' : ''}</option>)}
                </select>
              </label>
              <label>Docente
                <select required value={modal.docenteId} onChange={e => setModal(m => ({ ...m, docenteId: e.target.value }))}>
                  <option value="">Seleccionar docente</option>
                  {docentes.filter(d => d.estado === 'Activo' || d.id === modal.docenteId).map(d => <option key={d.id} value={d.id}>{teacherLabel(d.id)}{d.estado !== 'Activo' ? ' (Inactivo)' : ''}</option>)}
                </select>
              </label>
              <label>Día<select required value={modal.dia} onChange={e => setModal(m => ({ ...m, dia: e.target.value }))}>{DAYS.map(day => <option key={day} value={day}>{dayName(day)}</option>)}</select></label>
              <label>Sala<input required maxLength={80} value={modal.sala} onChange={e => setModal(m => ({ ...m, sala: e.target.value }))} placeholder="LAB-302" /></label>
              <label>Hora de inicio<input type="time" required value={modal.inicio} onChange={e => setModal(m => ({ ...m, inicio: e.target.value }))} /></label>
              <label>Hora de término<input type="time" required value={modal.fin} onChange={e => setModal(m => ({ ...m, fin: e.target.value }))} /></label>
              <label>Modalidad<select value={modal.modalidad} onChange={e => setModal(m => ({ ...m, modalidad: e.target.value }))}><option value="Presencial">Presencial</option><option value="Online">Online</option><option value="Hibrida">Híbrida</option></select></label>
              <label>Estado<select value={modal.estado} onChange={e => setModal(m => ({ ...m, estado: e.target.value }))}><option value="Confirmada">Confirmada</option><option value="Pendiente">Pendiente</option><option value="Cancelada">Cancelada</option></select></label>
            </div>
            {error && <div className="page-notice" role="alert" style={{ color: '#b42318', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}><AlertTriangle size={17} />{error}</div>}
            <footer>
              <button type="button" className="secondary-action" disabled={saving} onClick={() => { setModal(null); setError('') }}>Cancelar</button>
              <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Guardando...' : modal.id ? 'Guardar cambios' : 'Registrar clase'}</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  )
}


