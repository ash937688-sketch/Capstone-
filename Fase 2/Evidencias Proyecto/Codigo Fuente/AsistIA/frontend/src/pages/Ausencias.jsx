import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Plus, RefreshCw, Search, Trash2, X, Pencil, Clock3 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const blank = () => ({ alumnoId: '', horarioId: '', fecha: today(), motivo: '', observaciones: '' })
const normal = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const dayOf = date => { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''; const d = new Date(`${date}T12:00:00Z`); return ['Domingo','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado'][d.getUTCDay()] }
const csv = v => `"${String(v ?? '').replaceAll('"','""')}"`

export default function Ausencias() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [ausencias, setAusencias] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [horarios, setHorarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [modal, setModal] = useState(null)
  const [edit, setEdit] = useState(null)

  const request = useCallback(async (path, options={}) => {
    const response = await fetch(path, { ...options, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...options.headers } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.ok) throw new Error(result.message || `Error ${response.status}`)
    return result
  }, [token])
  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [a,b,c] = await Promise.all([request('/api/ausencias'),request('/api/alumnos'),request('/api/horarios')])
      setAusencias(a.ausencias || []); setAlumnos(b.alumnos || []); setHorarios(c.horarios || [])
    } catch(e) { setError(e.message) } finally { setLoading(false) }
  }, [token,isAdmin,request])
  useEffect(() => { load() }, [load])
  const available = useMemo(() => horarios.filter(h => h.estado !== 'Cancelada' && modal && normal(h.dia) === normal(dayOf(modal.fecha))), [horarios,modal])
  const filtered = useMemo(() => ausencias.filter(a => (filter === 'Todos' || a.estado === filter) && [a.alumno,a.rut,a.codigo,a.asignatura,a.seccion,a.docente,a.fecha,a.motivo].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [ausencias,filter,query])
  const stats = [
    ['Total de ausencias',ausencias.length,'Registros en Firebase','blue',ClipboardList],
    ['Pendientes',ausencias.filter(a => a.estado === 'Pendiente').length,'Por revisar','orange',Clock3],
    ['Justificadas',ausencias.filter(a => a.estado === 'Justificada').length,'Con justificación','green',CheckCircle2],
    ['No justificadas',ausencias.filter(a => a.estado === 'No justificada').length,'Sin justificación aceptada','purple',AlertTriangle],
  ]
  const horarioLabel = h => `${h.codigo} · ${h.asignatura} · ${h.seccion} · ${h.dia} ${h.inicio}–${h.fin}`
  const save = async e => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try { await request('/api/ausencias', { method:'POST', body:JSON.stringify(modal) }); setModal(null); setNotice('Ausencia registrada correctamente.'); await load() }
    catch(e) { setError(e.message) } finally { setSaving(false) }
  }
  const saveEdit = async e => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try { await request(`/api/ausencias/${encodeURIComponent(edit.id)}`, { method:'PUT', body:JSON.stringify({estado:edit.estado,motivo:edit.motivo,observaciones:edit.observaciones}) }); setEdit(null); setNotice('Justificación actualizada correctamente.'); await load() }
    catch(e) { setError(e.message) } finally { setSaving(false) }
  }
  const remove = async a => {
    if (!window.confirm(`¿Eliminar la ausencia de ${a.alumno} del ${a.fecha}?`)) return
    setError(''); setNotice('')
    try { await request(`/api/ausencias/${encodeURIComponent(a.id)}`,{method:'DELETE'}); setNotice('Ausencia eliminada.'); await load() }
    catch(e) { setError(e.message) }
  }
  const exportCSV = () => {
    const headers = ['Fecha','Alumno','RUT','Código','Asignatura','Sección','Docente','Estado','Motivo','Observaciones']
    const rows = filtered.map(a => [a.fecha,a.alumno,a.rut,a.codigo,a.asignatura,a.seccion,a.docente,a.estado,a.motivo,a.observaciones])
    const content = '\uFEFF' + [headers,...rows].map(r => r.map(csv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8;'}))
    const link = document.createElement('a'); link.href=url; link.download='ausencias_asistia.csv'; link.click(); URL.revokeObjectURL(url)
  }
  if (!isAdmin) return <div className="entity-page"><h2>Ausencias</h2><p>Este módulo requiere permisos de administración.</p></div>
  return <div className="entity-page">
    <header className="entity-header">
      <div><p className="entity-kicker">GESTIÓN ACADÉMICA</p><h1>Ausencias</h1><p>Registro y justificación de inasistencias por clase.</p></div>
      <div className="entity-header-actions">
        <button type="button" className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={17}/>Actualizar</button>
        <button type="button" className="secondary-action" onClick={exportCSV} disabled={!filtered.length}><Download size={17}/>Exportar CSV</button>
        <button type="button" className="primary-action" onClick={() => { setError(''); setNotice(''); setModal(blank()) }}><Plus size={17}/>Nueva ausencia</button>
      </div>
    </header>
    {notice && <div className="page-notice" role="status"><CheckCircle2 size={17}/>{notice}</div>}
    {error && !modal && !edit && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}
    <section className="entity-stats">{stats.map(([label,value,note,color,Icon]) => <article key={label}><div className={`entity-stat-icon ${color}`}><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>)}</section>
    <section className="data-panel">
      <div className="data-toolbar"><div><h2>Historial de ausencias</h2><span>{ausencias.length} registros reales</span></div><div className="data-tools"><label><Search size={17}/><input aria-label="Buscar ausencias" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar alumno, RUT, curso..."/></label><select aria-label="Filtrar estado" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:'10px 12px',border:'1px solid #d9e2ec',borderRadius:8,background:'#fff'}}>{['Todos','Pendiente','Justificada','No justificada'].map(s=><option key={s}>{s}</option>)}</select></div></div>
      <div className="table-wrapper"><table className="entity-table"><thead><tr>{['Fecha','Alumno','Curso / Sección','Docente','Estado','Motivo','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(a=><tr key={a.id}><td>{a.fecha}</td><td><strong>{a.alumno}</strong><div style={{fontSize:12,color:'#64748b'}}>{a.rut}</div></td><td>{a.asignatura}<div style={{fontSize:12,color:'#64748b'}}>{a.codigo} · {a.seccion}</div></td><td>{a.docente}</td><td><span className={`entity-status ${a.estado==='Justificada'?'status-green':a.estado==='Pendiente'?'status-orange':'status-red'}`}>{a.estado}</span></td><td>{a.motivo || '—'}</td><td><div className="row-actions"><button type="button" title="Justificar o editar" aria-label={`Editar ausencia de ${a.alumno}`} onClick={()=>{setError('');setEdit({...a})}}><Pencil size={16}/></button><button type="button" title="Eliminar" aria-label={`Eliminar ausencia de ${a.alumno}`} onClick={()=>remove(a)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{loading && <div className="empty-search">Cargando ausencias...</div>}{!loading && !filtered.length && <div className="empty-search">{query || filter!=='Todos'?'No hay resultados con estos filtros.':'Todavía no hay ausencias registradas.'}</div>}</div>
      <footer className="data-footer"><span>Mostrando {filtered.length} de {ausencias.length} ausencias</span><button type="button" onClick={()=>{setQuery('');setFilter('Todos')}}>Ver todos</button></footer>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={()=>!saving&&setModal(null)}><section className="entity-modal" role="dialog" aria-modal="true" aria-labelledby="ausencia-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="entity-kicker">REGISTRO DE ASISTENCIA</p><h2 id="ausencia-title">Nueva ausencia</h2></div><button type="button" onClick={()=>setModal(null)} disabled={saving} aria-label="Cerrar"><X size={20}/></button></header><form onSubmit={save}><div className="modal-fields"><label>Alumno<select required value={modal.alumnoId} onChange={e=>setModal(m=>({...m,alumnoId:e.target.value}))}><option value="">Seleccionar alumno</option>{alumnos.filter(a=>a.estado==='Activo').map(a=><option key={a.id} value={a.id}>{a.nombre} · {a.rut}</option>)}</select></label><label>Fecha<input type="date" required value={modal.fecha} onChange={e=>setModal(m=>({...m,fecha:e.target.value,horarioId:''}))}/></label><label style={{gridColumn:'1 / -1'}}>Clase / Horario<select required value={modal.horarioId} onChange={e=>setModal(m=>({...m,horarioId:e.target.value}))}><option value="">Seleccionar clase</option>{available.map(h=><option key={h.id} value={h.id}>{horarioLabel(h)}</option>)}</select></label><label>Motivo (opcional)<input maxLength={160} value={modal.motivo} onChange={e=>setModal(m=>({...m,motivo:e.target.value}))} placeholder="Ej.: Motivo personal"/></label><label>Observaciones (opcional)<input maxLength={1000} value={modal.observaciones} onChange={e=>setModal(m=>({...m,observaciones:e.target.value}))} placeholder="Detalle adicional"/></label></div><p style={{fontSize:13,color:'#64748b'}}>Se muestran clases del día seleccionado. Las ausencias nuevas quedan pendientes de justificación.</p>{error && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}<footer><button type="button" className="secondary-action" onClick={()=>setModal(null)} disabled={saving}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving?'Guardando...':'Registrar ausencia'}</button></footer></form></section></div>}
    {edit && <div className="modal-backdrop" onMouseDown={()=>!saving&&setEdit(null)}><section className="entity-modal" role="dialog" aria-modal="true" aria-labelledby="justificacion-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="entity-kicker">GESTIÓN DE JUSTIFICACIONES</p><h2 id="justificacion-title">Editar ausencia</h2></div><button type="button" onClick={()=>setEdit(null)} disabled={saving} aria-label="Cerrar"><X size={20}/></button></header><form onSubmit={saveEdit}><p>{edit.alumno} · {edit.fecha}</p><div className="modal-fields"><label>Estado<select value={edit.estado} onChange={e=>setEdit(m=>({...m,estado:e.target.value}))}>{['Pendiente','Justificada','No justificada'].map(s=><option key={s}>{s}</option>)}</select></label><label>Motivo<input maxLength={160} value={edit.motivo||''} onChange={e=>setEdit(m=>({...m,motivo:e.target.value}))}/></label><label style={{gridColumn:'1 / -1'}}>Observaciones<textarea rows={3} maxLength={1000} value={edit.observaciones||''} onChange={e=>setEdit(m=>({...m,observaciones:e.target.value}))}/></label></div>{error && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}<footer><button type="button" className="secondary-action" onClick={()=>setEdit(null)} disabled={saving}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button></footer></form></section></div>}
  </div>
}
