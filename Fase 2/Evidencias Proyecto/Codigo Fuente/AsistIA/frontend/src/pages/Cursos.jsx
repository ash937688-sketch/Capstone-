import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Plus, Download, BookOpen, Users, CheckCircle2, AlertTriangle, X, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const emptyForm = {
  codigo: '', asignatura: '', seccion: '', docente: '', horario: '',
  inscritos: 0, cupos: 36, periodo: '2026-2', estado: 'Activo',
}
const columns = ['Código', 'Asignatura', 'Sección', 'Docente', 'Horario', 'Inscritos / Cupos', 'Estado']

export default function Cursos() {
  const { token, user } = useAuth()
  const [cursos, setCursos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)
  const isAdmin = user?.role === 'Administradora'

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.ok) throw new Error(result.message || 'No fue posible completar la operación.')
    return result
  }, [token])

  const load = useCallback(async () => {
    if (!token) { setCursos([]); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const result = await request('/api/cursos')
      setCursos(result.cursos || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [request, token])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => cursos.filter(c =>
    [c.codigo, c.asignatura, c.seccion, c.docente, c.horario, c.periodo, c.estado]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase())
  ), [cursos, query])

  const save = async event => {
    event.preventDefault()
    if (!modal || saving) return
    const inscritos = Number(modal.inscritos)
    const cupos = Number(modal.cupos)
    if (!Number.isInteger(inscritos) || !Number.isInteger(cupos) || inscritos < 0 || cupos < 1 || inscritos > cupos) {
      setError('Los inscritos deben ser un número entero entre 0 y los cupos disponibles.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { id, createdAt, updatedAt, ...data } = modal
      data.inscritos = inscritos
      data.cupos = cupos
      await request(id ? `/api/cursos/${id}` : '/api/cursos', {
        method: id ? 'PUT' : 'POST', body: JSON.stringify(data),
      })
      setModal(null)
      setNotice(id ? 'Curso actualizado correctamente.' : 'Curso registrado en Firestore.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const remove = async curso => {
    if (!window.confirm(`¿Eliminar ${curso.codigo}, sección ${curso.seccion}? Esta acción no se puede deshacer.`)) return
    setError('')
    try {
      await request(`/api/cursos/${curso.id}`, { method: 'DELETE' })
      setNotice('Curso eliminado correctamente.')
      await load()
    } catch (err) { setError(err.message) }
  }

  const exportCsv = () => {
    const rows = [
      ['Código', 'Asignatura', 'Sección', 'Docente', 'Horario', 'Inscritos', 'Cupos', 'Período', 'Estado'],
      ...filtered.map(c => [c.codigo, c.asignatura, c.seccion, c.docente, c.horario, c.inscritos, c.cupos, c.periodo, c.estado]),
    ]
    const csv = rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cursos-asistia.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const active = cursos.filter(c => c.estado === 'Activo').length
  const asignaturas = new Set(cursos.map(c => c.codigo).filter(Boolean)).size
  const inscritos = cursos.reduce((sum, c) => sum + (Number(c.inscritos) || 0), 0)
  const cupos = cursos.reduce((sum, c) => sum + (Number(c.cupos) || 0), 0)
  const ocupacion = cupos ? Math.round(inscritos / cupos * 100) : 0
  const sinDocente = cursos.filter(c => !c.docente?.trim() || c.docente.trim().toLowerCase() === 'por asignar').length
  const stats = [
    ['Cursos activos', active, `${cursos.length} cursos registrados`, 'blue', BookOpen],
    ['Asignaturas', asignaturas, 'Códigos distintos', 'purple', CheckCircle2],
    ['Cupos utilizados', `${ocupacion}%`, `${inscritos} de ${cupos} cupos`, 'green', Users],
    ['Sin docente', sinDocente, 'Asignación pendiente', 'orange', AlertTriangle],
  ]

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div>
          <p className="entity-kicker">GESTIÓN ACADÉMICA</p>
          <h1>Cursos y asignaturas</h1>
          <p>Oferta académica, secciones y ocupación registradas en Firestore.</p>
        </div>
        <div className="entity-header-actions">
          <button type="button" className="secondary-action" onClick={exportCsv}><Download size={17} />Exportar</button>
          {isAdmin && <button type="button" className="primary-action" onClick={() => { setError(''); setModal({ ...emptyForm }) }}><Plus size={18} />Crear curso</button>}
        </div>
      </header>

      {notice && <div className="page-notice"><CheckCircle2 size={17} />{notice}</div>}
      {error && <div className="page-notice" role="alert" style={{ color: '#b42318' }}><AlertTriangle size={17} />{error}</div>}

      <section className="entity-stats">
        {stats.map(([label, value, note, color, Icon]) => (
          <article key={label}>
            <div className={`entity-stat-icon ${color}`}><Icon size={20} /></div>
            <div><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString('es-CL') : value}</strong><small>{note}</small></div>
          </article>
        ))}
      </section>

      <section className="data-panel">
        <div className="data-toolbar">
          <div><h2>Cursos registrados</h2><span>{cursos.length} registros reales</span></div>
          <div className="data-tools"><label><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar curso…" /></label></div>
        </div>
        <div className="table-wrapper">
          <table className="entity-table">
            <thead><tr>{columns.map(col => <th key={col}>{col}</th>)}{isAdmin && <th>Acciones</th>}</tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td><div className="entity-name"><span>{String(c.codigo || 'CU').slice(0, 2).toUpperCase()}</span><strong>{c.codigo}</strong></div></td>
                  <td>{c.asignatura || '—'}</td>
                  <td>{c.seccion || '—'}</td>
                  <td>{c.docente || 'Por asignar'}</td>
                  <td>{c.horario || '—'}</td>
                  <td>{c.inscritos ?? 0} / {c.cupos ?? 0}</td>
                  <td><span className={`entity-status ${c.estado === 'Activo' ? 'status-green' : 'status-red'}`}>{c.estado}</span></td>
                  {isAdmin && <td><div className="row-actions">
                    <button type="button" title="Editar" onClick={() => { setError(''); setModal({ ...c }) }}><Pencil size={15} /></button>
                    <button type="button" title="Eliminar" onClick={() => remove(c)}><Trash2 size={15} /></button>
                  </div></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty-search">Cargando cursos desde Firestore…</div>}
          {!loading && filtered.length === 0 && <div className="empty-search">{query ? 'No se encontraron cursos.' : 'Todavía no hay cursos registrados. Crea el primero.'}</div>}
        </div>
        <footer className="data-footer"><span>Mostrando {filtered.length} de {cursos.length} cursos</span><button type="button" onClick={() => setQuery('')}>Ver todos</button></footer>
      </section>

      {modal && <div className="modal-backdrop" onMouseDown={() => !saving && setModal(null)}>
        <section className="entity-modal" onMouseDown={e => e.stopPropagation()}>
          <header>
            <div><p className="entity-kicker">{modal.id ? 'EDITAR CURSO' : 'NUEVO CURSO'}</p><h2>{modal.id ? 'Editar curso' : 'Crear curso'}</h2></div>
            <button type="button" onClick={() => setModal(null)} disabled={saving}><X size={20} /></button>
          </header>
          <form onSubmit={save}>
            <div className="modal-fields">
              {[
                ['codigo', 'Código', 'text', true],
                ['asignatura', 'Asignatura', 'text', true],
                ['seccion', 'Sección', 'text', true],
                ['docente', 'Docente (opcional)', 'text', false],
                ['horario', 'Horario', 'text', true],
                ['inscritos', 'Inscritos', 'number', true],
                ['cupos', 'Cupos máximos', 'number', true],
                ['periodo', 'Período académico', 'text', true],
              ].map(([key, label, type, required]) => (
                <label key={key}>{label}
                  <input type={type} value={modal[key] ?? ''} required={required}
                    min={type === 'number' ? (key === 'cupos' ? 1 : 0) : undefined}
                    max={type === 'number' ? 100000 : undefined}
                    step={type === 'number' ? 1 : undefined}
                    maxLength={type === 'text' ? 120 : undefined}
                    onChange={e => setModal(prev => ({ ...prev, [key]: type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value }))} />
                </label>
              ))}
              <label>Estado<select value={modal.estado} onChange={e => setModal(prev => ({ ...prev, estado: e.target.value }))}><option>Activo</option><option>Inactivo</option></select></label>
            </div>
            <footer>
              <button type="button" className="secondary-action" onClick={() => setModal(null)} disabled={saving}>Cancelar</button>
              <button type="submit" className="primary-action" disabled={saving}>{saving ? 'Guardando…' : modal.id ? 'Guardar cambios' : 'Crear curso'}</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  )
}
