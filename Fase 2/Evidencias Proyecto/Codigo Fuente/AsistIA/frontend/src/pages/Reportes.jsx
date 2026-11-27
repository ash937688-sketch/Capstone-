import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, RefreshCw, Download, Users, BookOpen, ClipboardCheck, AlertTriangle, Clock3, FileText } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const TOLERANCIA = 5
const mins = value => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const day = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return ''
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return ''
  return ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][date.getUTCDay()]
}
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const matchesDates = (date, from, to) => (!from || date >= from) && (!to || date <= to)

export default function Reportes() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [data, setData] = useState({ alumnos: [], cursos: [], horarios: [], marcaciones: [], ausencias: [], incidencias: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cursoId, setCursoId] = useState('Todos')
  const [alumnoId, setAlumnoId] = useState('Todos')

  const request = useCallback(async path => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.ok) throw new Error(result.message || `Error ${response.status} en ${path}`)
    return result
  }, [token])

  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [a, c, h, m, u, i] = await Promise.all([
        request('/api/alumnos'), request('/api/cursos'), request('/api/horarios'),
        request('/api/marcaciones'), request('/api/ausencias'), request('/api/incidencias'),
      ])
      setData({ alumnos: a.alumnos || [], cursos: c.cursos || [], horarios: h.horarios || [],
        marcaciones: m.marcaciones || [], ausencias: u.ausencias || [], incidencias: i.incidencias || [] })
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [token, isAdmin, request])
  useEffect(() => { load() }, [load])

  const computed = useMemo(() => {
    const horarios = new Map(data.horarios.map(h => [h.id, h]))
    const courseOf = item => item.cursoId || horarios.get(item.horarioId)?.cursoId || ''
    const included = item => (cursoId === 'Todos' || courseOf(item) === cursoId) &&
      (alumnoId === 'Todos' || item.alumnoId === alumnoId) && matchesDates(item.fecha || '', desde, hasta)
    const marks = data.marcaciones.filter(included).map(m => {
      const h = horarios.get(m.horarioId)
      const start = mins(h?.inicio), arrival = mins(m.hora), finish = mins(h?.fin)
      const valid = !!h && start !== null && arrival !== null && norm(h.dia) === norm(day(m.fecha)) &&
        (finish === null || arrival <= finish)
      const delay = valid ? Math.max(0, arrival - start) : null
      return { ...m, course: courseOf(m), delay, late: delay !== null && delay > TOLERANCIA,
        tolerance: delay !== null && delay > 0 && delay <= TOLERANCIA }
    })
    const absences = data.ausencias.filter(included)
    // Las incidencias tienen fecha de creación, no fecha académica.
    const incidents = data.incidencias.filter(i =>
      (alumnoId === 'Todos' || i.alumnoId === alumnoId) &&
      matchesDates(String(i.createdAt || '').slice(0, 10), desde, hasta) &&
      cursoId === 'Todos')
    const late = marks.filter(m => m.late)
    const students = data.alumnos.filter(a => alumnoId === 'Todos' || a.id === alumnoId)
    const courses = data.cursos.filter(c => cursoId === 'Todos' || c.id === cursoId)
    const byStudent = students.map(a => {
      const sm = marks.filter(m => m.alumnoId === a.id)
      const sa = absences.filter(v => v.alumnoId === a.id)
      const sl = sm.filter(m => m.late)
      const total = sm.length + sa.length
      return { id: a.id, nombre: a.nombre || '', rut: a.rut || '', marcaciones: sm.length,
        ausencias: sa.length, atrasos: sl.length, minutos: sl.reduce((n, m) => n + m.delay, 0),
        porcentaje: total ? Math.round(sm.length / total * 100) : null }
    }).filter(s => s.marcaciones || s.ausencias)
    const byCourse = courses.map(c => {
      const cm = marks.filter(m => m.course === c.id)
      const ca = absences.filter(a => courseOf(a) === c.id)
      const total = cm.length + ca.length
      return { id: c.id, codigo: c.codigo || '', asignatura: c.asignatura || c.nombre || '',
        seccion: c.seccion || '', marcaciones: cm.length, ausencias: ca.length,
        atrasos: cm.filter(m => m.late).length, porcentaje: total ? Math.round(cm.length / total * 100) : null }
    }).filter(c => c.marcaciones || c.ausencias)
    const total = marks.length + absences.length
    return { marks, absences, incidents, late, byStudent, byCourse,
      stats: { alumnos: students.length, cursos: courses.length, marcaciones: marks.length,
        ausencias: absences.length, atrasos: late.length,
        minutos: late.reduce((n, m) => n + m.delay, 0),
        tolerancia: marks.filter(m => m.tolerance).length,
        porcentaje: total ? Math.round(marks.length / total * 100) : null,
        justificadas: absences.filter(a => a.estado === 'Justificada').length,
        noJustificadas: absences.filter(a => a.estado === 'No justificada').length,
        pendientes: absences.filter(a => a.estado === 'Pendiente').length,
        incidencias: incidents.length,
        abiertas: incidents.filter(i => i.estado === 'Abierta').length,
        proceso: incidents.filter(i => i.estado === 'En proceso').length,
        resueltas: incidents.filter(i => i.estado === 'Resuelta').length } }
  }, [data, desde, hasta, cursoId, alumnoId])

  const exportCSV = (type) => {
    const headers = type === 'alumnos' ? ['Alumno','RUT','Marcaciones','Ausencias','Atrasos','Minutos de atraso','Asistencia observada (%)'] :
      ['Código','Asignatura','Sección','Marcaciones','Ausencias','Atrasos','Asistencia observada (%)']
    const rows = (type === 'alumnos' ? computed.byStudent : computed.byCourse).map(v => type === 'alumnos' ?
      [v.nombre,v.rut,v.marcaciones,v.ausencias,v.atrasos,v.minutos,v.porcentaje ?? 'Sin datos'] :
      [v.codigo,v.asignatura,v.seccion,v.marcaciones,v.ausencias,v.atrasos,v.porcentaje ?? 'Sin datos'])
    const text = '\uFEFF' + [headers, ...rows].map(row => row.map(csv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = `asistia_reporte_${type}_${today()}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if (!isAdmin) return <div className="entity-page"><h2>Informes</h2><p>Este módulo requiere permisos de administración.</p></div>
  const s = computed.stats
  const cards = [
    ['Alumnos', s.alumnos, 'Alumnos registrados', 'blue', Users],
    ['Cursos', s.cursos, 'Cursos registrados', 'purple', BookOpen],
    ['Marcaciones', s.marcaciones, 'Registros en el período', 'green', ClipboardCheck],
    ['Ausencias', s.ausencias, 'Registros en el período', 'orange', AlertTriangle],
    ['Atrasos', s.atrasos, 'Más de 5 minutos', 'orange', Clock3],
    ['Minutos de atraso', s.minutos, 'Minutos reales acumulados', 'purple', Clock3],
    ['Incidencias', s.incidencias, 'Sin filtro por curso', 'blue', FileText],
    ['Asistencia observada', s.porcentaje === null ? '—' : `${s.porcentaje}%`, 'Marcaciones / (marcaciones + ausencias)', 'green', BarChart3],
  ]
  return <div className="entity-page">
    <header className="entity-header"><div><p className="entity-kicker">ANÁLISIS ACADÉMICO</p><h1>Informes</h1><p>Resumen de registros reales de AsistencialIA</p></div>
      <div className="entity-header-actions"><button className="secondary-action" type="button" onClick={load} disabled={loading}><RefreshCw size={17}/>Actualizar</button></div></header>
    {error && <div className="page-notice" role="alert" style={{ color:'#b42318',background:'#fef2f2',border:'1px solid #fecaca' }}>{error}</div>}
    <section className="data-panel" style={{ padding:18, marginBottom:18 }}>
      <h2 style={{ margin:'0 0 14px',fontSize:17 }}>Filtros de informes</h2>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12 }}>
        <label style={{ display:'grid',gap:5,fontSize:12,fontWeight:600 }}>Desde<input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{padding:9,border:'1px solid #dfe5ed',borderRadius:8}}/></label>
        <label style={{ display:'grid',gap:5,fontSize:12,fontWeight:600 }}>Hasta<input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{padding:9,border:'1px solid #dfe5ed',borderRadius:8}}/></label>
        <label style={{ display:'grid',gap:5,fontSize:12,fontWeight:600 }}>Curso<select value={cursoId} onChange={e=>setCursoId(e.target.value)} style={{padding:9,border:'1px solid #dfe5ed',borderRadius:8}}><option value="Todos">Todos los cursos</option>{data.cursos.map(c=><option key={c.id} value={c.id}>{c.codigo || ''} · {c.asignatura || c.nombre || ''} · {c.seccion || ''}</option>)}</select></label>
        <label style={{ display:'grid',gap:5,fontSize:12,fontWeight:600 }}>Alumno<select value={alumnoId} onChange={e=>setAlumnoId(e.target.value)} style={{padding:9,border:'1px solid #dfe5ed',borderRadius:8}}><option value="Todos">Todos los alumnos</option>{data.alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre} · {a.rut}</option>)}</select></label>
      </div>
      <button type="button" className="secondary-action" style={{marginTop:12}} onClick={()=>{setDesde('');setHasta('');setCursoId('Todos');setAlumnoId('Todos')}}>Limpiar filtros</button>
      {desde && hasta && desde > hasta && <p style={{color:'#b42318'}}>La fecha Desde es posterior a Hasta.</p>}
    </section>
    <section className="entity-stats" style={{gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))'}}>
      {cards.map(([label,value,note,color,Icon])=><article key={label}><div className={`entity-stat-icon ${color}`}><Icon size={20}/></div><div style={{display:'flex',flexDirection:'column',gap:5,minWidth:0}}><span>{label}</span><strong>{loading?'…':value}</strong><small>{note}</small></div></article>)}
    </section>
    <section className="data-panel" style={{padding:18,marginTop:18}}>
      <h2 style={{fontSize:17,margin:'0 0 12px'}}>Detalle del período</h2>
      <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:13,color:'#45536a'}}>
        <span>Dentro de tolerancia: <strong>{s.tolerancia}</strong></span><span>Ausencias pendientes: <strong>{s.pendientes}</strong></span>
        <span>Justificadas: <strong>{s.justificadas}</strong></span><span>No justificadas: <strong>{s.noJustificadas}</strong></span>
        <span>Incidencias abiertas: <strong>{s.abiertas}</strong></span><span>En proceso: <strong>{s.proceso}</strong></span><span>Resueltas: <strong>{s.resueltas}</strong></span>
      </div>
      <p style={{fontSize:12,color:'#64748b',marginTop:12}}>La asistencia observada considera solo marcaciones y ausencias registradas; no representa todas las clases programadas. Los atrasos se calculan desde el horario actual con 5 minutos de tolerancia. Las incidencias no están vinculadas a cursos y se omiten al filtrar por curso.</p>
    </section>
    <section className="data-panel" style={{marginTop:18}}><div className="data-toolbar"><div><h2>Resumen por alumno</h2><span>{computed.byStudent.length} alumnos con registros</span></div><button className="secondary-action" type="button" disabled={!computed.byStudent.length} onClick={()=>exportCSV('alumnos')}><Download size={17}/>Exportar CSV</button></div>
      <div className="table-wrapper" style={{overflowX:'auto'}}><table className="entity-table" style={{minWidth:720}}><thead><tr>{['Alumno','RUT','Marcaciones','Ausencias','Atrasos','Minutos','Asistencia observada'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{computed.byStudent.map(a=><tr key={a.id}><td>{a.nombre}</td><td>{a.rut}</td><td>{a.marcaciones}</td><td>{a.ausencias}</td><td>{a.atrasos}</td><td>{a.minutos}</td><td>{a.porcentaje === null?'—':`${a.porcentaje}%`}</td></tr>)}</tbody></table>{!loading && !computed.byStudent.length && <div className="empty-search">No hay registros de alumnos para estos filtros.</div>}</div></section>
    <section className="data-panel" style={{marginTop:18}}><div className="data-toolbar"><div><h2>Resumen por curso</h2><span>{computed.byCourse.length} cursos con registros</span></div><button className="secondary-action" type="button" disabled={!computed.byCourse.length} onClick={()=>exportCSV('cursos')}><Download size={17}/>Exportar CSV</button></div>
      <div className="table-wrapper" style={{overflowX:'auto'}}><table className="entity-table" style={{minWidth:700}}><thead><tr>{['Código','Asignatura','Sección','Marcaciones','Ausencias','Atrasos','Asistencia observada'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{computed.byCourse.map(c=><tr key={c.id}><td>{c.codigo}</td><td>{c.asignatura}</td><td>{c.seccion}</td><td>{c.marcaciones}</td><td>{c.ausencias}</td><td>{c.atrasos}</td><td>{c.porcentaje === null?'—':`${c.porcentaje}%`}</td></tr>)}</tbody></table>{!loading && !computed.byCourse.length && <div className="empty-search">No hay registros de cursos para estos filtros.</div>}</div></section>
  </div>
}
