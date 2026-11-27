import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Plus, RefreshCw, Search, Trash2, X, Pencil, Clock3 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const blank = () => ({ titulo: '', descripcion: '', categoria: 'Asistencia', prioridad: 'Media', alumnoId: '', observaciones: '' })
const csv = v => `"${String(v ?? '').replaceAll('"', '""')}"`
const categorias = ['Asistencia', 'Atraso', 'Conducta', 'Problema tecnico', 'Otra']
const prioridades = ['Baja', 'Media', 'Alta']
const estados = ['Abierta', 'En proceso', 'Resuelta']

export default function Incidencias() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'Administradora'
  const [incidencias, setIncidencias] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [modal, setModal] = useState(null)
  const [edit, setEdit] = useState(null)

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.ok) throw new Error(result.message || `Error ${response.status}`)
    return result
  }, [token])
  const load = useCallback(async () => {
    if (!token || !isAdmin) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const [i, a] = await Promise.all([request('/api/incidencias'), request('/api/alumnos')])
      setIncidencias(i.incidencias || []); setAlumnos(a.alumnos || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [token, isAdmin, request])
  useEffect(() => { load() }, [load])
  const filtered = useMemo(() => incidencias.filter(i =>
    (filter === 'Todos' || i.estado === filter) &&
    [i.titulo, i.descripcion, i.categoria, i.prioridad, i.alumno, i.rut, i.estado, i.observaciones].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  ), [incidencias, filter, query])
  const stats = [
    ['Total de incidencias', incidencias.length, 'Registros en Firebase', 'blue', ClipboardList],
    ['Abiertas', incidencias.filter(i => i.estado === 'Abierta').length, 'Pendientes de atención', 'orange', AlertTriangle],
    ['En proceso', incidencias.filter(i => i.estado === 'En proceso').length, 'En seguimiento', 'purple', Clock3],
    ['Resueltas', incidencias.filter(i => i.estado === 'Resuelta').length, 'Casos finalizados', 'green', CheckCircle2],
  ]
  const save = async e => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await request('/api/incidencias', { method: 'POST', body: JSON.stringify(modal) })
      setModal(null); setNotice('Incidencia registrada correctamente.'); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const saveEdit = async e => {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await request(`/api/incidencias/${encodeURIComponent(edit.id)}`, { method: 'PUT', body: JSON.stringify({ estado: edit.estado, observaciones: edit.observaciones || '' }) })
      setEdit(null); setNotice('Seguimiento actualizado correctamente.'); await load()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const remove = async i => {
    if (!window.confirm(`¿Eliminar la incidencia «${i.titulo}»?`)) return
    setError(''); setNotice('')
    try { await request(`/api/incidencias/${encodeURIComponent(i.id)}`, { method: 'DELETE' }); setNotice('Incidencia eliminada.'); await load() }
    catch (e) { setError(e.message) }
  }
  const exportCSV = () => {
    const headers = ['Fecha', 'Título', 'Categoría', 'Prioridad', 'Alumno', 'RUT', 'Estado', 'Descripción', 'Observaciones']
    const rows = filtered.map(i => [i.createdAt?.slice(0, 10), i.titulo, i.categoria, i.prioridad, i.alumno, i.rut, i.estado, i.descripcion, i.observaciones])
    const content = '\uFEFF' + [headers, ...rows].map(r => r.map(csv).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = 'incidencias_asistia.csv'; link.click(); URL.revokeObjectURL(url)
  }
  if (!isAdmin) return <div className="entity-page"><h2>Incidencias</h2><p>Este módulo requiere permisos de administración.</p></div>
  return <div className="entity-page">
    <header className="entity-header">
      <div><p className="entity-kicker">GESTIÓN ACADÉMICA</p><h1>Incidencias</h1><p>Registro, seguimiento y resolución de situaciones académicas.</p></div>
      <div className="entity-header-actions">
        <button type="button" className="secondary-action" onClick={load} disabled={loading}><RefreshCw size={17}/>Actualizar</button>
        <button type="button" className="secondary-action" onClick={exportCSV} disabled={!filtered.length}><Download size={17}/>Exportar CSV</button>
        <button type="button" className="primary-action" onClick={() => { setError(''); setNotice(''); setModal(blank()) }}><Plus size={17}/>Nueva incidencia</button>
      </div>
    </header>
    {notice && <div className="page-notice" role="status"><CheckCircle2 size={17}/>{notice}</div>}
    {error && !modal && !edit && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}
    <section className="entity-stats">{stats.map(([label,value,note,color,Icon]) => <article key={label}><div className={`entity-stat-icon ${color}`}><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>)}</section>
    <section className="data-panel">
      <div className="data-toolbar"><div><h2>Historial de incidencias</h2><span>{incidencias.length} registros reales</span></div><div className="data-tools"><label><Search size={17}/><input aria-label="Buscar incidencias" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar título, alumno, categoría..."/></label><select aria-label="Filtrar estado" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:'10px 12px',border:'1px solid #d9e2ec',borderRadius:8,background:'#fff'}}>{['Todos', ...estados].map(s=><option key={s}>{s}</option>)}</select></div></div>
      <div className="table-wrapper"><table className="entity-table"><thead><tr>{['Fecha','Incidencia','Alumno','Categoría','Prioridad','Estado','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(i=><tr key={i.id}><td>{i.createdAt?.slice(0,10) || '—'}</td><td><strong>{i.titulo}</strong><div style={{fontSize:12,color:'#64748b',maxWidth:280,overflowWrap:'anywhere'}}>{i.descripcion}</div></td><td>{i.alumno || 'General'}<div style={{fontSize:12,color:'#64748b'}}>{i.rut || ''}</div></td><td>{i.categoria}</td><td><span className={`entity-status ${i.prioridad==='Alta'?'status-red':i.prioridad==='Media'?'status-orange':'status-green'}`}>{i.prioridad}</span></td><td><span className={`entity-status ${i.estado==='Resuelta'?'status-green':i.estado==='En proceso'?'status-orange':'status-red'}`}>{i.estado}</span></td><td><div className="row-actions"><button type="button" title="Editar seguimiento" aria-label={`Editar ${i.titulo}`} onClick={()=>{setError('');setEdit({...i})}}><Pencil size={16}/></button><button type="button" title="Eliminar" aria-label={`Eliminar ${i.titulo}`} onClick={()=>remove(i)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{loading && <div className="empty-search">Cargando incidencias...</div>}{!loading && !filtered.length && <div className="empty-search">{query || filter!=='Todos'?'No hay resultados con estos filtros.':'Todavía no hay incidencias registradas.'}</div>}</div>
      <footer className="data-footer"><span>Mostrando {filtered.length} de {incidencias.length} incidencias</span><button type="button" onClick={()=>{setQuery('');setFilter('Todos')}}>Ver todos</button></footer>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={()=>!saving&&setModal(null)}><section className="entity-modal" role="dialog" aria-modal="true" aria-labelledby="incidencia-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="entity-kicker">REGISTRO DE INCIDENCIAS</p><h2 id="incidencia-title">Nueva incidencia</h2></div><button type="button" onClick={()=>setModal(null)} disabled={saving} aria-label="Cerrar"><X size={20}/></button></header><form onSubmit={save}><div className="modal-fields"><label style={{gridColumn:'1 / -1'}}>Título<input required minLength={3} maxLength={160} value={modal.titulo} onChange={e=>setModal(m=>({...m,titulo:e.target.value}))} placeholder="Ej.: Problema de acceso a clase"/></label><label>Categoría<select value={modal.categoria} onChange={e=>setModal(m=>({...m,categoria:e.target.value}))}>{categorias.map(c=><option key={c}>{c}</option>)}</select></label><label>Prioridad<select value={modal.prioridad} onChange={e=>setModal(m=>({...m,prioridad:e.target.value}))}>{prioridades.map(p=><option key={p}>{p}</option>)}</select></label><label style={{gridColumn:'1 / -1'}}>Alumno (opcional)<select value={modal.alumnoId} onChange={e=>setModal(m=>({...m,alumnoId:e.target.value}))}><option value="">Incidencia general / sin alumno</option>{alumnos.map(a=><option key={a.id} value={a.id}>{a.nombre} · {a.rut}</option>)}</select></label><label style={{gridColumn:'1 / -1'}}>Descripción<textarea required minLength={5} maxLength={3000} rows={3} value={modal.descripcion} onChange={e=>setModal(m=>({...m,descripcion:e.target.value}))} placeholder="Describe qué ocurrió"/></label><label style={{gridColumn:'1 / -1'}}>Observaciones (opcional)<textarea maxLength={2000} rows={2} value={modal.observaciones} onChange={e=>setModal(m=>({...m,observaciones:e.target.value}))} placeholder="Información adicional"/></label></div><p style={{fontSize:13,color:'#64748b'}}>Las incidencias nuevas se registran con estado Abierta.</p>{error && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}<footer><button type="button" className="secondary-action" onClick={()=>setModal(null)} disabled={saving}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving?'Guardando...':'Registrar incidencia'}</button></footer></form></section></div>}
    {edit && <div className="modal-backdrop" onMouseDown={()=>!saving&&setEdit(null)}><section className="entity-modal" role="dialog" aria-modal="true" aria-labelledby="seguimiento-title" onMouseDown={e=>e.stopPropagation()}><header><div><p className="entity-kicker">SEGUIMIENTO DE INCIDENCIAS</p><h2 id="seguimiento-title">Actualizar seguimiento</h2></div><button type="button" onClick={()=>setEdit(null)} disabled={saving} aria-label="Cerrar"><X size={20}/></button></header><form onSubmit={saveEdit}><p><strong>{edit.titulo}</strong></p><p style={{fontSize:13,color:'#64748b'}}>{edit.descripcion}</p><div className="modal-fields"><label>Estado<select value={edit.estado} onChange={e=>setEdit(m=>({...m,estado:e.target.value}))}>{estados.map(s=><option key={s}>{s}</option>)}</select></label><label style={{gridColumn:'1 / -1'}}>Observaciones<textarea rows={4} maxLength={2000} value={edit.observaciones||''} onChange={e=>setEdit(m=>({...m,observaciones:e.target.value}))}/></label></div>{error && <div className="page-notice" role="alert" style={{color:'#b42318',backgroundColor:'#fef2f2',border:'1px solid #fecaca'}}><AlertTriangle size={17}/>{error}</div>}<footer><button type="button" className="secondary-action" onClick={()=>setEdit(null)} disabled={saving}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving?'Guardando...':'Guardar cambios'}</button></footer></form></section></div>}
  </div>
}
