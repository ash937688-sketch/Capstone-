
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Download,
  Users,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const emptyForm = {
  nombre: '',
  correo: '',
  especialidad: '',
  cursos: 0,
  jornada: 'Diurna',
  estado: 'Activo',
}

const columns = [
  'Docente',
  'Correo',
  'Especialidad',
  'Cursos',
  'Jornada',
  'Estado',
]

export default function Docentes() {
  const { token, user } = useAuth()

  const [docentes, setDocentes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)

  const isAdmin = user?.role === 'Administradora'

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      })

      const result = await response
        .json()
        .catch(() => ({}))

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message ||
          'No fue posible completar la operación.'
        )
      }

      return result
    },
    [token]
  )

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await request('/api/docentes')
      setDocentes(result.docentes || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [request, token])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    return docentes.filter(docente =>
      [
        docente.nombre,
        docente.correo,
        docente.especialidad,
        docente.cursos,
        docente.jornada,
        docente.estado,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
  }, [docentes, query])

  const save = async event => {
    event.preventDefault()

    if (!modal || saving) return

    setSaving(true)
    setError('')

    try {
      const { id, ...data } = modal
      data.cursos = Number(data.cursos)

      await request(
        id ? `/api/docentes/${id}` : '/api/docentes',
        {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      )

      setModal(null)

      setNotice(
        id
          ? 'Docente actualizado correctamente.'
          : 'Docente registrado en Firestore.'
      )

      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async docente => {
    if (
      !window.confirm(
        `¿Eliminar a ${docente.nombre}? Esta acción no se puede deshacer.`
      )
    ) {
      return
    }

    setError('')

    try {
      await request(`/api/docentes/${docente.id}`, {
        method: 'DELETE',
      })

      setNotice('Docente eliminado correctamente.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const exportCsv = () => {
    const data = [
      columns,
      ...filtered.map(d => [
        d.nombre,
        d.correo,
        d.especialidad,
        d.cursos,
        d.jornada,
        d.estado,
      ]),
    ]

    const csv = data
      .map(row =>
        row
          .map(value =>
            `"${String(value ?? '').replaceAll('"', '""')}"`
          )
          .join(';')
      )
      .join('\r\n')

    const url = URL.createObjectURL(
      new Blob(['\ufeff', csv], {
        type: 'text/csv;charset=utf-8;',
      })
    )

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'docentes-asistia.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const active = docentes.filter(d => d.estado === 'Activo').length
  const inactive = docentes.filter(d => d.estado === 'Inactivo').length
  const pending = docentes.filter(d => d.estado === 'Pendiente').length
  const totalCursos = docentes.reduce(
    (sum, d) => sum + (Number(d.cursos) || 0),
    0
  )

  const stats = [
    ['Total docentes', docentes.length, 'Registros en Firestore', 'blue', Users],
    ['Activos', active, 'Docentes activos', 'green', CheckCircle2],
    ['Pendientes', pending, `${inactive} inactivos`, 'orange', AlertTriangle],
    ['Cursos asignados', totalCursos, 'Suma de cursos registrados', 'purple', BookOpen],
  ]

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div>
          <p className="entity-kicker">
            GESTIÓN ACADÉMICA
          </p>

          <h1>Docentes</h1>

          <p>
            Gestión de docentes registrados
            en Firestore.
          </p>
        </div>

        <div className="entity-header-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={exportCsv}
          >
            <Download size={17} />
            Exportar
          </button>

          {isAdmin && (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                setError('')
                setModal({ ...emptyForm })
              }}
            >
              <Plus size={18} />
              Nuevo docente
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className="page-notice">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}

      {error && (
        <div
          className="page-notice"
          role="alert" style={{ color: '#b42318', backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
          <AlertTriangle size={17} />
          {error}
        </div>
      )}

      <section className="entity-stats">
        {stats.map(
          ([label, value, note, color, Icon]) => (
            <article key={label}>
              <div
                className={`entity-stat-icon ${color}`}
              >
                <Icon size={20} />
              </div>

              <div>
                <span>{label}</span>

                <strong>
                  {value.toLocaleString('es-CL')}
                </strong>

                <small>{note}</small>
              </div>
            </article>
          )
        )}
      </section>

      <section className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Docentes registrados</h2>

            <span>
              {docentes.length} registros reales
            </span>
          </div>

          <div className="data-tools">
            <label>
              <Search size={17} />

              <input
                value={query}
                onChange={event =>
                  setQuery(event.target.value)
                }
                placeholder="Buscar docente…"
              />
            </label>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="entity-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col}>{col}</th>
                ))}

                {isAdmin && <th>Acciones</th>}
              </tr>
            </thead>

            <tbody>
              {filtered.map(docente => (
                <tr key={docente.id}>
                  <td>
                    <div className="entity-name">
                      <span>
                        {docente.nombre
                          .split(' ')
                          .map(p => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </span>

                      <strong>
                        {docente.nombre}
                      </strong>
                    </div>
                  </td>

                  <td>{docente.correo || '—'}</td>
                  <td>{docente.especialidad || '—'}</td>
                  <td>{docente.cursos ?? 0}</td>
                  <td>{docente.jornada || '—'}</td>

                  <td>
                    <span
                      className={`entity-status ${
                        docente.estado === 'Activo'
                          ? 'status-green'
                          : docente.estado === 'Pendiente'
                            ? 'status-orange'
                            : 'status-red'
                      }`}
                    >
                      {docente.estado}
                    </span>
                  </td>

                  {isAdmin && (
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => {
                            setError('')
                            setModal({ ...docente })
                          }}
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() =>
                            remove(docente)
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="empty-search">
              Cargando docentes desde Firestore…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty-search">
              {query
                ? 'No se encontraron docentes.'
                : 'Todavía no hay docentes registrados. Crea el primero.'}
            </div>
          )}
        </div>

        <footer className="data-footer">
          <span>
            Mostrando {filtered.length} de{' '}
            {docentes.length} docentes
          </span>

          <button
            type="button"
            onClick={() => setQuery('')}
          >
            Ver todos
          </button>
        </footer>
      </section>

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            !saving && setModal(null)
          }
        >
          <section
            className="entity-modal"
            onMouseDown={event =>
              event.stopPropagation()
            }
          >
            <header>
              <div>
                <p className="entity-kicker">
                  {modal.id
                    ? 'EDITAR ALUMNO'
                    : 'NUEVO ALUMNO'}
                </p>

                <h2>
                  {modal.id
                    ? 'Editar docente'
                    : 'Registrar docente'}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={save}>
              <div className="modal-fields">
                {[
                  ['nombre', 'Nombre completo', 'text'],
                  ['correo', 'Correo electrónico', 'email'],
                  ['especialidad', 'Especialidad', 'text'],
                  ['cursos', 'Cantidad de cursos', 'number'],
                ].map(([key, label, type]) => (
                  <label key={key}>
                    {label}
                    <input
                      type={type}
                      value={modal[key] ?? ''}
                      onChange={event =>
                        setModal(prev => ({
                          ...prev,
                          [key]: key === 'cursos'
                            ? event.target.value === '' ? '' : Number(event.target.value)
                            : event.target.value,
                        }))
                      }
                      required
                      min={key === 'cursos' ? 0 : undefined}
                      max={key === 'cursos' ? 100 : undefined}
                      step={key === 'cursos' ? 1 : undefined}
                      maxLength={key === 'cursos' ? undefined : 120}
                    />
                  </label>
                ))}

                <label>
                  Jornada
                  <select
                    value={modal.jornada}
                    onChange={event =>
                      setModal(prev => ({ ...prev, jornada: event.target.value }))
                    }
                  >
                    <option>Diurna</option>
                    <option>Vespertina</option>
                    <option>Mixta</option>
                  </select>
                </label>

                <label>
                  Estado

                  <select
                    value={modal.estado}
                    onChange={event =>
                      setModal(prev => ({
                        ...prev,
                        estado: event.target.value,
                      }))
                    }
                  >
                    <option>Activo</option>
                    <option>Inactivo</option>
                    <option>Pendiente</option>
                  </select>
                </label>
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setModal(null)}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-action"
                  disabled={saving}
                >
                  {saving
                    ? 'Guardando…'
                    : modal.id
                      ? 'Guardar cambios'
                      : 'Registrar docente'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

