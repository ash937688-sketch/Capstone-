
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Download,
  Users,
  CheckCircle2,
  AlertTriangle,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const emptyForm = {
  nombre: '',
  rut: '',
  correo: '',
  carrera: '',
  sede: '',
  estado: 'Activo',
}

const columns = [
  'Alumno',
  'RUT',
  'Carrera / Curso',
  'Sede',
  'Correo',
  'Estado',
]

export default function Alumnos() {
  const { token, user } = useAuth()

  const [alumnos, setAlumnos] = useState([])
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
      const result = await request('/api/alumnos')
      setAlumnos(result.alumnos || [])
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
    return alumnos.filter(alumno =>
      [
        alumno.nombre,
        alumno.rut,
        alumno.carrera,
        alumno.sede,
        alumno.correo,
        alumno.estado,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  }, [alumnos, query])

  const save = async event => {
    event.preventDefault()

    if (!modal || saving) return

    setSaving(true)
    setError('')

    try {
      const { id, ...data } = modal

      await request(
        id ? `/api/alumnos/${id}` : '/api/alumnos',
        {
          method: id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      )

      setModal(null)

      setNotice(
        id
          ? 'Alumno actualizado correctamente.'
          : 'Alumno registrado en Firestore.'
      )

      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async alumno => {
    if (
      !window.confirm(
        `¿Eliminar a ${alumno.nombre}? Esta acción no se puede deshacer.`
      )
    ) {
      return
    }

    setError('')

    try {
      await request(`/api/alumnos/${alumno.id}`, {
        method: 'DELETE',
      })

      setNotice('Alumno eliminado correctamente.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const exportCsv = () => {
    const data = [
      columns,
      ...filtered.map(a => [
        a.nombre,
        a.rut,
        a.carrera,
        a.sede,
        a.correo,
        a.estado,
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
    anchor.download = 'alumnos-asistia.csv'
    anchor.click()

    URL.revokeObjectURL(url)
  }

  const active = alumnos.filter(
    a => a.estado === 'Activo'
  ).length

  const seguimiento = alumnos.filter(
    a => a.estado === 'Seguimiento'
  ).length

  const sedes = new Set(
    alumnos.map(a => a.sede).filter(Boolean)
  ).size

  const stats = [
    [
      'Total alumnos',
      alumnos.length,
      'Registros en Firestore',
      'blue',
      Users,
    ],
    [
      'Activos',
      active,
      'Alumnos activos',
      'green',
      CheckCircle2,
    ],
    [
      'Seguimiento',
      seguimiento,
      'Requieren seguimiento',
      'orange',
      AlertTriangle,
    ],
    [
      'Sedes',
      sedes,
      'Sedes registradas',
      'purple',
      Users,
    ],
  ]

  return (
    <div className="entity-page">
      <header className="entity-header">
        <div>
          <p className="entity-kicker">
            GESTIÓN ACADÉMICA
          </p>

          <h1>Alumnos</h1>

          <p>
            Gestión de estudiantes registrados
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
              Nuevo alumno
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
          role="alert"
          style={{ color: '#b42318' }}
        >
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
            <h2>Alumnos registrados</h2>

            <span>
              {alumnos.length} registros reales
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
                placeholder="Buscar alumno…"
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
              {filtered.map(alumno => (
                <tr key={alumno.id}>
                  <td>
                    <div className="entity-name">
                      <span>
                        {alumno.nombre
                          .split(' ')
                          .map(p => p[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </span>

                      <strong>
                        {alumno.nombre}
                      </strong>
                    </div>
                  </td>

                  <td>{alumno.rut}</td>
                  <td>{alumno.carrera}</td>
                  <td>{alumno.sede}</td>

                  <td>
                    {alumno.correo || '—'}
                  </td>

                  <td>
                    <span
                      className={`entity-status ${
                        alumno.estado === 'Activo'
                          ? 'status-green'
                          : alumno.estado === 'Seguimiento'
                            ? 'status-orange'
                            : 'status-red'
                      }`}
                    >
                      {alumno.estado}
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
                            setModal({ ...alumno })
                          }}
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() =>
                            remove(alumno)
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
              Cargando alumnos desde Firestore…
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty-search">
              {query
                ? 'No se encontraron alumnos.'
                : 'Todavía no hay alumnos registrados. Crea el primero.'}
            </div>
          )}
        </div>

        <footer className="data-footer">
          <span>
            Mostrando {filtered.length} de{' '}
            {alumnos.length} alumnos
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
                    ? 'Editar alumno'
                    : 'Registrar alumno'}
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
                  ['nombre', 'Nombre completo'],
                  ['rut', 'RUT'],
                  ['correo', 'Correo (opcional)'],
                  ['carrera', 'Carrera / Curso'],
                  ['sede', 'Sede'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}

                    <input
                      value={modal[key] || ''}
                      onChange={event =>
                        setModal(prev => ({
                          ...prev,
                          [key]: event.target.value,
                        }))
                      }
                      required={key !== 'correo'}
                      maxLength={
                        key === 'rut' ? 20 : 120
                      }
                    />
                  </label>
                ))}

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
                    <option>Seguimiento</option>
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
                      : 'Registrar alumno'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
