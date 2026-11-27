import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock3, Download, RefreshCw, Search, Users, CalendarDays, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const TOLERANCIA = 5
const minutos = valor => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(valor || ''))) return null
  const [h, m] = valor.split(':').map(Number)
  return h * 60 + m
}
const csv = valor => `"${String(valor ?? '').replaceAll('"', '""')}"`
const normal = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const dias = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
const diaFecha = valor => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return ''
  const fecha = new Date(`${valor}T12:00:00Z`)
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor ? '' : dias[fecha.getUTCDay()]
}
const hoy = () => {
  const fecha = new Date()
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

export default function Atrasos() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [marcaciones, setMarcaciones] = useState([])
  const [horarios, setHorarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [cursoFiltro, setCursoFiltro] = useState('Todos')

  const request = useCallback(async path => {
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
      const [m, h] = await Promise.all([request('/api/marcaciones'), request('/api/horarios')])
      setMarcaciones(m.marcaciones || [])
      setHorarios(h.horarios || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [token, isAdmin, request])

  useEffect(() => { load() }, [load])

  const registros = useMemo(() => {
    const horariosPorId = new Map(horarios.map(h => [h.id, h]))
    return marcaciones.flatMap(m => {
      const h = horariosPorId.get(m.horarioId)
      if (!h) return []
      const inicio = minutos(h.inicio)
      const llegada = minutos(m.hora)
      if (inicio === null || llegada === null) return []
      // No inferimos atrasos de registros que no corresponden al día de la clase.
      if (normal(h.dia) !== normal(diaFecha(m.fecha))) return []
      // Una marcación después de finalizar la clase requiere revisión manual.
      const fin = minutos(h.fin)
      if (fin !== null && llegada > fin) return []
      const diferencia = Math.max(0, llegada - inicio)
      return [{
        ...m,
        inicio: h.inicio,
        fin: h.fin,
        minutosAtraso: diferencia,
        clasificacion: diferencia > TOLERANCIA ? 'Atrasado' : diferencia > 0 ? 'En tolerancia' : 'Puntual',
        codigo: h.codigo || m.codigo || '',
        asignatura: h.asignatura || m.asignatura || '',
        seccion: h.seccion || m.seccion || '',
        docente: h.docente || m.docente || '',
      }]
    }).sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))
  }, [marcaciones, horarios])

  const atrasos = useMemo(() => registros.filter(r => r.minutosAtraso > TOLERANCIA), [registros])
  const cursos = useMemo(() => [...new Set(atrasos.map(r => r.codigo).filter(Boolean))].sort(), [atrasos])
  const filtered = useMemo(() => atrasos.filter(r => {
    const texto = [r.alumno, r.rut, r.codigo, r.asignatura, r.seccion, r.docente, r.fecha].join(' ').toLowerCase()
    return texto.includes(query.trim().toLowerCase()) && (!fechaFiltro || r.fecha === fechaFiltro) && (cursoFiltro === 'Todos' || r.codigo === cursoFiltro)
  }), [atrasos, query, fechaFiltro, cursoFiltro])

  const exportCSV = () => {
    const encabezado = ['Fecha', 'Alumno', 'RUT', 'Curso', 'Asignatura', 'Sección', 'Docente', 'Inicio', 'Marcación', 'Minutos de atraso', 'Tolerancia']
    const filas = filtered.map(r => [r.fecha, r.alumno, r.rut, r.codigo, r.asignatura, r.seccion, r.docente, r.inicio, r.hora, r.minutosAtraso, TOLERANCIA])
    const contenido = '\uFEFF' + [encabezado, ...filas].map(fila => fila.map(csv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `atrasos_${hoy()}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  if (!isAdmin) return <div className="entity-page"><h2>Atrasos</h2><p>Este módulo requiere permisos de administración.</p></div>

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div>
          <p className="entity-kicker">GESTIÓN ACADÉMICA</p>
          <h1>Atrasos</h1>
          <p>Seguimiento automático de llegadas posteriores a 5 minutos de tolerancia.</p>
        </div>
        <div className="entity-header-actions">
          <button type="button" className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={17} /> Actualizar</button>
          <button type="button" className="secondary-action" onClick={exportCSV} disabled={!filtered.length}><Download size={17} /> Exportar CSV</button>
        </div>
      </header>

      {error && <div className="page-notice" role="alert" style={{ color: '#b42318', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}><AlertTriangle size={17} /> {error}</div>}

      <section className="entity-stats">
        {[
          { label: 'Total de atrasos', valor: atrasos.length, Icon: Clock3, color: 'blue' },
          { label: 'Alumnos atrasados', valor: new Set(atrasos.map(r => r.alumnoId)).size, Icon: Users, color: 'purple' },
          { label: 'Minutos acumulados', valor: atrasos.reduce((s, r) => s + r.minutosAtraso, 0), Icon: AlertTriangle, color: 'orange' },
          { label: 'En tolerancia', valor: registros.filter(r => r.clasificacion === 'En tolerancia').length, Icon: CheckCircle2, color: 'green' },
        ].map(({ label, valor, Icon, color }) => (
          <div className="stat-card" key={label}>
            <div className={`entity-stat-icon ${color}`}><Icon size={20} /></div>
            <div><span>{label}</span><strong>{valor}</strong></div>
          </div>
        ))}
      </section>

      <section className="data-panel">
        <div className="data-toolbar">
          <div><h2>Historial de atrasos</h2><p style={{ margin: '5px 0 0', opacity: 0.7, fontSize: 13 }}>Solo se muestran marcaciones con más de 5 minutos de atraso.</p></div>
          <div className="data-tools">
            <label className="entity-search"><Search size={18} /><input aria-label="Buscar atrasos" placeholder="Buscar alumno, RUT o curso..." value={query} onChange={e => setQuery(e.target.value)} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CalendarDays size={16} /><input aria-label="Filtrar por fecha" type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)} /></label>
            <select aria-label="Filtrar por curso" value={cursoFiltro} onChange={e => setCursoFiltro(e.target.value)}><option value="Todos">Todos los cursos</option>{cursos.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="entity-table">
            <thead><tr><th>Fecha</th><th>Alumno</th><th>Curso / Sección</th><th>Docente</th><th>Inicio</th><th>Marcación</th><th>Atraso</th><th>Estado</th></tr></thead>
            <tbody>
              {!loading && filtered.map(r => (
                <tr key={r.id}>
                  <td>{r.fecha}</td>
                  <td><strong>{r.alumno}</strong><div>{r.rut}</div></td>
                  <td>{r.codigo} · {r.asignatura}<div>{r.seccion}</div></td>
                  <td>{r.docente}</td>
                  <td>{r.inicio}</td>
                  <td>{r.hora}</td>
                  <td><strong>{r.minutosAtraso} min</strong></td>
                  <td><span className="entity-status status-red">Atrasado</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="empty-search">Cargando marcaciones y horarios desde Firebase...</div>}
        {!loading && filtered.length === 0 && <div className="empty-search">{atrasos.length ? 'No hay atrasos con los filtros seleccionados.' : 'Todavía no existen marcaciones que superen los 5 minutos de tolerancia.'}</div>}
        <footer className="data-footer"><span>Mostrando {filtered.length} de {atrasos.length} atrasos</span><span>Tolerancia: {TOLERANCIA} minutos</span></footer>
      </section>
    </div>
  )
}
